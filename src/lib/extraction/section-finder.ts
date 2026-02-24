import { PageText, SectionCandidate } from '@/types';
import { KEYWORDS, FieldType } from './keywords';

const WINDOW_SIZE = 1500; // characters around keyword match (increased from 1200)
const HALF_WINDOW = WINDOW_SIZE / 2;

/**
 * Detect if text looks like a title/heading:
 * - ALL CAPS
 * - Starts with numbering like "6.1", "CAPITOLO", "Art."
 * - Short line (< 120 chars)
 */
function isTitleLike(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length > 120 || trimmed.length < 3) return false;
  if (trimmed === trimmed.toUpperCase() && trimmed.length > 3) return true;
  if (/^\d+[\.\)]\s*\d*\.?\s*/i.test(trimmed)) return true;
  if (/^(capitolo|sezione|art\.?\s|paragrafo|punto)/i.test(trimmed)) return true;
  // Bold-like patterns (e.g. "**Title**" or "__Title__")
  if (/^[*_]{2}.+[*_]{2}$/.test(trimmed)) return true;
  return false;
}

/**
 * Find section candidates in the parsed PDF pages for a given field type.
 * Searches for keyword matches and extracts surrounding text windows.
 */
export function findSectionCandidates(
  pages: PageText[],
  fieldType: FieldType,
  maxCandidates = 5
): SectionCandidate[] {
  const keywords = KEYWORDS[fieldType];
  const candidates: SectionCandidate[] = [];

  // Build a full-text index for cross-page searching
  for (const page of pages) {
    const textLower = page.text.toLowerCase();

    for (const keyword of keywords) {
      const kwLower = keyword.toLowerCase();
      let searchFrom = 0;

      while (true) {
        const idx = textLower.indexOf(kwLower, searchFrom);
        if (idx === -1) break;
        searchFrom = idx + 1;

        // Extract window around match
        const start = Math.max(0, idx - HALF_WINDOW);
        const end = Math.min(page.text.length, idx + keyword.length + HALF_WINDOW);
        const windowText = page.text.slice(start, end);

        // Check if this keyword appears in a title-like context
        // Find the line containing the keyword
        const lineStart = Math.max(0, page.text.lastIndexOf('\n', idx));
        const lineEnd = page.text.indexOf('\n', idx + keyword.length);
        const surroundingLine = page.text.slice(
          lineStart,
          lineEnd === -1 ? Math.min(page.text.length, idx + keyword.length + 80) : lineEnd
        );
        const isTitle = isTitleLike(surroundingLine);

        // Check how many keywords from this field match in the window
        const windowLower = windowText.toLowerCase();
        const matchedKeywords = keywords.filter((kw) =>
          windowLower.includes(kw.toLowerCase())
        );

        // Score: more keyword matches = higher score; title match = bonus
        let score = matchedKeywords.length;
        if (isTitle) score += 3;

        // Bonus for keyword density (many keywords in short text)
        if (matchedKeywords.length >= 3) score += 2;

        // Avoid duplicate overlapping candidates
        const isDuplicate = candidates.some(
          (c) =>
            c.page === page.page &&
            Math.abs(c.startOffset - start) < HALF_WINDOW
        );
        if (isDuplicate) continue;

        candidates.push({
          text: windowText,
          page: page.page,
          startOffset: start,
          endOffset: end,
          matchedKeywords: matchedKeywords.map(String),
          isTitle,
          score,
        });
      }
    }
  }

  // Sort by score descending, take top N
  candidates.sort((a, b) => b.score - a.score);
  return candidates.slice(0, maxCandidates);
}
