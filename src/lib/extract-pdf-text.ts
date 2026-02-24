/**
 * extractPdfText — 3-engine PDF text extraction with graceful fallbacks.
 *
 * Engine 1 (primary):   pdf-parse + custom positional renderer (parsePdf)
 * Engine 2 (fallback):  pdf-parse with default built-in renderer
 * Engine 3 (last resort): pdfjs-dist v5 direct (no pdf-parse wrapper)
 *
 * All requires are at module level so Vercel's nft (Node File Trace)
 * includes the packages in the serverless function bundle.
 */

// Static import — webpack sees this at build time and Vercel nft traces it.
import { parsePdf } from './pdf-parser';

// ── Module-level initialisation ───────────────────────────────────────────────
// A top-level require() emits a plain `require('...')` literal in the webpack
// output that nft can trace statically.  Dynamic import() inside an async
// function generates webpack runtime code that nft may NOT resolve.

// pdf-parse (Engine 1 & 2)
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
let _pdfParse: ((buf: Buffer, opts?: object) => Promise<any>) | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
  const m: any = require('pdf-parse');
  _pdfParse = m.default ?? m;
} catch (e) {
  console.error('[extract-pdf-text] pdf-parse init failed:', e);
}

// pdfjs-dist v5 (Engine 3)
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
let _pdfjsLib: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
  const m: any = require('pdfjs-dist');
  _pdfjsLib = m.default ?? m;
  // Disable worker — not needed for server-side text extraction.
  if (_pdfjsLib?.GlobalWorkerOptions) {
    _pdfjsLib.GlobalWorkerOptions.workerSrc = '';
  }
} catch (e) {
  console.warn('[extract-pdf-text] pdfjs-dist init failed (Engine 3 unavailable):', e);
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type ExtractionEngine =
  | 'pdf-parse-custom'
  | 'pdf-parse-default'
  | 'pdfjs-direct'
  | 'failed';

export interface PdfExtractionResult {
  text:   string;
  pages:  number;
  engine: ExtractionEngine;
  /** Only set when engine === 'failed' or a fallback was used due to an error */
  error?: string;
}

const MIN_CHARS = 200;

// ── Main export ───────────────────────────────────────────────────────────────

export async function extractPdfText(buffer: Buffer): Promise<PdfExtractionResult> {
  // Sanity-check: verify PDF magic header
  const magic = buffer.slice(0, 5).toString('ascii');
  if (magic !== '%PDF-') {
    return {
      text:   '',
      pages:  0,
      engine: 'failed',
      error:  `Il file non è un PDF valido (header: ${JSON.stringify(magic)})`,
    };
  }

  const errors: string[] = [];

  // ── Engine 1: pdf-parse with custom positional renderer ──────────────────
  try {
    if (!_pdfParse) throw new Error('pdf-parse not loaded');
    const parsed = await parsePdf(buffer);
    const text   = parsed.pages.map((p) => p.text).join('\n\n');
    const pages  = parsed.totalPages;

    if (text.trim().length >= MIN_CHARS) {
      return { text, pages, engine: 'pdf-parse-custom' };
    }

    const shortNote = `pdf-parse-custom: testo troppo corto (${text.trim().length} char, ${pages} pag)`;
    errors.push(shortNote);
    console.warn('[extractPdfText]', shortNote);

    const fallback2 = await tryPdfParseDefault(buffer, errors);
    if (fallback2 && fallback2.text.trim().length >= text.trim().length) {
      return fallback2;
    }
    // Engine 1 got SOME text — prefer it over an empty fallback
    if (text.trim().length > 0) {
      return { text, pages, engine: 'pdf-parse-custom' };
    }
  } catch (e1) {
    const msg = `pdf-parse-custom failed: ${String(e1).slice(0, 400)}`;
    errors.push(msg);
    console.error('[extractPdfText]', msg);
  }

  // ── Engine 2: pdf-parse with default (built-in) renderer ─────────────────
  const fallback2 = await tryPdfParseDefault(buffer, errors);
  if (fallback2) return fallback2;

  // ── Engine 3: pdfjs-dist v5 direct ───────────────────────────────────────
  const fallback3 = await tryPdfjsDirect(buffer, errors);
  if (fallback3) return fallback3;

  // ── All engines failed ────────────────────────────────────────────────────
  return {
    text:   '',
    pages:  0,
    engine: 'failed',
    error:  errors.join(' | '),
  };
}

// ── Engine 2 helper ───────────────────────────────────────────────────────────

async function tryPdfParseDefault(
  buffer: Buffer,
  errors: string[],
): Promise<PdfExtractionResult | null> {
  if (!_pdfParse) {
    errors.push('pdf-parse-default: pdf-parse not loaded');
    return null;
  }
  try {
    const data = await _pdfParse(buffer);
    return {
      text:   data.text  ?? '',
      pages:  data.numpages ?? 0,
      engine: 'pdf-parse-default',
    };
  } catch (e2) {
    const msg = `pdf-parse-default failed: ${String(e2).slice(0, 400)}`;
    errors.push(msg);
    console.error('[extractPdfText]', msg);
    return null;
  }
}

// ── Engine 3 helper ───────────────────────────────────────────────────────────

async function tryPdfjsDirect(
  buffer: Buffer,
  errors: string[],
): Promise<PdfExtractionResult | null> {
  if (!_pdfjsLib) {
    errors.push('pdfjs-direct: pdfjs-dist not loaded');
    return null;
  }
  try {
    const loadingTask = _pdfjsLib.getDocument({
      data:             new Uint8Array(buffer),
      disableRange:     true,
      disableStream:    true,
      disableAutoFetch: true,
    });
    const pdf = await loadingTask.promise;
    const numPages: number = pdf.numPages;
    const pageParts: string[] = [];

    for (let i = 1; i <= numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      // Build page text preserving basic line breaks via Y-position
      let lastY: number | null = null;
      const parts: string[] = [];
      for (const item of content.items as any[]) {
        if (!('str' in item) || !item.str) continue;
        const y = Math.round(item.transform?.[5] ?? 0);
        if (lastY !== null && Math.abs(y - lastY) > 2) parts.push('\n');
        parts.push(item.str);
        lastY = y;
      }
      const pageText = parts.join('').replace(/\n{3,}/g, '\n\n').trim();
      if (pageText) pageParts.push(pageText);
    }

    const text = pageParts.join('\n\n');
    if (text.trim().length === 0) {
      // No text extracted — could be a genuine scan; return with pages count
      return { text: '', pages: numPages, engine: 'pdfjs-direct' };
    }
    return { text, pages: numPages, engine: 'pdfjs-direct' };
  } catch (e3) {
    const msg = `pdfjs-direct failed: ${String(e3).slice(0, 400)}`;
    errors.push(msg);
    console.error('[extractPdfText]', msg);
    return null;
  }
}
