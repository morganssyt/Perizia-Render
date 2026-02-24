/**
 * Extract and normalize monetary amounts from Italian text.
 * Handles formats:
 *   € 123.456,78 | €123.456,78 | 123.456,78 € | euro 123.456,78
 *   EUR 123,456.78 (English format)
 *   300.000 (Italian thousand separator, no decimal)
 *   300000 (round number near currency keyword)
 *   300 000 (space-formatted)
 */

export interface ExtractedAmount {
  raw: string;
  value: number;
  startIndex: number;
}

const AMOUNT_PATTERNS = [
  // € before number: € 123.456,78 or € 300.000 or €123456
  /€\s*([\d]{1,3}(?:[.\s][\d]{3})*(?:,[\d]{1,2})?)/g,
  // € after number: 123.456,78 €
  /([\d]{1,3}(?:\.[\d]{3})*(?:,[\d]{1,2})?)\s*€/g,
  // "euro" keyword: 123.456,78 euro | euro 123.456,78
  /(?:euro|eur)\s+([\d]{1,3}(?:[.\s][\d]{3})*(?:,[\d]{1,2})?)/gi,
  /([\d]{1,3}(?:\.[\d]{3})*(?:,[\d]{1,2})?)\s*(?:euro|eur)\b/gi,
  // Large round numbers (likely prices) ≥ 10.000 with Italian dot-thousands
  // Only matches when clearly formatted: 150.000 or 1.200.000 (never 3-digit only)
  /((?:\d{1,3}\.){1,4}\d{3})(?!\s*,\s*\d)/g,
];

/**
 * Normalize Italian number format to float.
 * "123.456,78" → 123456.78
 * "123,456.78" → 123456.78 (English format)
 * "300.000"    → 300000
 * "300 000"    → 300000
 */
export function normalizeAmount(raw: string): number {
  let cleaned = raw.replace(/\s/g, '');

  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');

  if (lastComma > lastDot) {
    // Italian format: dots are thousands, comma is decimal
    cleaned = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (lastDot > lastComma) {
    // Could be: 300.000 (Italian thousands only) or 1.23 (English decimal)
    // If there are exactly 3 digits after the last dot → thousands separator
    const afterLastDot = cleaned.slice(lastDot + 1);
    if (afterLastDot.length === 3 && /^\d{3}$/.test(afterLastDot)) {
      // 300.000 or 1.200.000 → remove all dots
      cleaned = cleaned.replace(/\./g, '');
    } else {
      // English format: commas are thousands
      cleaned = cleaned.replace(/,/g, '');
    }
  } else {
    if (lastComma !== -1) {
      cleaned = cleaned.replace(',', '.');
    }
  }

  const value = parseFloat(cleaned);
  return isNaN(value) ? 0 : value;
}

/**
 * Extract all monetary amounts from text.
 */
export function extractAmounts(text: string): ExtractedAmount[] {
  const results: ExtractedAmount[] = [];
  const seen = new Set<number>();

  for (const pattern of AMOUNT_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      if (seen.has(match.index)) continue;
      seen.add(match.index);

      const numStr = match[1] ?? match[0];
      const value = normalizeAmount(numStr);

      // Filter: at least 1000 (below that is probably not a property value)
      // But keep smaller amounts for legal costs context
      if (value > 0) {
        results.push({
          raw: match[0].trim(),
          value,
          startIndex: match.index,
        });
      }
    }
  }

  // Deduplicate by value proximity (same value extracted by different patterns)
  const deduped: ExtractedAmount[] = [];
  for (const r of results.sort((a, b) => a.startIndex - b.startIndex)) {
    const isDup = deduped.some(
      (d) => Math.abs(d.startIndex - r.startIndex) < 3 || d.value === r.value && Math.abs(d.startIndex - r.startIndex) < 20
    );
    if (!isDup) deduped.push(r);
  }

  return deduped;
}
