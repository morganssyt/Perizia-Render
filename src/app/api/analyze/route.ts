/**
 * /api/analyze — PDF extraction via Anthropic Claude.
 *
 * Pipeline:
 *  1. Accept FormData PDF
 *  2. Extract text per-page  (extractPdfPages — 2-engine: pdf-parse custom + default)
 *  3. Rank + select relevant pages (rankPages + selectPages — anti-cover/copyright)
 *  4. Build anchored text ("--- PAGE N ---" format)
 *  5. client.messages.create (claude-haiku-4-5-20251001)
 *  6. Validate JSON with Zod
 */

export const maxDuration = 60;
export const dynamic     = 'force-dynamic';
export const runtime     = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { extractPdfPages } from '@/lib/extract-pdf-pages';
import { rankPages, selectPages } from '@/lib/rank-pages';

// ---------------------------------------------------------------------------
// Staging flag — expose pdfDebug in preview/staging, never in production
// ---------------------------------------------------------------------------

const IS_STAGING =
  process.env.VERCEL_ENV === 'preview' ||
  process.env.VERCEL_ENV === 'development' ||
  process.env.STAGING   === 'true';

// ---------------------------------------------------------------------------
// Exported types
// ---------------------------------------------------------------------------

export interface Meta {
  analysis_mode:      'text' | 'vision_ocr_2pass' | 'pdf_direct';
  total_pages:        number;
  pages_analyzed:     number;
  pages_list?:        number[];
  reason_for_vision?: string;
  notes?:             string;
  debugDocId?:        string;
}

export interface PageRenderDebug {
  page: number; bytes: number; width: number; height: number;
  whiteness: number; isBlank: boolean; renderError?: string;
}

export interface OcrPageDebug {
  page: number; chars: number; preview: string;
  status: 'ok' | 'empty' | 'skipped_blank' | 'rate_limited' | 'error';
  rawModelOutput?: string;
}

export interface DebugInfo {
  totalPages: number; totalChars: number;
  charsPerPage: Array<{ page: number; chars: number }>;
  textCoverage: number; isScanDetected: boolean;
  hitsPerCategory: Record<string, number>;
  first2000chars: string; last2000chars: string;
  promptPayloadLength: number;
  textQualityReason?: string;
  textQualityMetrics?: { len: number; avgCharsPerPage: number; repetitionScore: number; watermarkHits: number; uniqueTokenRatio: number };
  renderMethod?: string; renderScale?: number; renderJpegQuality?: number;
  renderPages?: PageRenderDebug[]; blankPageCount?: number; nonBlankPageCount?: number;
  ocrMethod?: string; ocrPages?: OcrPageDebug[]; ocrAvgChars?: number;
  ocrEscalated?: boolean; expansionPages?: number[];
  reasonForVision?: string; visionPagesAnalyzed?: number[]; imagesRendered?: number;
  /** extraction engine used */
  extractionEngine?: string;
  /** error from extractPdfPages when engine = 'failed' */
  extractionError?: string;
}

export interface Evidence {
  usedPages: number[];
  pageSnippets: { page: number; snippet: string }[];
  extractionStats: {
    totalPages: number;
    totalTextLen: number;
    usedTextLen: number;
    penalizedPages: { page: number; reason: string }[];
  };
}

interface Citation  { page: number; snippet: string; keyword?: string; }
interface Candidate { value: string; confidence: number; citations: Citation[]; explanation?: string; }
interface FieldResult { status: 'found' | 'not_found' | 'scan_detected'; confidence: number; citations: Citation[]; candidates: Candidate[]; }

export type AnalysisResult = {
  valore_perito:    FieldResult & { value:   string | null };
  atti_antecedenti: FieldResult & { summary: string | null };
  costi_oneri:      FieldResult & { summary: string | null };
  difformita:       FieldResult & { summary: string | null };
  riassunto: { paragrafo1: string; paragrafo2: string; paragrafo3: string };
  debug: DebugInfo;
  meta:  Meta;
  evidence?: Evidence;
};

/** Returned only in STAGING (VERCEL_ENV=preview or STAGING=true). Never in production. */
export interface PdfDebugInfo {
  ok:                  boolean;
  fileBytes:           number;
  magic:               string;
  pdfPages:            number;
  extractedTextLength: number;
  extractionEngine:    string;
  error?:              string;
}

// ---------------------------------------------------------------------------
// Zod schema — Claude output format (unchanged)
// ---------------------------------------------------------------------------

const FieldBase = z.object({
  status:     z.enum(['found', 'not_found']),
  confidence: z.number().min(0).max(1).default(0.5),
});

const Schema = z.object({
  valore_perito:    FieldBase.extend({ value:   z.string().nullable() }),
  atti_antecedenti: FieldBase.extend({ summary: z.string().nullable() }),
  costi_oneri:      FieldBase.extend({ summary: z.string().nullable() }),
  difformita:       FieldBase.extend({ summary: z.string().nullable() }),
  riassunto: z.object({ paragrafo1: z.string(), paragrafo2: z.string(), paragrafo3: z.string() }),
});

// ---------------------------------------------------------------------------
// System prompt (unchanged)
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are a legal real estate auction analyst.
Extract structured data from the provided Italian perizia immobiliare text.

Return STRICT JSON — no markdown, no extra keys:

{
  "valore_perito":    { "status": "found"|"not_found", "value": "<monetary>"|null, "confidence": <0-1> },
  "atti_antecedenti": { "status": "found"|"not_found", "summary": "<text>"|null,   "confidence": <0-1> },
  "costi_oneri":      { "status": "found"|"not_found", "summary": "<text>"|null,   "confidence": <0-1> },
  "difformita":       { "status": "found"|"not_found", "summary": "<text>"|null,   "confidence": <0-1> },
  "riassunto": { "paragrafo1": "<string>", "paragrafo2": "<string>", "paragrafo3": "<string>" }
}

Rules:
- confidence: 1.0=clear, 0.7=partial, 0.4=uncertain
- if not_found → value/summary must be null
- valore_perito.value format: "€ 250.000,00"
- riassunto: professional, concise, 3 paragraphs
- ignore watermarks: "Pubblicazione ufficiale", "ASTE GIUDIZIARIE", page numbers
- Output ONLY the JSON object, no markdown fences, no explanation before or after`;

// ---------------------------------------------------------------------------
// Retry on 429
// ---------------------------------------------------------------------------

async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3, baseDelayMs = 2000): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try { return await fn(); }
    catch (err) {
      if (attempt === maxRetries) throw err;
      const isRL = err instanceof Anthropic.APIError && err.status === 429;
      if (!isRL) throw err;
      await new Promise(r => setTimeout(r, Math.min(baseDelayMs * Math.pow(2, attempt), 32_000)));
    }
  }
  throw new Error('unreachable');
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_BYTES      = (parseInt(process.env.MAX_PDF_MB        ?? '15',    10) || 15)    * 1024 * 1024;
const LLM_TIMEOUT_MS =  parseInt(process.env.ANALYZE_TIMEOUT_MS ?? '50000', 10) || 50_000;
const MAX_TEXT_CHARS = 80_000;
const MODEL          = 'claude-haiku-4-5-20251001';

function makeId() { return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`; }

function err(requestId: string, message: string, status: number, extra?: Record<string, unknown>) {
  console.error(`[analyze][${requestId}] ${status} — ${message}`, extra ?? '');
  return NextResponse.json({ requestId, error: message, ...extra }, { status });
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  const requestId = makeId();
  const t0 = Date.now();
  console.log(`[analyze][${requestId}] START`);
  try {
    return await handleRequest(req, requestId, t0);
  } catch (e) {
    console.error(`[analyze][${requestId}] UNHANDLED`, e);
    return NextResponse.json({ requestId, error: 'Errore interno del server.', detail: String(e) }, { status: 500 });
  }
}

async function handleRequest(req: NextRequest, requestId: string, t0: number): Promise<NextResponse> {

  if (!process.env.ANTHROPIC_API_KEY) {
    return err(requestId, 'ANTHROPIC_API_KEY mancante — configura la variabile d\'ambiente sul server.', 400);
  }

  // ── FormData ──────────────────────────────────────────────────────────────
  let formData: FormData;
  try { formData = await req.formData(); }
  catch (e) { return err(requestId, 'Impossibile leggere il form.', 400, { detail: String(e) }); }

  const file = formData.get('file') as File | null;
  if (!file) return err(requestId, 'Nessun file nel form (campo "file" mancante).', 400);

  if (file.size > MAX_BYTES) {
    return err(requestId, `File troppo grande: ${(file.size/1024/1024).toFixed(1)} MB (limite ${Math.round(MAX_BYTES/1024/1024)} MB).`, 413);
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  const magic      = buffer.slice(0, 8).toString('hex');
  const magicAscii = buffer.slice(0, 5).toString('ascii');
  console.log(
    `[analyze][${requestId}] file="${file.name}" size=${file.size}B ` +
    `magic="${magicAscii}" (${magic}) (+${Date.now()-t0}ms)`,
  );

  // ── Per-page extraction ──────────────────────────────────────────────────
  const extracted = await extractPdfPages(buffer);
  const { totalPages, pages, engine: extractionEngine, error: extractionError } = extracted;

  const totalTextLen = pages.reduce((acc, p) => acc + p.text.trim().length, 0);

  console.log(
    `[analyze][${requestId}] extraction: engine=${extractionEngine} ` +
    `totalPages=${totalPages} pageCount=${pages.length} totalTextLen=${totalTextLen} ` +
    `(+${Date.now()-t0}ms)` +
    (extractionError ? ` ERROR: ${extractionError}` : ''),
  );

  // ── Fail-fast: scan / protected PDF ──────────────────────────────────────
  if (totalTextLen < 300) {
    console.error(
      `[analyze][${requestId}] FAIL-FAST totalTextLen=${totalTextLen} — ` +
      `PDF probabilmente scannerizzato o protetto`,
    );
    return err(
      requestId,
      'PDF probabilmente scannerizzato o protetto — testo non leggibile.',
      422,
      {
        detail: `Estratti ${totalTextLen} caratteri totali su ${totalPages} pagine. ` +
                `Il PDF non contiene testo selezionabile.`,
      },
    );
  }

  // ── Rank + select pages ──────────────────────────────────────────────────
  const scored           = rankPages(pages);
  const selectedPageNums = selectPages(scored, totalPages);
  const pagesMap         = Object.fromEntries(pages.map((p) => [p.page, p]));
  const penalizedPages   = scored
    .filter((s) => s.penalized)
    .map((s) => ({ page: s.page, reason: s.penaltyReason ?? 'unknown' }));

  const usedTextLen = selectedPageNums.reduce(
    (acc, pg) => acc + (pagesMap[pg]?.text.trim().length ?? 0), 0,
  );

  console.log(
    `[analyze][${requestId}] ranking: selected=[${selectedPageNums.join(',')}] ` +
    `usedTextLen=${usedTextLen} ` +
    `penalized=[${penalizedPages.map((p) => `p${p.page}:${p.reason}`).join(',') || 'none'}]`,
  );

  if (usedTextLen < 300) {
    console.error(
      `[analyze][${requestId}] FAIL-FAST usedTextLen=${usedTextLen} — testo rilevante insufficiente`,
    );
    return err(
      requestId,
      'Testo rilevante insufficiente — il PDF potrebbe contenere solo copertina o copyright.',
      422,
      {
        detail: `Estratti ${usedTextLen} caratteri utili su ${selectedPageNums.length} ` +
                `pagine selezionate (${totalTextLen} totali).`,
      },
    );
  }

  // ── Build anchored text (--- PAGE N --- format) ──────────────────────────
  let anchoredText = selectedPageNums
    .map((pg) => `--- PAGE ${pg} ---\n${pagesMap[pg]?.text ?? ''}`)
    .join('\n\n');

  if (anchoredText.length > MAX_TEXT_CHARS) {
    anchoredText = anchoredText.slice(0, MAX_TEXT_CHARS);
  }

  const userMsg = `Analizza questa perizia immobiliare (testo estratto per pagina):\n\n${anchoredText}`;

  // ── Claude messages.create ────────────────────────────────────────────────
  const client = new Anthropic({
    apiKey:  process.env.ANTHROPIC_API_KEY.trim(),
    timeout: LLM_TIMEOUT_MS,
  });

  let rawText = '';
  try {
    console.log(
      `[analyze][${requestId}] messages.create model=${MODEL} ` +
      `pages=${selectedPageNums.length} promptLen=${userMsg.length}`,
    );

    const response = await withRetry(() =>
      client.messages.create({
        model:       MODEL,
        max_tokens:  2048,
        temperature: 0,
        system:      SYSTEM_PROMPT,
        messages:    [{ role: 'user', content: userMsg }],
      })
    );

    rawText = response.content[0]?.type === 'text' ? response.content[0].text : '';
    console.log(
      `[analyze][${requestId}] done rawText.length=${rawText.length} ` +
      `stop=${response.stop_reason} (+${Date.now()-t0}ms)`,
    );
  } catch (e) {
    const isAborted = e instanceof Error && (e.name === 'AbortError' || e.name === 'APIConnectionTimeoutError');
    const isRL      = e instanceof Anthropic.APIError && e.status === 429;
    const detail    = e instanceof Anthropic.APIError ? `Anthropic ${e.status}: ${e.message}` : String(e);
    if (isAborted) return err(requestId, `Timeout: nessuna risposta entro ${LLM_TIMEOUT_MS/1000}s.`, 504, { detail });
    if (isRL)      return err(requestId, 'Rate limit. Riprova tra un minuto.', 429, { detail });
    return err(requestId, `Errore Claude: ${detail}`, 502, { detail });
  }

  if (!rawText.trim()) return err(requestId, 'Risposta Claude vuota. Riprova.', 502);

  // Strip possible markdown fences that Claude may add despite instructions
  const jsonText = rawText.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');

  // ── Parse + Validate ──────────────────────────────────────────────────────
  let parsed: unknown;
  try { parsed = JSON.parse(jsonText); }
  catch { return err(requestId, 'Risposta Claude non era JSON valido.', 502, { raw: jsonText.slice(0, 500) }); }

  const v = Schema.safeParse(parsed);
  if (!v.success) return err(requestId, 'Schema JSON non valido.', 502, { issues: v.error.issues, raw: parsed });

  const data = v.data;

  // ── Build response ────────────────────────────────────────────────────────
  const avgCharsPerPage = totalPages > 0 ? Math.round(totalTextLen / totalPages) : 0;

  const debug: DebugInfo = {
    totalPages,
    totalChars:          totalTextLen,
    charsPerPage:        pages.map((p) => ({ page: p.page, chars: p.text.length })),
    textCoverage:        avgCharsPerPage,
    isScanDetected:      false,
    hitsPerCategory:     {},
    first2000chars:      anchoredText.slice(0, 2000),
    last2000chars:       anchoredText.slice(-2000),
    promptPayloadLength: userMsg.length,
    extractionEngine,
    extractionError,
  };

  const evidence: Evidence = {
    usedPages:    selectedPageNums,
    pageSnippets: selectedPageNums.map((pg) => ({
      page:    pg,
      snippet: (pagesMap[pg]?.text ?? '').slice(0, 500),
    })),
    extractionStats: {
      totalPages,
      totalTextLen,
      usedTextLen,
      penalizedPages,
    },
  };

  const meta: Meta = {
    analysis_mode:  'pdf_direct',
    total_pages:    totalPages,
    pages_analyzed: selectedPageNums.length,
    pages_list:     selectedPageNums,
    notes:          `Claude ${MODEL} · ${selectedPageNums.length}/${totalPages} pag.`,
  };

  const result: AnalysisResult = {
    valore_perito:    { ...data.valore_perito,    citations: [], candidates: [] },
    atti_antecedenti: { ...data.atti_antecedenti, citations: [], candidates: [] },
    costi_oneri:      { ...data.costi_oneri,      citations: [], candidates: [] },
    difformita:       { ...data.difformita,        citations: [], candidates: [] },
    riassunto:        data.riassunto,
    debug, meta, evidence,
  };

  // ── Staging: include pdfDebug for diagnostics (never in production) ────────
  const pdfDebug: PdfDebugInfo | undefined = IS_STAGING ? {
    ok:                  extractionEngine !== 'failed',
    fileBytes:           file.size,
    magic:               magicAscii,
    pdfPages:            totalPages,
    extractedTextLength: totalTextLen,
    extractionEngine,
    error:               extractionError,
  } : undefined;

  console.log(`[analyze][${requestId}] OK total=${Date.now()-t0}ms staging=${IS_STAGING}`);
  return NextResponse.json({ requestId, ...result, ...(pdfDebug && { pdfDebug }) });
}
