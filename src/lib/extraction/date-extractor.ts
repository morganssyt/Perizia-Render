/**
 * Extract and normalize Italian dates from text.
 * Handles: dd/mm/yyyy, dd-mm-yyyy, dd.mm.yyyy, "15 gennaio 2024", etc.
 */

export interface ExtractedDate {
  raw: string;
  normalized: string; // ISO format yyyy-mm-dd
  startIndex: number;
}

const MONTHS_IT: Record<string, string> = {
  gennaio: '01', febbraio: '02', marzo: '03', aprile: '04',
  maggio: '05', giugno: '06', luglio: '07', agosto: '08',
  settembre: '09', ottobre: '10', novembre: '11', dicembre: '12',
};

// dd/mm/yyyy or dd-mm-yyyy or dd.mm.yyyy
const DATE_NUMERIC = /(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/g;

// "15 gennaio 2024" or "15 Gennaio 2024"
const DATE_TEXTUAL = new RegExp(
  `(\\d{1,2})\\s+(${Object.keys(MONTHS_IT).join('|')})\\s+(\\d{4})`,
  'gi'
);

export function extractDates(text: string): ExtractedDate[] {
  const results: ExtractedDate[] = [];

  // Numeric dates
  let match: RegExpExecArray | null;
  const numericRegex = new RegExp(DATE_NUMERIC.source, DATE_NUMERIC.flags);
  while ((match = numericRegex.exec(text)) !== null) {
    const day = match[1].padStart(2, '0');
    const month = match[2].padStart(2, '0');
    const year = match[3];
    const monthNum = parseInt(month, 10);
    if (monthNum >= 1 && monthNum <= 12) {
      results.push({
        raw: match[0],
        normalized: `${year}-${month}-${day}`,
        startIndex: match.index,
      });
    }
  }

  // Textual dates
  const textualRegex = new RegExp(DATE_TEXTUAL.source, DATE_TEXTUAL.flags);
  while ((match = textualRegex.exec(text)) !== null) {
    const day = match[1].padStart(2, '0');
    const monthName = match[2].toLowerCase();
    const year = match[3];
    const month = MONTHS_IT[monthName];
    if (month) {
      results.push({
        raw: match[0],
        normalized: `${year}-${month}-${day}`,
        startIndex: match.index,
      });
    }
  }

  return results.sort((a, b) => a.startIndex - b.startIndex);
}
