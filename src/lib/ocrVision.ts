/**
 * ocrVision.ts — Vision OCR using OpenAI gpt-4o-mini.
 *
 * Key improvements over the old visionOcr.ts:
 * - Batches 2 pages per API call (5 calls instead of 10 for 10 pages)
 * - Exponential backoff retry on 429 / rate-limit errors
 * - Skips pages marked isBlank (whiteness > 0.97) to avoid BLANK responses
 * - Hard-asserts data URL format before every API call
 * - Returns OcrPage[] with status, chars, preview for debug UI
 *
 * Server-only.
 */

import OpenAI from 'openai';
import type { PageRenderResult } from './pdfRender';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface OcrPage {
  page:    number;
  text:    string;
  chars:   number;
  status:  'ok' | 'empty' | 'skipped_blank' | 'failed' | 'rate_limited';
  preview: string;           // first 300 chars
  rawModelOutput?: string;   // model output when status != 'ok', or error message
}

// ---------------------------------------------------------------------------
// OCR system prompt
// ---------------------------------------------------------------------------

const OCR_SYSTEM = `You are a precise OCR engine for Italian legal real-estate appraisal documents (perizie immobiliari).

Your ONLY task: transcribe ALL readable body text from the provided page image(s).

STRICT RULES:
1. Output PLAIN TEXT only — no markdown, no HTML, no JSON.
2. Keep the original paragraph and line-break structure.
3. IGNORE these elements (do not transcribe them):
   - Diagonal or repeated watermark text (e.g. "Pubblicazione ufficiale ad uso esclusivo personale")
   - "ASTE GIUDIZIARIE" logos / stamps
   - Page headers / footers that are repeated on every page
4. Do NOT summarize or paraphrase — copy the text verbatim.
5. If a page is genuinely blank or contains ONLY watermarks/logos, output exactly: BLANK`;

// ---------------------------------------------------------------------------
// Retry helper
// ---------------------------------------------------------------------------

/** Sleep for ms milliseconds. */
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Retry a function on OpenAI 429 / rate-limit errors.
 * Delays: 2 s, 4 s, 8 s (exponential, jittered ±20 %).
 */
async function retryOn429<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const is429 =
        (err instanceof OpenAI.APIError && err.status === 429) ||
        (err instanceof Error && err.message.includes('429'));

      if (is429 && attempt < maxRetries) {
        const baseMs = Math.pow(2, attempt + 1) * 1000; // 2 s, 4 s, 8 s
        const jitter = baseMs * (0.8 + Math.random() * 0.4); // ±20 %
        await sleep(jitter);
        continue;
      }
      throw err;
    }
  }
  // Should never reach here, but TypeScript requires a return
  throw new Error('[ocrVision] retryOn429: max retries exceeded');
}

// ---------------------------------------------------------------------------
// Batch response parser
// ---------------------------------------------------------------------------

/**
 * Parse a batch OCR response that uses ===PAGINA N=== markers.
 * Falls back gracefully if the model didn't follow the format.
 */
function parseBatchResponse(rawText: string, pageNumbers: number[]): Map<number, string> {
  const map = new Map<number, string>();

  for (let i = 0; i < pageNumbers.length; i++) {
    const pn = pageNumbers[i];
    const marker = `===PAGINA ${pn}===`;
    const idx = rawText.indexOf(marker);

    if (idx === -1) {
      // Marker not found — if single-page batch, use the whole response
      if (pageNumbers.length === 1) map.set(pn, rawText.trim());
      // else: mark as empty (parse failed)
      continue;
    }

    const contentStart = idx + marker.length;
    const nextPageNum   = pageNumbers[i + 1];
    let contentEnd = rawText.length;

    if (nextPageNum !== undefined) {
      const nextMarker = `===PAGINA ${nextPageNum}===`;
      const nextIdx    = rawText.indexOf(nextMarker, contentStart);
      if (nextIdx !== -1) contentEnd = nextIdx;
    }

    map.set(pn, rawText.slice(contentStart, contentEnd).trim());
  }

  return map;
}

// ---------------------------------------------------------------------------
// Single-page OCR call
// ---------------------------------------------------------------------------

async function ocrOnePage(
  img: PageRenderResult,
  client: OpenAI,
): Promise<OcrPage> {
  const dataUrl = `data:${img.mimeType};base64,${img.base64}`;

  if (!dataUrl.startsWith('data:image/')) {
    throw new Error(
      `[ocrVision] Invalid data URL for page ${img.pageNumber}: "${dataUrl.slice(0, 30)}"`,
    );
  }

  let rawText: string;
  try {
    rawText = await retryOn429(async () => {
      const res = await client.chat.completions.create({
        model:       'gpt-4o-mini',
        temperature: 0,
        max_tokens:  2048,
        messages: [
          { role: 'system', content: OCR_SYSTEM },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Trascrivi il testo della Pagina ${img.pageNumber}. Output solo testo plain.`,
              },
              {
                type:      'image_url',
                image_url: { url: dataUrl, detail: 'high' },
              },
            ],
          },
        ],
      });
      return (res.choices[0]?.message?.content ?? '').trim();
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const isRL = msg.includes('429') || msg.toLowerCase().includes('rate');
    return {
      page:           img.pageNumber,
      text:           '',
      chars:          0,
      status:         isRL ? 'rate_limited' : 'failed',
      preview:        '',
      rawModelOutput: msg,
    };
  }

  return interpretOcrText(img.pageNumber, rawText);
}

// ---------------------------------------------------------------------------
// Two-page batched OCR call
// ---------------------------------------------------------------------------

async function ocrTwoPages(
  img1: PageRenderResult,
  img2: PageRenderResult,
  client: OpenAI,
): Promise<OcrPage[]> {
  const dataUrl1 = `data:${img1.mimeType};base64,${img1.base64}`;
  const dataUrl2 = `data:${img2.mimeType};base64,${img2.base64}`;

  if (!dataUrl1.startsWith('data:image/') || !dataUrl2.startsWith('data:image/')) {
    throw new Error('[ocrVision] Invalid data URL in 2-page batch');
  }

  let rawText: string;
  try {
    rawText = await retryOn429(async () => {
      const res = await client.chat.completions.create({
        model:       'gpt-4o-mini',
        temperature: 0,
        max_tokens:  4096,
        messages: [
          { role: 'system', content: OCR_SYSTEM },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text:
                  `Trascrivi il testo di queste 2 pagine del documento.\n` +
                  `La prima immagine è la Pagina ${img1.pageNumber}, la seconda è la Pagina ${img2.pageNumber}.\n` +
                  `Usa ESATTAMENTE questo formato di separazione:\n` +
                  `===PAGINA ${img1.pageNumber}===\n<testo pagina ${img1.pageNumber}>\n` +
                  `===PAGINA ${img2.pageNumber}===\n<testo pagina ${img2.pageNumber}>\n` +
                  `Output solo testo plain, nessuna spiegazione aggiuntiva.`,
              },
              { type: 'image_url', image_url: { url: dataUrl1, detail: 'high' } },
              { type: 'image_url', image_url: { url: dataUrl2, detail: 'high' } },
            ],
          },
        ],
      });
      return (res.choices[0]?.message?.content ?? '').trim();
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const isRL = msg.includes('429') || msg.toLowerCase().includes('rate');
    const status: OcrPage['status'] = isRL ? 'rate_limited' : 'failed';
    return [
      { page: img1.pageNumber, text: '', chars: 0, status, preview: '', rawModelOutput: msg },
      { page: img2.pageNumber, text: '', chars: 0, status, preview: '', rawModelOutput: msg },
    ];
  }

  const parsed = parseBatchResponse(rawText, [img1.pageNumber, img2.pageNumber]);

  return [img1, img2].map((img) => {
    const text = parsed.get(img.pageNumber) ?? '';
    if (!text) {
      // Marker not found — fall back to single-page call would be nice, but
      // for simplicity return empty and log the raw output
      return {
        page: img.pageNumber, text: '', chars: 0, status: 'empty' as const,
        preview: '', rawModelOutput: `[batch parse failed] ${rawText.slice(0, 200)}`,
      };
    }
    return interpretOcrText(img.pageNumber, text);
  });
}

// ---------------------------------------------------------------------------
// Text interpretation
// ---------------------------------------------------------------------------

function interpretOcrText(pageNumber: number, raw: string): OcrPage {
  const isBlank =
    raw === '' ||
    raw.toUpperCase() === 'BLANK' ||
    raw.toLowerCase().startsWith('blank') ||
    raw.toLowerCase() === 'blank\n' ||
    raw.trim().toLowerCase() === 'blank';

  if (isBlank) {
    return {
      page:           pageNumber,
      text:           '',
      chars:          0,
      status:         'empty',
      preview:        '',
      rawModelOutput: raw || '(model returned BLANK)',
    };
  }

  const text = raw;
  return {
    page:    pageNumber,
    text,
    chars:   text.length,
    status:  text.length < 50 ? 'empty' : 'ok',
    preview: text.slice(0, 300),
  };
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Run Vision OCR on a set of rendered pages.
 *
 * - Skips pages where isBlank=true (saves API calls).
 * - Batches non-blank pages in pairs (2 per API call).
 * - Retries on 429 with exponential backoff.
 *
 * Returns OcrPage[] sorted by page number.
 */
export async function visionOcrPages(
  pages: PageRenderResult[],
  client: OpenAI,
): Promise<OcrPage[]> {
  const results: OcrPage[] = [];

  // Separate blank from non-blank
  const toProcess: PageRenderResult[] = [];
  for (const p of pages) {
    if (p.isBlank) {
      results.push({
        page:           p.pageNumber,
        text:           '',
        chars:          0,
        status:         'skipped_blank',
        preview:        '',
        rawModelOutput: `Page skipped: isBlank=true (whiteness=${p.whiteness.toFixed(3)}, bytes=${p.bytes})`,
      });
    } else if (!p.base64) {
      results.push({
        page:           p.pageNumber,
        text:           '',
        chars:          0,
        status:         'failed',
        preview:        '',
        rawModelOutput: p.renderError ?? 'Render produced empty base64',
      });
    } else {
      toProcess.push(p);
    }
  }

  // Process in batches of 2
  for (let i = 0; i < toProcess.length; i += 2) {
    const batch = toProcess.slice(i, i + 2);
    if (batch.length === 2) {
      const ocrResults = await ocrTwoPages(batch[0], batch[1], client);
      results.push(...ocrResults);
    } else {
      const ocrResult = await ocrOnePage(batch[0], client);
      results.push(ocrResult);
    }
  }

  return results.sort((a, b) => a.page - b.page);
}

// ---------------------------------------------------------------------------
// Helpers used by route.ts
// ---------------------------------------------------------------------------

/** Average chars/page across pages with status='ok' */
export function ocrAvgChars(ocrPages: OcrPage[]): number {
  const ok = ocrPages.filter((p) => p.status === 'ok');
  if (ok.length === 0) return 0;
  return ok.reduce((s, p) => s + p.chars, 0) / ok.length;
}

/** Build paged OCR payload for PASS 2 extraction */
export function buildOcrPayload(ocrPages: OcrPage[]): string {
  return ocrPages
    .map((p) => {
      const body = p.text.trim() || '(pagina vuota o non leggibile)';
      return `===PAGINA ${p.page}===\n${body}`;
    })
    .join('\n\n');
}

/**
 * Keyword-aware page scoring for PASS 2 payload truncation.
 * Returns ocrPages sorted by relevance (descending).
 */
export function scoreOcrPagesByKeywords(ocrPages: OcrPage[]): OcrPage[] {
  const KEYWORDS: Record<string, string[]> = {
    valore:    ['valore di stima', 'prezzo base', 'stima', 'valore di mercato', 'valore venale', '€', 'euro'],
    atti:      ['provenienza', 'trascrizione', 'iscrizione', 'ipoteca', 'pignoramento', 'servitù', 'ventennio', 'pregiudizievoli'],
    costi:     ['spese', 'oneri', 'condominio', 'arretrate', 'ultimi due anni', 'biennio', 'aggiudicatario'],
    difformita:['difformità', 'abuso', 'sanatoria', 'stato legittimo', 'conformità catastale', 'conformità urbanistica', 'agibilità'],
  };

  return [...ocrPages].sort((a, b) => {
    const scoreA = computeKeywordScore(a.text, KEYWORDS);
    const scoreB = computeKeywordScore(b.text, KEYWORDS);
    return scoreB - scoreA;
  });
}

function computeKeywordScore(text: string, keywords: Record<string, string[]>): number {
  const lower = text.toLowerCase();
  let score = 0;
  for (const terms of Object.values(keywords)) {
    for (const t of terms) {
      if (lower.includes(t)) score++;
    }
  }
  return score;
}
