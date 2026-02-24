/**
 * textQuality.ts — Determines whether extracted PDF text is usable for direct
 * LLM extraction or whether we must fall back to OCR.
 */

// Patterns that indicate watermark / access-control overlays common in Italian
// judicial-auction ("aste giudiziarie") PDFs.
const WATERMARK_PATTERNS: string[] = [
  'pubblicazione ufficiale',
  'ad uso esclusivo',
  'riproduzione vietata',
  'riproduzione riservata',
  'min. giustizia',
  'ministero della giustizia',
  'aste giudiziarie',
  'uso personale',
  'non cedibile',
  'tribunale di',          // repeated header in some portals
];

export interface TextQualityMetrics {
  len: number;
  avgCharsPerPage: number;
  repetitionScore: number;   // 0 = no repetition, 1 = identical lines throughout
  watermarkHits: number;     // total watermark pattern occurrences
  uniqueTokenRatio: number;  // 0..1 — low = very repetitive vocabulary
}

export interface TextQualityResult {
  usable: boolean;
  reason: string;            // machine-readable tag
  humanReason: string;       // Italian, shown in UI
  metrics: TextQualityMetrics;
}

/**
 * Analyse the concatenated per-page text of a PDF.
 *
 * @param rawText  Full text (all pages joined).
 * @param pageCount  Number of pages in the document.
 */
export function checkTextQuality(rawText: string, pageCount = 1): TextQualityResult {
  const len = rawText.length;
  const avgCharsPerPage = pageCount > 0 ? len / pageCount : len;

  // ── quick length guard ──────────────────────────────────────────────────
  if (len < 1200) {
    return result(false, 'too_short', `Testo troppo breve (${len} car totali)`,
      { len, avgCharsPerPage, repetitionScore: 0, watermarkHits: 0, uniqueTokenRatio: 0 });
  }

  if (avgCharsPerPage < 200) {
    return result(false, 'low_avg_chars_per_page',
      `Media troppo bassa (${Math.round(avgCharsPerPage)} car/pag)`,
      { len, avgCharsPerPage, repetitionScore: 0, watermarkHits: 0, uniqueTokenRatio: 0 });
  }

  // ── watermark density ───────────────────────────────────────────────────
  const lower = rawText.toLowerCase();
  let watermarkHits = 0;
  for (const pat of WATERMARK_PATTERNS) {
    const re = new RegExp(pat.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
    const matches = lower.match(re);
    if (matches) watermarkHits += matches.length;
  }

  // ── line repetition score ───────────────────────────────────────────────
  const lines = rawText
    .split('\n')
    .map((l) => l.trim().toLowerCase())
    .filter((l) => l.length > 15);

  let repetitionScore = 0;
  if (lines.length > 10) {
    const freq: Record<string, number> = {};
    for (const l of lines) freq[l] = (freq[l] ?? 0) + 1;
    const maxFreq = Math.max(...Object.values(freq));
    repetitionScore = maxFreq / lines.length;
  }

  // ── unique token ratio ──────────────────────────────────────────────────
  const tokens = rawText.toLowerCase().split(/\s+/).filter((t) => t.length > 2);
  const uniqueCount = new Set(tokens).size;
  const uniqueTokenRatio = tokens.length > 0 ? uniqueCount / tokens.length : 0;

  const metrics: TextQualityMetrics = {
    len, avgCharsPerPage, repetitionScore, watermarkHits, uniqueTokenRatio,
  };

  if (repetitionScore > 0.20) {
    return result(false, 'repeated_disclaimer',
      `Disclaimer ripetuto rilevato (score ${repetitionScore.toFixed(2)})`, metrics);
  }

  // High watermark density with low overall content → watermark-only layer
  const watermarkDensity = (watermarkHits * 40) / Math.max(len, 1);
  if (watermarkDensity > 0.25 && len < 8000) {
    return result(false, 'watermark_dominated',
      `Layer di testo dominato da watermark (${watermarkHits} occorrenze)`, metrics);
  }

  if (uniqueTokenRatio < 0.12 && len < 6000) {
    return result(false, 'low_unique_tokens',
      `Vocabolario troppo ripetitivo (ratio ${uniqueTokenRatio.toFixed(2)})`, metrics);
  }

  return result(true, 'ok', 'Testo estraibile e utilizzabile', metrics);
}

function result(
  usable: boolean,
  reason: string,
  humanReason: string,
  metrics: TextQualityMetrics,
): TextQualityResult {
  return { usable, reason, humanReason, metrics };
}
