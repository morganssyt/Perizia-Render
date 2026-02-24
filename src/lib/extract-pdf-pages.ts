/**
 * extractPdfPages — per-page PDF text extraction.
 *
 * Engine 1: pdf-parse + custom positional renderer (parsePdf)
 * Engine 2: pdf-parse default, split by form-feed (\f)
 *
 * Module-level require() is critical for Vercel nft (Node File Trace) tracing.
 */

import { parsePdf } from './pdf-parser';

// Module-level require — nft traces this as a static string literal.
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
let _pdfParse: ((buf: Buffer, opts?: object) => Promise<any>) | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
  const m: any = require('pdf-parse');
  _pdfParse = m.default ?? m;
} catch (e) {
  console.error('[extract-pdf-pages] pdf-parse init failed:', e);
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PageResult {
  page: number;
  text: string;
}

export interface PdfPagesResult {
  totalPages: number;
  pages: PageResult[];
  engine: string;
  error?: string;
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function extractPdfPages(buffer: Buffer): Promise<PdfPagesResult> {
  const magic = buffer.slice(0, 5).toString('ascii');
  if (magic !== '%PDF-') {
    return {
      totalPages: 0,
      pages: [],
      engine: 'failed',
      error: `Non è un PDF valido (header: ${JSON.stringify(magic)})`,
    };
  }

  // ── Engine 1: pdf-parse + custom positional per-page renderer ─────────────
  try {
    const parsed = await parsePdf(buffer);
    const pages: PageResult[] = parsed.pages.map((p) => ({ page: p.page, text: p.text }));
    if (pages.length > 0) {
      return { totalPages: parsed.totalPages, pages, engine: 'pdf-parse-custom' };
    }
  } catch (e1) {
    console.error('[extractPdfPages] Engine 1 failed:', String(e1).slice(0, 200));
  }

  // ── Engine 2: pdf-parse default, split by form-feed for per-page ──────────
  if (_pdfParse) {
    try {
      const data = await _pdfParse(buffer);
      const rawText: string = data.text ?? '';
      const chunks = rawText.split(/\f/);
      const pages: PageResult[] = [];
      chunks.forEach((chunk: string, i: number) => {
        const text = chunk.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
        if (text) pages.push({ page: i + 1, text });
      });
      if (pages.length === 0 && rawText.trim()) {
        pages.push({ page: 1, text: rawText.trim() });
      }
      return {
        totalPages: data.numpages || pages.length,
        pages,
        engine: 'pdf-parse-default',
      };
    } catch (e2) {
      const msg = String(e2).slice(0, 300);
      console.error('[extractPdfPages] Engine 2 failed:', msg);
      return { totalPages: 0, pages: [], engine: 'failed', error: msg };
    }
  }

  return { totalPages: 0, pages: [], engine: 'failed', error: 'pdf-parse non disponibile' };
}
