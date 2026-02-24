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
import { removeWatermarkLines } from '@/lib/watermark';

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
  /** Data quality gate (present in all new responses) */
  has_text_layer?: boolean;
  vision_used?: boolean;
  extracted_chars_text_layer?: number;
  final_chars_sent_to_llm?: number;
  data_quality_score?: number;
  data_quality_reason?: string;
}

// ── Resoconto completo types ────────────────────────────────────────────────

export interface ResocontoField {
  trovato: boolean;
  valore: string | null;
  cosa_dice: string | null;
  cosa_significa: string | null;
  estratto: string | null;
  pagina_rif: string | null;
  confidenza: 'Alta' | 'Media' | 'Bassa';
}

export interface ResocontoCompleto {
  identificazione: ResocontoField;
  dati_catastali: ResocontoField;
  superfici: ResocontoField;
  titolarita: ResocontoField;
  vincoli_ipoteche: ResocontoField;
  stato_occupativo: ResocontoField;
  conformita: ResocontoField;
  stato_manutentivo: ResocontoField;
  spese_condominio: ResocontoField;
  valutazione: ResocontoField;
  rischi: Array<{ descrizione: string; severita: 'Alta' | 'Media' | 'Bassa'; cosa_significa: string }>;
  checklist: string[];
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
  resoconto_completo?: ResocontoCompleto;
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

const ResocontoFieldZ = z.object({
  trovato:        z.boolean().default(false),
  valore:         z.string().nullable().default(null),
  cosa_dice:      z.string().nullable().default(null),
  cosa_significa: z.string().nullable().default(null),
  estratto:       z.string().nullable().default(null),
  pagina_rif:     z.string().nullable().default(null),
  confidenza:     z.enum(['Alta', 'Media', 'Bassa']).default('Media'),
});

const Schema = z.object({
  valore_perito:    FieldBase.extend({ value:   z.string().nullable() }),
  atti_antecedenti: FieldBase.extend({ summary: z.string().nullable() }),
  costi_oneri:      FieldBase.extend({ summary: z.string().nullable() }),
  difformita:       FieldBase.extend({ summary: z.string().nullable() }),
  riassunto: z.object({ paragrafo1: z.string(), paragrafo2: z.string(), paragrafo3: z.string() }),
  resoconto: z.object({
    identificazione:  ResocontoFieldZ,
    dati_catastali:   ResocontoFieldZ,
    superfici:        ResocontoFieldZ,
    titolarita:       ResocontoFieldZ,
    vincoli_ipoteche: ResocontoFieldZ,
    stato_occupativo: ResocontoFieldZ,
    conformita:       ResocontoFieldZ,
    stato_manutentivo: ResocontoFieldZ,
    spese_condominio: ResocontoFieldZ,
    valutazione:      ResocontoFieldZ,
    rischi: z.array(z.object({
      descrizione:    z.string(),
      severita:       z.enum(['Alta', 'Media', 'Bassa']),
      cosa_significa: z.string(),
    })).default([]),
    checklist: z.array(z.string()).default([]),
  }).optional(),
});

// ---------------------------------------------------------------------------
// System prompt (unchanged)
// ---------------------------------------------------------------------------

// Each resoconto section uses: {trovato, valore, cosa_dice, cosa_significa, estratto, pagina_rif, confidenza}
// Omitted from prompt for brevity — kept in RESOCONTO_SECTION_SCHEMA for reference
const _RESOCONTO_SECTION_SCHEMA = '{"trovato":bool,"valore":"...or null","cosa_dice":"...or null","cosa_significa":"...or null","estratto":"verbatim ≤25 words or null","pagina_rif":"Pagina X or null","confidenza":"Alta|Media|Bassa"}';

const SYSTEM_PROMPT = `You are a legal real estate auction analyst specializing in Italian perizia immobiliare documents.
IGNORE WATERMARKS: skip all lines with "Portale delle Vendite Pubbliche", "Pubblicazione Ufficiale", "Ministero della Giustizia", "ASTE GIUDIZIARIE", "pvp.giustizia.it".

Output ONLY a single JSON object (no markdown, no extra text):

{
  "valore_perito":    {"status":"found|not_found","value":"€ 250.000,00 or null","confidence":0.0-1.0},
  "atti_antecedenti": {"status":"found|not_found","summary":"text or null","confidence":0.0-1.0},
  "costi_oneri":      {"status":"found|not_found","summary":"text or null","confidence":0.0-1.0},
  "difformita":       {"status":"found|not_found","summary":"text or null","confidence":0.0-1.0},
  "riassunto":        {"paragrafo1":"property & value","paragrafo2":"risks & costs","paragrafo3":"acts & actions"},
  "resoconto": {
    "identificazione":   {"trovato":true|false,"valore":"tipo, indirizzo, comune","cosa_dice":"max 2 frasi","cosa_significa":"max 1 frase","estratto":"max 25 parole verbatim","pagina_rif":"Pagina X","confidenza":"Alta|Media|Bassa"},
    "dati_catastali":    {"trovato":true|false,"valore":"foglio/particella/sub/cat/rendita","cosa_dice":null,"cosa_significa":null,"estratto":"max 25 parole verbatim","pagina_rif":"Pagina X","confidenza":"Alta|Media|Bassa"},
    "superfici":         {"trovato":true|false,"valore":"comm/catastale/utile mq","cosa_dice":null,"cosa_significa":null,"estratto":null,"pagina_rif":null,"confidenza":"Alta|Media|Bassa"},
    "titolarita":        {"trovato":true|false,"valore":"intestatario e quota","cosa_dice":null,"cosa_significa":null,"estratto":null,"pagina_rif":null,"confidenza":"Alta|Media|Bassa"},
    "vincoli_ipoteche":  {"trovato":true|false,"valore":"ipoteche/pignoramenti/servitù","cosa_dice":"max 2 frasi","cosa_significa":"max 1 frase","estratto":null,"pagina_rif":null,"confidenza":"Alta|Media|Bassa"},
    "stato_occupativo":  {"trovato":true|false,"valore":"libero/occupato/contratto","cosa_dice":null,"cosa_significa":null,"estratto":null,"pagina_rif":null,"confidenza":"Alta|Media|Bassa"},
    "conformita":        {"trovato":true|false,"valore":"conforme/difformità/abusi","cosa_dice":"max 2 frasi","cosa_significa":"max 1 frase","estratto":null,"pagina_rif":null,"confidenza":"Alta|Media|Bassa"},
    "stato_manutentivo": {"trovato":true|false,"valore":"condizioni/impianti/energia","cosa_dice":null,"cosa_significa":null,"estratto":null,"pagina_rif":null,"confidenza":"Alta|Media|Bassa"},
    "spese_condominio":  {"trovato":true|false,"valore":"spese/arretrati importi","cosa_dice":null,"cosa_significa":null,"estratto":null,"pagina_rif":null,"confidenza":"Alta|Media|Bassa"},
    "valutazione":       {"trovato":true|false,"valore":"valore stima/base asta","cosa_dice":"max 2 frasi","cosa_significa":"max 1 frase","estratto":"max 25 parole verbatim","pagina_rif":"Pagina X","confidenza":"Alta|Media|Bassa"},
    "rischi":    [{"descrizione":"rischio breve","severita":"Alta|Media|Bassa","cosa_significa":"1 frase semplice per compratore"}],
    "checklist": ["verifica 1","verifica 2"]
  }
}

Rules:
- confidence: 1.0=explicit, 0.7=inferred, 0.4=uncertain
- if not found → set trovato=false, all text fields null
- riassunto: 3 professional Italian paragraphs
- rischi: max 5, sorted Alta→Bassa; cosa_significa in plain Italian for a non-expert buyer
- checklist: 8-12 concrete pre-bid verification steps
- cosa_dice/cosa_significa: null for sections where they add no value (dati catastali, superfici)
- estratto: verbatim words from the source text, max 25 words, null if not applicable`;

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
// Data quality gate — score 0-100 based on extraction results + text quality
// ---------------------------------------------------------------------------

function computeDataQualityScore(
  data: z.infer<typeof Schema>,
  finalCharsToLlm: number,
  hasTextLayer: boolean,
): { score: number; reason: string } {
  const reasons: string[] = [];
  let score = 0;

  // Valore trovato (25 pts)
  if (data.valore_perito.status === 'found' && data.valore_perito.value) {
    score += 25;
    reasons.push(`valore=${data.valore_perito.value.slice(0, 20)}`);
  }

  // Other fields found (10 pts each, max 30)
  const othersFound = [data.atti_antecedenti, data.costi_oneri, data.difformita]
    .filter(f => f.status === 'found').length;
  score += othersFound * 10;
  if (othersFound > 0) reasons.push(`${othersFound} altri campi`);

  // Summary quality (max 15 pts)
  const summaryLen = (
    data.riassunto.paragrafo1 + data.riassunto.paragrafo2 + data.riassunto.paragrafo3
  ).length;
  const summaryPts = summaryLen > 600 ? 15 : summaryLen > 300 ? 10 : summaryLen > 100 ? 5 : 0;
  score += summaryPts;
  if (summaryPts > 0) reasons.push(`riassunto ${summaryLen}c`);

  // Average confidence (max 15 pts)
  const avgConf = (
    data.valore_perito.confidence + data.atti_antecedenti.confidence +
    data.costi_oneri.confidence + data.difformita.confidence
  ) / 4;
  score += Math.round(avgConf * 15);

  // Chars sent to LLM (max 10 pts)
  const charsPts = finalCharsToLlm > 8000 ? 10 : finalCharsToLlm > 3000 ? 6 : finalCharsToLlm > 500 ? 3 : 0;
  score += charsPts;

  // Native text layer bonus (5 pts)
  if (hasTextLayer) { score += 5; reasons.push('strato testo nativo'); }

  return {
    score: Math.min(100, score),
    reason: reasons.length > 0 ? reasons.join('; ') : 'dati insufficienti',
  };
}

// ---------------------------------------------------------------------------
// Real-content entity scoring (detects watermark-only text)
// ---------------------------------------------------------------------------

const ENTITY_PATTERNS_SCORE: RegExp[] = [
  /\bfoglio\b/i, /\bparticella\b/i, /\bsubalterno\b/i, /\bcatasto\b/i, /\bmappale\b/i,
  /€\s*[\d.,]+/,               // monetary values
  /\d+[.,]\d+\s*m[q²2]/i,     // surface area
  /\bstima\b/i, /\bvalore\b/i, /\bperito\b|\bctu\b/i,
  /\bsuperficie\b/i, /\bdescriz/i, /\bpremessa\b/i,
  /\bcomune\s+di\b/i, /\bvia\s+\w+\s+\d+/i,
  /\bprocedura\s+esecutiva\b/i, /\boneri\b/i, /\bcondomin/i,
];

function scoreRealContent(pageTexts: string[]): number {
  const fullText = pageTexts.join('\n');
  let score = 0;
  for (const re of ENTITY_PATTERNS_SCORE) {
    if (re.test(fullText)) score++;
  }
  const digits = (fullText.match(/\d/g) ?? []).length;
  const numericDensity = fullText.length > 0 ? digits / fullText.length : 0;
  return score + (numericDensity > 0.04 ? 2 : 0);
}

// ---------------------------------------------------------------------------
// Claude PDF Vision fallback
// Sends the raw PDF buffer as a base64 document directly to Claude.
// Used when the text layer contains only watermark/header text.
// ---------------------------------------------------------------------------

async function handleWithPdfVision(
  client:     Anthropic,
  buffer:     Buffer,
  requestId:  string,
  t0:         number,
  totalPages: number,
  extractionEngine: string,
  extractedCharsTextLayer: number = 0,
): Promise<NextResponse> {
  console.log(
    `[analyze][${requestId}] PDF vision fallback: ` +
    `sending ${(buffer.length / 1024).toFixed(0)}KB PDF directly to Claude`,
  );

  let rawText = '';
  try {
    const pdfBase64 = buffer.toString('base64');
    const response = await withRetry(() =>
      client.messages.create({
        model:       MODEL,
        max_tokens:  MAX_TOKENS,
        temperature: 0,
        system:      SYSTEM_PROMPT,
        messages: [{
          role: 'user',
          content: [
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            {
              type: 'document',
              source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 },
            } as any,
            {
              type: 'text',
              text: (
                'Analizza questa perizia immobiliare. ' +
                'Ignora completamente: "Portale Vendite Pubbliche", "Pubblicazione Ufficiale", ' +
                '"Ministero della Giustizia", "ASTE GIUDIZIARIE", pvp.giustizia.it, ' +
                'e qualsiasi watermark ripetuto. ' +
                'Estrai SOLO il contenuto reale della perizia.'
              ),
            },
          ],
        }],
      })
    );
    rawText = response.content[0]?.type === 'text' ? response.content[0].text : '';
    console.log(
      `[analyze][${requestId}] PDF vision done rawTextLen=${rawText.length} (+${Date.now()-t0}ms)`,
    );
  } catch (e) {
    const detail = e instanceof Anthropic.APIError
      ? `Anthropic ${e.status}: ${e.message}`
      : String(e);
    console.error(`[analyze][${requestId}] PDF vision error:`, detail);
    return err(
      requestId,
      'Impossibile analizzare il PDF: documento scansionato senza testo leggibile, ' +
      'oppure il file è troppo grande o protetto.',
      422,
      { detail, hint: 'Carica un PDF con testo selezionabile, oppure usa la pipeline con Textract.' },
    );
  }

  if (!rawText.trim()) {
    return err(requestId, 'Claude PDF vision: risposta vuota. Riprova.', 502);
  }

  const jsonText = rawText.trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '');

  // Log first 300 chars of what Claude returned for diagnosability
  console.log(`[analyze][${requestId}] PDF vision jsonText[0..300]: ${jsonText.slice(0, 300)}`);
  console.log(`[analyze][${requestId}] PDF vision jsonText[-200..]: ${jsonText.slice(-200)}`);

  let parsed: unknown;
  try { parsed = JSON.parse(jsonText); }
  catch (parseErr) {
    // Attempt to recover truncated JSON: strip resoconto and try just the first 5 fields
    const truncIdx = jsonText.lastIndexOf('"riassunto"');
    if (truncIdx > 0) {
      // Find the end of riassunto object by scanning for matching braces
      let depth = 0; let endIdx = -1;
      for (let i = truncIdx; i < jsonText.length; i++) {
        if (jsonText[i] === '{') depth++;
        else if (jsonText[i] === '}') { depth--; if (depth === 0) { endIdx = i; break; } }
      }
      if (endIdx > 0) {
        const fixedJson = jsonText.slice(0, endIdx + 1) + '}';
        try { parsed = JSON.parse(fixedJson); console.log(`[analyze][${requestId}] JSON truncation repaired`); }
        catch { /* fall through to error */ }
      }
    }
    if (!parsed) {
      console.error(`[analyze][${requestId}] JSON parse failed: ${String(parseErr)} | raw[-300]: ${jsonText.slice(-300)}`);
      return err(requestId, 'Risposta Claude PDF vision non è JSON valido.', 502, {
        raw: jsonText.slice(0, 500), tail: jsonText.slice(-200),
      });
    }
  }

  const v = Schema.safeParse(parsed);
  if (!v.success) {
    return err(requestId, 'Schema JSON non valido (PDF vision).', 502, {
      issues: v.error.issues, raw: parsed,
    });
  }

  const data = v.data;

  const finalCharsVision = buffer.length; // approximate for PDF vision
  const { score: dqScore, reason: dqReason } = computeDataQualityScore(data, finalCharsVision, false);
  // isScanDetected=true only if OCR quality was too low to be useful
  const scanDetected = dqScore < 60;
  console.log(
    `[analyze][${requestId}] PDF vision quality: score=${dqScore} reason="${dqReason}" scanDetected=${scanDetected}`,
  );

  const debug: DebugInfo = {
    totalPages,
    totalChars:               buffer.length,
    charsPerPage:             [],
    textCoverage:             0,
    isScanDetected:           scanDetected,
    hitsPerCategory:          {},
    first2000chars:           '',
    last2000chars:            '',
    promptPayloadLength:      buffer.length,
    extractionEngine:         `${extractionEngine}+pdf_vision`,
    has_text_layer:           false,
    vision_used:              true,
    extracted_chars_text_layer: extractedCharsTextLayer,
    final_chars_sent_to_llm:  finalCharsVision,
    data_quality_score:       dqScore,
    data_quality_reason:      dqReason,
  };

  const meta: Meta = {
    analysis_mode:  'pdf_direct',
    total_pages:    totalPages,
    pages_analyzed: totalPages,
    notes:          `Claude ${MODEL} PDF Vision · strato testo=solo watermark, analisi visiva PDF · Q=${dqScore}`,
  };

  const result: AnalysisResult = {
    valore_perito:    { ...data.valore_perito,    citations: [], candidates: [] },
    atti_antecedenti: { ...data.atti_antecedenti, citations: [], candidates: [] },
    costi_oneri:      { ...data.costi_oneri,      citations: [], candidates: [] },
    difformita:       { ...data.difformita,        citations: [], candidates: [] },
    riassunto:        data.riassunto,
    resoconto_completo: data.resoconto as ResocontoCompleto | undefined,
    debug,
    meta,
  };

  console.log(`[analyze][${requestId}] PDF vision OK Q=${dqScore} total=${Date.now()-t0}ms`);
  return NextResponse.json({ requestId, ...result });
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_BYTES      = (parseInt(process.env.MAX_PDF_MB        ?? '15',    10) || 15)    * 1024 * 1024;
const LLM_TIMEOUT_MS =  parseInt(process.env.ANALYZE_TIMEOUT_MS ?? '50000', 10) || 50_000;
const MAX_TEXT_CHARS = 80_000;
const MAX_TOKENS     = 8192;
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

  // ── Content scoring: detect watermark-only text layer ───────────────────
  const contentScore = scoreRealContent(pages.map((p) => p.text));
  console.log(
    `[analyze][${requestId}] contentScore=${contentScore} totalTextLen=${totalTextLen}`,
  );

  // ── If text layer has no real content → Claude PDF Vision ────────────────
  // PVP portal PDFs have a text layer with only watermark text; actual perizia
  // is scanned. pdf-parse cannot read it. Claude can via document vision.
  if (totalTextLen < 300 || contentScore < 4) {
    console.log(
      `[analyze][${requestId}] Text layer is watermark-only or empty ` +
      `(score=${contentScore} textLen=${totalTextLen}) — escalating to PDF vision`,
    );
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY!.trim(), timeout: LLM_TIMEOUT_MS });
    return handleWithPdfVision(client, buffer, requestId, t0, totalPages, extractionEngine, totalTextLen);
  }

  // ── Rank + select pages ──────────────────────────────────────────────────
  const scored           = rankPages(pages);
  const selectedPageNums = selectPages(scored, totalPages);
  const pagesMap         = Object.fromEntries(pages.map((p) => [p.page, p]));
  // Only report pages that are penalized AND not actually selected for analysis
  const selectedSet      = new Set(selectedPageNums);
  const penalizedPages   = scored
    .filter((s) => s.penalized && !selectedSet.has(s.page))
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
    console.log(
      `[analyze][${requestId}] usedTextLen=${usedTextLen} too low after ranking — PDF vision fallback`,
    );
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY!.trim(), timeout: LLM_TIMEOUT_MS });
    return handleWithPdfVision(client, buffer, requestId, t0, totalPages, extractionEngine, totalTextLen);
  }

  // ── Watermark filter (run on ALL pages for accurate frequency counts) ───
  const allTexts = pages.map((p) => p.text);
  const { cleanedPages: allCleanedPages, watermarkFilteredCount, fallbackPages } = removeWatermarkLines(allTexts);
  // Map page number → cleaned text (fallback pages keep raw text)
  const cleanedPageMap = Object.fromEntries(pages.map((p, i) => [p.page, allCleanedPages[i] ?? '']));
  const cleanedScore = scoreRealContent(allCleanedPages);
  const cleanedLen   = allCleanedPages.reduce((s, p) => s + p.length, 0);
  console.log(
    `[analyze][${requestId}] watermark: filteredLines=${watermarkFilteredCount} ` +
    `fallbackPages=${fallbackPages} cleanedLen=${cleanedLen} cleanedScore=${cleanedScore}`,
  );

  // If watermark filter leaves almost nothing, escalate to PDF vision
  if (cleanedScore < 3 && cleanedLen < 1500) {
    console.log(
      `[analyze][${requestId}] After watermark filter: score=${cleanedScore} len=${cleanedLen} — ` +
      `content still too sparse, escalating to PDF vision`,
    );
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY!.trim(), timeout: LLM_TIMEOUT_MS });
    return handleWithPdfVision(client, buffer, requestId, t0, totalPages, extractionEngine, totalTextLen);
  }

  // ── Build anchored text (--- PAGE N --- format) ──────────────────────────
  let anchoredText = selectedPageNums
    .map((pg) => `--- PAGE ${pg} ---\n${cleanedPageMap[pg] ?? ''}`)
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
        max_tokens:  MAX_TOKENS,
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
  catch (parseErr) {
    // Attempt truncation repair: if resoconto was cut off, try without it
    const truncIdx = jsonText.lastIndexOf('"riassunto"');
    if (truncIdx > 0) {
      let depth = 0; let endIdx = -1;
      for (let i = truncIdx; i < jsonText.length; i++) {
        if (jsonText[i] === '{') depth++;
        else if (jsonText[i] === '}') { depth--; if (depth === 0) { endIdx = i; break; } }
      }
      if (endIdx > 0) {
        try { parsed = JSON.parse(jsonText.slice(0, endIdx + 1) + '}'); console.log(`[analyze][${requestId}] JSON truncation repaired`); }
        catch { /* fall through */ }
      }
    }
    if (!parsed) {
      console.error(`[analyze][${requestId}] JSON parse fail: ${String(parseErr)} | tail: ${jsonText.slice(-300)}`);
      return err(requestId, 'Risposta Claude non era JSON valido.', 502, { raw: jsonText.slice(0, 500) });
    }
  }

  const v = Schema.safeParse(parsed);
  if (!v.success) return err(requestId, 'Schema JSON non valido.', 502, { issues: v.error.issues, raw: parsed });

  const data = v.data;

  // ── Data quality gate ─────────────────────────────────────────────────────
  const { score: dqScore, reason: dqReason } = computeDataQualityScore(data, userMsg.length, true);
  console.log(`[analyze][${requestId}] quality: score=${dqScore} reason="${dqReason}"`);

  // ── Build response ────────────────────────────────────────────────────────
  const avgCharsPerPage = totalPages > 0 ? Math.round(totalTextLen / totalPages) : 0;

  const debug: DebugInfo = {
    totalPages,
    totalChars:                totalTextLen,
    charsPerPage:              pages.map((p) => ({ page: p.page, chars: p.text.length })),
    textCoverage:              avgCharsPerPage,
    isScanDetected:            false,
    hitsPerCategory:           {},
    first2000chars:            anchoredText.slice(0, 2000),
    last2000chars:             anchoredText.slice(-2000),
    promptPayloadLength:       userMsg.length,
    extractionEngine,
    extractionError,
    has_text_layer:            true,
    vision_used:               false,
    extracted_chars_text_layer: totalTextLen,
    final_chars_sent_to_llm:   userMsg.length,
    data_quality_score:        dqScore,
    data_quality_reason:       dqReason,
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
    notes:          `Claude ${MODEL} · ${selectedPageNums.length}/${totalPages} pag. · Q=${dqScore}`,
  };

  const result: AnalysisResult = {
    valore_perito:      { ...data.valore_perito,    citations: [], candidates: [] },
    atti_antecedenti:   { ...data.atti_antecedenti, citations: [], candidates: [] },
    costi_oneri:        { ...data.costi_oneri,      citations: [], candidates: [] },
    difformita:         { ...data.difformita,        citations: [], candidates: [] },
    riassunto:          data.riassunto,
    resoconto_completo: data.resoconto as ResocontoCompleto | undefined,
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
