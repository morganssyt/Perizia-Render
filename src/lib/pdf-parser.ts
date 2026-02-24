import { ParsedPdf, PageText } from '@/types';

// Module-level require — a static require() is 100% reliably traced by Vercel's nft
// (Node File Trace) and included in the serverless function bundle.
// Dynamic import() inside a function can be missed by nft even with webpack externals.
// webpack externals (next.config.js) + serverExternalPackages (next.config.js) prevent
// pdf-parse from being bundled and emit a plain `require('pdf-parse')` in the output.
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
const _pdfParseRaw: any = require('pdf-parse');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _pdfParse: (buf: Buffer, opts?: object) => Promise<any> = _pdfParseRaw.default ?? _pdfParseRaw;

/**
 * Parse a PDF buffer and extract text per page with metadata.
 */
export async function parsePdf(buffer: Buffer): Promise<ParsedPdf> {

  const pages: PageText[] = [];
  let totalPages = 0;

  // Custom page renderer — better text reconstruction respecting positions
  const renderPage = async (pageData: any) => {
    const textContent = await pageData.getTextContent();

    let lastY: number | null = null;
    let lastX = 0;
    const parts: string[] = [];

    for (const item of textContent.items) {
      if (!item.str) continue;

      const y = Math.round(item.transform[5]);
      const x = Math.round(item.transform[4]);

      if (lastY !== null && Math.abs(y - lastY) > 2) {
        parts.push('\n');
      } else if (lastY !== null && x - lastX > 10) {
        parts.push(' ');
      }

      parts.push(item.str);
      lastY = y;
      lastX = x + (item.width || 0);
    }

    const text = parts.join('').replace(/\n{3,}/g, '\n\n').trim();
    pages.push({ page: pageData.pageNumber, text });
    return text;
  };

  const data = await _pdfParse(buffer, {
    pagerender: renderPage,
  });

  totalPages = data.numpages;

  // Fallback if renderer didn't fire
  if (pages.length === 0 && data.text) {
    const textChunks = data.text.split(/\f/);
    if (textChunks.length > 1) {
      textChunks.forEach((chunk: string, i: number) => {
        if (chunk.trim()) {
          pages.push({ page: i + 1, text: chunk.trim() });
        }
      });
    } else {
      pages.push({ page: 1, text: data.text });
    }
  }

  pages.sort((a, b) => a.page - b.page);

  const metadata: Record<string, string> = {};
  if (data.info) {
    for (const [key, val] of Object.entries(data.info)) {
      if (typeof val === 'string') metadata[key] = val;
    }
  }

  return { pages, totalPages, metadata };
}

/**
 * Calculate text coverage per page and overall.
 */
export function getTextCoverage(parsed: ParsedPdf): {
  avgCharsPerPage: number;
  pagesWithText: number;
  totalChars: number;
  perPage: { page: number; chars: number; hasText: boolean }[];
} {
  const perPage = parsed.pages.map((p) => ({
    page: p.page,
    chars: p.text.length,
    hasText: p.text.trim().length > 20,
  }));

  const totalChars = perPage.reduce((sum, p) => sum + p.chars, 0);
  const pagesWithText = perPage.filter((p) => p.hasText).length;
  const avgCharsPerPage = parsed.pages.length > 0 ? totalChars / parsed.pages.length : 0;

  return { avgCharsPerPage, pagesWithText, totalChars, perPage };
}

/**
 * Detect if the extracted text is dominated by a repeated watermark/header.
 * Returns the watermark string if found, or null.
 */
function detectRepeatedWatermark(pages: PageText[]): string | null {
  if (pages.length < 3) return null;

  const lineCount: Map<string, number> = new Map();
  for (const page of pages) {
    const lines = page.text.split('\n').map((l) => l.trim()).filter((l) => l.length > 15);
    const seen = new Set<string>();
    for (const line of lines) {
      if (!seen.has(line)) {
        lineCount.set(line, (lineCount.get(line) ?? 0) + 1);
        seen.add(line);
      }
    }
  }

  // If any single line appears on >60% of pages, it's a watermark/header
  const threshold = Math.ceil(pages.length * 0.6);
  const found = Array.from(lineCount.entries()).find(([, count]) => count >= threshold);
  return found ? found[0] : null;
}

/**
 * Check if a PDF has very little text (likely scanned/image-only).
 * Returns detailed info instead of simple boolean.
 */
export function isLikelyScanned(parsed: ParsedPdf, threshold = 50): {
  isScanned: boolean;
  reason: string;
  avgCharsPerPage: number;
  textCoverage: number;
} {
  if (parsed.pages.length === 0) {
    return {
      isScanned: true,
      reason: 'Nessuna pagina trovata nel PDF.',
      avgCharsPerPage: 0,
      textCoverage: 0,
    };
  }

  const coverage = getTextCoverage(parsed);
  const textCoverage = coverage.pagesWithText / parsed.pages.length;

  if (coverage.avgCharsPerPage < threshold) {
    return {
      isScanned: true,
      reason: `Testo insufficiente: media ${Math.round(coverage.avgCharsPerPage)} car./pagina (soglia: ${threshold}). Probabile scansione → OCR richiesto.`,
      avgCharsPerPage: coverage.avgCharsPerPage,
      textCoverage,
    };
  }

  if (textCoverage < 0.3 && parsed.pages.length > 2) {
    return {
      isScanned: true,
      reason: `Solo ${coverage.pagesWithText}/${parsed.pages.length} pagine contengono testo. Probabile scansione parziale.`,
      avgCharsPerPage: coverage.avgCharsPerPage,
      textCoverage,
    };
  }

  // Detect watermark-only PDFs: all extracted text is a repeated header/copyright notice
  const watermark = detectRepeatedWatermark(parsed.pages);
  if (watermark) {
    const watermarkChars = watermark.length * parsed.pages.length;
    const watermarkFraction = watermarkChars / Math.max(coverage.totalChars, 1);
    if (watermarkFraction > 0.5) {
      return {
        isScanned: true,
        reason: `Il PDF contiene solo una filigrana/intestazione ripetuta ("${watermark.slice(0, 80)}…"). Il contenuto reale è in formato immagine → carica un PDF con testo selezionabile, oppure usa un PDF senza protezione di copia.`,
        avgCharsPerPage: coverage.avgCharsPerPage,
        textCoverage,
      };
    }
  }

  return {
    isScanned: false,
    reason: '',
    avgCharsPerPage: coverage.avgCharsPerPage,
    textCoverage,
  };
}

/**
 * Get full concatenated text from all pages.
 */
export function getFullText(parsed: ParsedPdf): string {
  return parsed.pages.map((p) => p.text).join('\n\n');
}
