/**
 * Anti-watermark filter.
 *
 * Removes lines that appear across >35% of pages (frequency-based dedup),
 * while preserving lines that contain whitelisted terms (monetary, legal, catasto).
 */

const WHITELIST = [
  '€', 'euro', 'mq', 'm²', 'm2',
  'lotto', 'stima', 'valore', 'catasto',
  'conformità', 'urbanistica', 'difformità', 'oneri',
  'spese', 'condominio', 'pignoramento', 'procedura',
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
  return WHITELIST.some((w) => lower.includes(w));
}

export interface WatermarkResult {
  cleanedPages:           string[];
  pagesCount:             number;
  textLen:                number;
  watermarkFilteredCount: number;
}

export function removeWatermarkLines(pages: string[]): WatermarkResult {
  if (pages.length === 0) {
    return { cleanedPages: [], pagesCount: 0, textLen: 0, watermarkFilteredCount: 0 };
  }

  // ── Step 1: build frequency map across all pages ─────────────────────────
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

  // ── Step 2: identify watermark lines (>35% of pages, not whitelisted) ────
  const threshold      = pages.length * 0.35;
  const watermarkNorms = new Set<string>();
  Array.from(normFreq.entries()).forEach(([norm, count]) => {
    if (count > threshold) {
      watermarkNorms.add(norm);
    }
  });

  // ── Step 3: filter each page ─────────────────────────────────────────────
  let watermarkFilteredCount = 0;

  const cleanedPages = pages.map((page) => {
    const lines      = page.split('\n');
    const kept: string[] = [];
    for (const line of lines) {
      const norm = normalise(line);
      if (norm.length < 3) {
        kept.push(line);
        continue;
      }
      if (watermarkNorms.has(norm) && !isWhitelisted(line)) {
        watermarkFilteredCount++;
        continue;
      }
      kept.push(line);
    }
    return kept.join('\n');
  });

  const textLen = cleanedPages.reduce((sum, p) => sum + p.length, 0);

  console.log(
    `[watermark] pagesCount=${pages.length} textLen=${textLen} ` +
    `watermarkNormsCount=${watermarkNorms.size} watermarkFilteredCount=${watermarkFilteredCount}`,
  );

  return {
    cleanedPages,
    pagesCount:             pages.length,
    textLen,
    watermarkFilteredCount,
  };
}
