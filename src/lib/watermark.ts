/**
 * Anti-watermark filter for Italian judicial auction perizias.
 *
 * Two-stage approach:
 *  1. Pattern-based: remove known PVP portal watermark text precisely
 *  2. Frequency-based: remove lines appearing on >70% of pages
 *     (never removes lines containing digits or whitelisted legal terms)
 *
 * Per-page fallback: if a page becomes < MIN_PAGE_CHARS after filtering,
 * its raw text is kept (clearly watermark-infested = OCR/Textract needed,
 * but raw is better than empty for Claude).
 */

const MIN_PAGE_CHARS = 150;

// ── Known Italian judicial portal patterns (Portale Vendite Pubbliche) ───────
// These appear verbatim on every page and are safe to remove precisely.
const PVP_PATTERNS: RegExp[] = [
  /portale\s+delle?\s+vendite\s+pubbliche/i,
  /ministero\s+della\s+giustizia/i,
  /pubblicazione\s+ufficiale/i,
  /aste\s+giudiziarie/i,
  /pvp\.giustizia\.it/i,
  /n\.\s*di\s*pubblicazione/i,
  /decreto\s+ministeriale/i,
  /tribunale\s+ordinario\s+di/i,   // only the header line
  /allegato\s+\d+\s+d\.m\./i,
];

// ── Whitelist: lines containing these are never removed by frequency filter ──
const WHITELIST_TERMS = [
  '€', 'euro', 'mq', 'm²', 'm2',
  'lotto', 'stima', 'valore', 'catasto',
  'conformità', 'urbanistica', 'difformità', 'oneri',
  'spese', 'condominio', 'pignoramento', 'procedura',
  'particella', 'subalterno', 'foglio', 'mappale',
];

function normalise(line: string): string {
  return line
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[.,;:!?'"()\[\]{}]/g, '');
}

function isWhitelisted(line: string): boolean {
  const lower = line.toLowerCase();
  // Protect any line containing a digit (cadastral numbers, values, dates…)
  if (/\d/.test(line)) return true;
  return WHITELIST_TERMS.some((w) => lower.includes(w));
}

function isPvpWatermark(line: string): boolean {
  return PVP_PATTERNS.some((re) => re.test(line));
}

export interface WatermarkResult {
  cleanedPages:           string[];
  pagesCount:             number;
  textLen:                number;
  watermarkFilteredCount: number;
  fallbackPages:          number;   // pages that used raw text fallback
}

export function removeWatermarkLines(pages: string[]): WatermarkResult {
  if (pages.length === 0) {
    return { cleanedPages: [], pagesCount: 0, textLen: 0, watermarkFilteredCount: 0, fallbackPages: 0 };
  }

  // ── Step 1: build frequency map (for frequency-based stage) ──────────────
  const normFreq = new Map<string, number>();

  for (const page of pages) {
    const seenInPage = new Set<string>();
    for (const line of page.split('\n')) {
      const norm = normalise(line);
      if (norm.length < 3) continue;
      if (!seenInPage.has(norm)) {
        seenInPage.add(norm);
        normFreq.set(norm, (normFreq.get(norm) ?? 0) + 1);
      }
    }
  }

  // ── Step 2: identify high-frequency repeated lines (>70% of pages) ───────
  const threshold      = pages.length * 0.70;   // was 0.35 — much safer
  const watermarkNorms = new Set<string>();
  Array.from(normFreq.entries()).forEach(([norm, count]) => {
    if (count > threshold) {
      watermarkNorms.add(norm);
    }
  });

  // ── Step 3: filter each page ─────────────────────────────────────────────
  let watermarkFilteredCount = 0;
  let fallbackPages          = 0;

  const cleanedPages = pages.map((page) => {
    const lines      = page.split('\n');
    const kept: string[] = [];

    for (const line of lines) {
      const norm     = normalise(line);
      const trimmed  = line.trim();

      // Always skip very short lines (page numbers, stray chars)
      if (norm.length < 3) {
        // Keep if not just whitespace
        if (trimmed.length > 0) kept.push(line);
        continue;
      }

      // Stage 1: pattern-based PVP watermark removal (never whitelisted)
      if (isPvpWatermark(trimmed) && !isWhitelisted(trimmed)) {
        watermarkFilteredCount++;
        continue;
      }

      // Stage 2: frequency-based removal (never remove whitelisted lines)
      if (watermarkNorms.has(norm) && !isWhitelisted(trimmed)) {
        watermarkFilteredCount++;
        continue;
      }

      kept.push(line);
    }

    const cleaned = kept.join('\n').trim();

    // ── Per-page fallback: if filter nuked the page, return raw text ─────
    if (cleaned.length < MIN_PAGE_CHARS && page.trim().length > cleaned.length) {
      fallbackPages++;
      return page; // raw text — Claude is told to ignore watermarks
    }

    return cleaned;
  });

  const textLen = cleanedPages.reduce((sum, p) => sum + p.length, 0);

  console.log(
    `[watermark] pages=${pages.length} threshold=${Math.round(threshold)} ` +
    `watermarkNormsCount=${watermarkNorms.size} filteredLines=${watermarkFilteredCount} ` +
    `fallbackPages=${fallbackPages} textLen=${textLen}`,
  );

  return {
    cleanedPages,
    pagesCount:             pages.length,
    textLen,
    watermarkFilteredCount,
    fallbackPages,
  };
}
