/**
 * Anti-watermark filter for perizia immobiliare (worker version).
 *
 * FIX v2: raised frequency threshold 0.35 → 0.70 to prevent
 * false-positive removal of legitimate repeated content.
 *
 * Two-stage approach:
 *  1. Pattern-based: remove known PVP portal text (Portale Vendite Pubbliche)
 *  2. Frequency-based: remove lines appearing on >70% of pages
 *     (never removes lines with digits or whitelisted legal/cadastral terms)
 *
 * Per-page fallback: if a page drops below MIN_PAGE_CHARS after filtering,
 * its raw text is returned — Claude is instructed to ignore watermarks.
 *
 * Logs:
 *  - threshold used
 *  - top repeated lines (for diagnosis)
 *  - total filtered lines + fallback pages
 *  - sample of cleaned text (first 500 chars)
 */

const MIN_PAGE_CHARS = 100;

// ── Known Italian judicial portal patterns (Portale Vendite Pubbliche) ────────
const PVP_PATTERNS: RegExp[] = [
  /portale\s+delle?\s+vendite\s+pubbliche/i,
  /ministero\s+della\s+giustizia/i,
  /pubblicazione\s+ufficiale/i,
  /aste\s+giudiziarie/i,
  /pvp\.giustizia\.it/i,
  /n\.\s*di\s*pubblicazione/i,
  /decreto\s+ministeriale/i,
  /tribunale\s+ordinario\s+di/i,
  /allegato\s+\d+\s+d\.m\./i,
];

// ── Whitelist: lines containing these are NEVER removed ──────────────────────
const WHITELIST = [
  '€', 'euro', 'mq', 'm²', 'm2',
  'lotto', 'stima', 'valore', 'catasto',
  'conformità', 'urbanistica', 'difformità', 'oneri',
  'spese', 'condominio', 'pignoramento', 'procedura',
  'particella', 'subalterno', 'foglio', 'mappale',
  'superficie', 'rendita', 'classe', 'categoria',
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
  // Protect ANY line containing a digit (cadastral numbers, values, dates, addresses)
  if (/\d/.test(line)) return true;
  return WHITELIST.some((w) => lower.includes(w));
}

function isPvpWatermark(line: string): boolean {
  return PVP_PATTERNS.some((re) => re.test(line));
}

export interface WatermarkResult {
  cleanedPages:           string[];
  pagesCount:             number;
  textLen:                number;
  watermarkFilteredCount: number;
  fallbackPages:          number;
}

export function removeWatermarkLines(pages: string[]): WatermarkResult {
  if (pages.length === 0) {
    return { cleanedPages: [], pagesCount: 0, textLen: 0, watermarkFilteredCount: 0, fallbackPages: 0 };
  }

  // ── Step 1: build frequency map across all pages ──────────────────────────
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

  // ── Step 2: identify high-frequency repeated lines (>70% of pages) ────────
  // NOTE: was 0.35 — too aggressive, caused false removal of real content lines.
  // 0.70 means a line must appear on >70% of pages to be considered a watermark.
  const threshold      = pages.length * 0.70;
  const watermarkNorms = new Set<string>();
  for (const [norm, count] of normFreq.entries()) {
    if (count > threshold) {
      watermarkNorms.add(norm);
    }
  }

  // ── Diagnostic: log top repeated lines ───────────────────────────────────
  const topRepeated = Array.from(normFreq.entries())
    .filter(([, c]) => c > 1)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([norm, count]) => `"${norm.slice(0, 50)}" ×${count}/${pages.length}`);
  if (topRepeated.length > 0) {
    console.log(`[watermark] top-repeated: ${topRepeated.join(' | ')}`);
  }

  // ── Step 3: filter each page ──────────────────────────────────────────────
  let watermarkFilteredCount = 0;
  let fallbackPages          = 0;

  const cleanedPages = pages.map((page) => {
    const lines  = page.split('\n');
    const kept: string[] = [];

    for (const line of lines) {
      const norm    = normalise(line);
      const trimmed = line.trim();

      if (norm.length < 3) {
        if (trimmed.length > 0) kept.push(line);
        continue;
      }

      // Stage 1: pattern-based PVP watermark removal
      if (isPvpWatermark(trimmed) && !isWhitelisted(trimmed)) {
        watermarkFilteredCount++;
        continue;
      }

      // Stage 2: frequency-based removal (>70% of pages, not whitelisted)
      if (watermarkNorms.has(norm) && !isWhitelisted(trimmed)) {
        watermarkFilteredCount++;
        continue;
      }

      kept.push(line);
    }

    const cleaned = kept.join('\n').trim();

    // Per-page fallback: if filter removed almost everything, return raw text
    if (cleaned.length < MIN_PAGE_CHARS && page.trim().length > cleaned.length) {
      fallbackPages++;
      return page; // raw — Claude is told to ignore watermarks
    }

    return cleaned;
  });

  const textLen = cleanedPages.reduce((sum, p) => sum + p.length, 0);

  // Sample of cleaned text for diagnostics
  const sample = cleanedPages.join('\n').slice(0, 500).replace(/\n+/g, ' ');

  console.log(
    `[watermark] pages=${pages.length} threshold70%=${Math.round(threshold)} ` +
    `pvp+freq norms=${watermarkNorms.size} filteredLines=${watermarkFilteredCount} ` +
    `fallbackPages=${fallbackPages} textLen=${textLen}`,
  );
  console.log(`[watermark] sample: ${sample}`);

  return {
    cleanedPages,
    pagesCount:             pages.length,
    textLen,
    watermarkFilteredCount,
    fallbackPages,
  };
}
