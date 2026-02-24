/**
 * Deterministic keyword/regex pre-pass for perizia immobiliare extraction.
 * Finds candidate windows around keyword hits per category and builds a
 * focused prompt payload instead of sending the whole document.
 */

// ---------------------------------------------------------------------------
// Keyword dictionaries (Italian legal / real-estate vocabulary)
// ---------------------------------------------------------------------------
export const CATEGORY_KEYWORDS = {
  valore: [
    'valore di stima',
    'stima',
    'prezzo base',
    'valore del perito',
    'determinazione del valore',
    'valore di mercato',
    'valore venale',
    'valore commerciale',
    "base d'asta",
    "prezzo d'asta",
    'quotazioni omi',
    'valore unitario',
    'prezzo al mq',
    'valutazione',
    'perizia di stima',
    'stimato in',
    'si stima',
    'stimabile in',
  ],
  atti: [
    'provenienza',
    'titolo di provenienza',
    'atti antecedenti',
    'atti precedenti',
    'trascrizione',
    'iscrizione',
    'ipoteca',
    'pignoramento',
    'servitù',
    'formalità',
    'ventennio',
    'pregiudizievoli',
    'compravendita',
    'donazione',
    'successione',
    'atto notarile',
    'nota di trascrizione',
    'formalità pregiudizievoli',
    'atti pregiudizievoli',
    'visura ipotecaria',
    'storia catastale',
  ],
  costi: [
    'spese condominiali',
    'oneri condominiali',
    'a carico',
    'aggiudicatario',
    'condominio',
    'arretrate',
    'ultimi due anni',
    'ultimi 2 anni',
    'biennio',
    'tributi',
    'imposte',
    'regolarizzazione',
    'imu',
    'tari',
    'spese',
    'oneri',
    'debito',
    'morosità',
    'quota condominiale',
    'rate condominiali',
  ],
  difformita: [
    'difformità',
    'non conforme',
    'abuso',
    'sanatoria',
    'stato legittimo',
    'conformità urbanistica',
    'conformità catastale',
    'agibilità',
    'impianti',
    'permesso di costruire',
    'concessione edilizia',
    'condono',
    'abuso edilizio',
    'planimetria',
    'vincolo ambientale',
    'vincolo paesaggistico',
    'irregolarità',
    'variazione catastale',
    'difformità catastale',
    'difformità urbanistica',
    'certificato di agibilità',
  ],
} as const;

export type Category = keyof typeof CATEGORY_KEYWORDS;

export interface PageText {
  page: number;
  text: string;
}

export interface KeywordHit {
  category: Category;
  keyword: string;
  page: number;
}

export interface CandidateWindow {
  category: Category;
  page: number;
  keyword: string;
  text: string;
}

export interface PrepassResult {
  totalPages: number;
  totalChars: number;
  charsPerPage: Array<{ page: number; chars: number }>;
  textCoverage: number; // avg chars/page
  isScanDetected: boolean;
  keywordHits: KeywordHit[];
  hitsPerCategory: Record<Category, number>;
  candidateWindows: CandidateWindow[];
  first2000chars: string;
  last2000chars: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const WINDOW_RADIUS = 1200; // chars before/after hit
const MAX_WINDOWS_PER_CATEGORY = 8;
const SCAN_TOTAL_CHARS_THRESHOLD = 800;
const SCAN_AVG_CHARS_THRESHOLD = 80;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function dedupeWindows(windows: CandidateWindow[]): CandidateWindow[] {
  const seen = new Set<string>();
  return windows.filter((w) => {
    // Key: category + page + first 120 chars of text
    const key = `${w.category}:${w.page}:${w.text.slice(0, 120)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ---------------------------------------------------------------------------
// Main pre-pass function
// ---------------------------------------------------------------------------
export function runKeywordPrepass(pages: PageText[]): PrepassResult {
  const totalPages = pages.length;
  const charsPerPage = pages.map((p) => ({ page: p.page, chars: p.text.length }));
  const totalChars = charsPerPage.reduce((s, p) => s + p.chars, 0);
  const textCoverage = totalPages > 0 ? totalChars / totalPages : 0;
  const isScanDetected =
    totalChars < SCAN_TOTAL_CHARS_THRESHOLD || textCoverage < SCAN_AVG_CHARS_THRESHOLD;

  const keywordHits: KeywordHit[] = [];
  const windowsByCategory: Record<Category, CandidateWindow[]> = {
    valore: [],
    atti: [],
    costi: [],
    difformita: [],
  };

  for (const pageObj of pages) {
    const lowerText = pageObj.text.toLowerCase();

    for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS) as [
      Category,
      readonly string[],
    ][]) {
      for (const keyword of keywords) {
        const lowerKw = keyword.toLowerCase();
        let searchFrom = 0;

        while (true) {
          const idx = lowerText.indexOf(lowerKw, searchFrom);
          if (idx === -1) break;

          keywordHits.push({ category, keyword, page: pageObj.page });

          if (windowsByCategory[category].length < MAX_WINDOWS_PER_CATEGORY) {
            const windowStart = Math.max(0, idx - WINDOW_RADIUS);
            const windowEnd = Math.min(pageObj.text.length, idx + WINDOW_RADIUS);
            windowsByCategory[category].push({
              category,
              page: pageObj.page,
              keyword,
              text: pageObj.text.slice(windowStart, windowEnd),
            });
          }

          searchFrom = idx + lowerKw.length;
        }
      }
    }
  }

  // Dedupe and cap per category
  for (const cat of Object.keys(windowsByCategory) as Category[]) {
    windowsByCategory[cat] = dedupeWindows(windowsByCategory[cat]).slice(
      0,
      MAX_WINDOWS_PER_CATEGORY,
    );
  }

  const candidateWindows: CandidateWindow[] = (
    Object.keys(windowsByCategory) as Category[]
  ).flatMap((cat) => windowsByCategory[cat]);

  const hitsPerCategory = Object.fromEntries(
    (Object.keys(CATEGORY_KEYWORDS) as Category[]).map((cat) => [
      cat,
      keywordHits.filter((h) => h.category === cat).length,
    ]),
  ) as Record<Category, number>;

  const fullText = pages.map((p) => p.text).join('\n');

  return {
    totalPages,
    totalChars,
    charsPerPage,
    textCoverage,
    isScanDetected,
    keywordHits,
    hitsPerCategory,
    candidateWindows,
    first2000chars: fullText.slice(0, 2000),
    last2000chars: fullText.slice(-2000),
  };
}

// ---------------------------------------------------------------------------
// Build the focused prompt payload for OpenAI
// ---------------------------------------------------------------------------
const CATEGORY_LABELS: Record<Category, string> = {
  valore: 'VALORE DEL PERITO',
  atti: 'ATTI ANTECEDENTI',
  costi: 'COSTI E ONERI',
  difformita: 'DIFFORMITÀ E ABUSI',
};

export function buildPromptPayload(prepass: PrepassResult, pages: PageText[]): string {
  const totalHits = Object.values(prepass.hitsPerCategory).reduce((s, n) => s + n, 0);

  const sections: string[] = [];

  for (const cat of Object.keys(CATEGORY_KEYWORDS) as Category[]) {
    const hits = prepass.hitsPerCategory[cat];
    const windows = prepass.candidateWindows.filter((w) => w.category === cat);
    const label = CATEGORY_LABELS[cat];

    let section = `${'='.repeat(60)}\nCATEGORIA: ${label} — ${hits} keyword hit${hits !== 1 ? 's' : ''}\n${'='.repeat(60)}\n\n`;

    if (windows.length === 0) {
      section +=
        totalHits === 0
          ? '(Nessuna corrispondenza trovata — vedi testo di fallback in fondo)\n'
          : '(Nessuna finestra trovata per questa categoria)\n';
    } else {
      section += windows
        .map(
          (w, i) =>
            `[Finestra ${i + 1} — Pagina ${w.page} — keyword: "${w.keyword}"]\n${w.text}`,
        )
        .join('\n\n---\n\n');
    }

    sections.push(section);
  }

  let payload = sections.join('\n\n');

  // Failsafe: if NOTHING matched, append first 2 + last 2 + top 2 pages by length
  if (totalHits === 0) {
    const byLength = [...pages].sort((a, b) => b.text.length - a.text.length);
    const fallbackCandidates = [
      ...pages.slice(0, 2),
      ...pages.slice(-2),
      ...byLength.slice(0, 2),
    ];
    const seenPages = new Set<number>();
    const uniqueFallback = fallbackCandidates.filter((p) => {
      if (seenPages.has(p.page)) return false;
      seenPages.add(p.page);
      return true;
    });

    payload +=
      `\n\n${'='.repeat(60)}\n` +
      `TESTO DI FALLBACK (nessun keyword trovato — usa questo per tentare l'estrazione)\n` +
      `${'='.repeat(60)}\n\n` +
      uniqueFallback
        .map((p) => `[Pagina ${p.page}]\n${p.text}`)
        .join('\n\n---\n\n');
  }

  return payload;
}
