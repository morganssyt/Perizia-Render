/**
 * rankPages  — scores each page for relevance in a perizia immobiliare.
 * selectPages — picks the best pages to pass to the LLM.
 *
 * Strategy:
 *   + points per keyword hit (perizia-specific vocabulary)
 *   − heavy penalty for copyright/watermark pages
 *   + bonus for long pages (real content)
 *   Always include: top-8 scored, any index/summary page, last 2 pages
 */

const KEYWORDS_POSITIVE = [
  'valore', 'stima', '€', 'euro', 'lotto', 'descrizione', 'superficie', 'mq',
  'catasto', 'conformità', 'urbanistica', 'difformità', 'abuso',
  'sanatoria', 'oneri', 'spese', 'condominio', 'occupato', 'libero',
  'stato di possesso', 'perito', 'ctu', 'rendita', 'categoria',
];

const KEYWORDS_NEGATIVE = [
  'copyright', 'riproduzione', 'autorizzazione', 'ministeriale', 'diritti riservati',
  'portale', 'avviso', 'pubblicazione ufficiale',
];

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ScoredPage {
  page: number;
  text: string;
  score: number;
  penalized: boolean;
  penaltyReason?: string;
}

// ── Exports ───────────────────────────────────────────────────────────────────

export function rankPages(pages: Array<{ page: number; text: string }>): ScoredPage[] {
  return pages.map((p) => {
    const lower = p.text.toLowerCase();
    let score = 0;
    let penalized = false;
    let penaltyReason: string | undefined;

    // Positive keywords
    for (const kw of KEYWORDS_POSITIVE) {
      if (lower.includes(kw)) score += 10;
    }

    // Length bonus (more text = more likely real content)
    if (p.text.length > 800)  score += 15;
    if (p.text.length > 1500) score += 10;

    // Strong penalty for cover/copyright pages
    for (const kw of KEYWORDS_NEGATIVE) {
      if (lower.includes(kw)) {
        score -= 100;
        penalized = true;
        penaltyReason = kw;
        break;
      }
    }

    return { page: p.page, text: p.text, score, penalized, penaltyReason };
  });
}

export function selectPages(scored: ScoredPage[], totalPages: number): number[] {
  const selected = new Set<number>();

  // Top 8 pages by score
  const sorted = [...scored].sort((a, b) => b.score - a.score);
  for (const p of sorted.slice(0, 8)) {
    selected.add(p.page);
  }

  // Index / sommario page (short page with structural keywords)
  for (const p of scored) {
    const lower = p.text.toLowerCase();
    if (
      (lower.includes('indice') || lower.includes('sommario')) &&
      p.text.length < 2000
    ) {
      selected.add(p.page);
    }
  }

  // Last 2 pages — often contain final valuation and signatures
  for (let i = Math.max(1, totalPages - 1); i <= totalPages; i++) {
    selected.add(i);
  }

  return Array.from(selected).sort((a, b) => a - b);
}
