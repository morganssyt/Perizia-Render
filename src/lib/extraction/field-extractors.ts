import {
  AntecedentAct,
  LegalCost,
  Irregularity,
  ExpertValue,
  Citation,
  Candidate,
  PageText,
  SectionCandidate,
} from '@/types';
import { findSectionCandidates } from './section-finder';
import { extractAmounts } from './amount-extractor';
import { extractDates } from './date-extractor';
import { calculateConfidence } from './confidence';
import { ULTIMI_DUE_ANNI_PATTERNS } from './keywords';

// ── Helpers ──

function makeCitation(candidate: SectionCandidate, snippetLength = 200): Citation {
  return {
    page: candidate.page,
    snippet: candidate.text.slice(0, snippetLength).trim(),
    startOffset: candidate.startOffset,
    endOffset: candidate.endOffset,
  };
}

function makeCandidate(candidate: SectionCandidate, confidence: number): Candidate {
  return {
    value: candidate.text.slice(0, 300),
    confidence,
    reason: `Keyword match: ${candidate.matchedKeywords.join(', ')}${candidate.isTitle ? ' (in titolo)' : ''}`,
    citations: [makeCitation(candidate)],
  };
}

function topCandidates(sections: SectionCandidate[], max = 3): Candidate[] {
  return sections.slice(0, max).map((s) =>
    makeCandidate(s, calculateConfidence(s, sections.length))
  );
}

// ── A) Atti Antecedenti ──

export function extractAntecedentActs(pages: PageText[]): AntecedentAct[] {
  const sections = findSectionCandidates(pages, 'antecedentActs');

  if (sections.length === 0) {
    return [{
      tipoAtto: 'Non rilevato',
      sintesi: 'Non sono stati individuati atti antecedenti nel documento.',
      confidence: 0,
      reason: 'Nessun keyword match trovato. Cerca in: provenienza, titoli, formalità pregiudizievoli, iscrizioni, trascrizioni.',
      citations: [],
      candidates: [],
    }];
  }

  const results: AntecedentAct[] = [];

  for (const section of sections) {
    const confidence = calculateConfidence(section, sections.length);
    const dates = extractDates(section.text);

    const actTypes = [
      'compravendita', 'donazione', 'successione', 'decreto di trasferimento',
      'pignoramento', 'ipoteca', 'servitù', 'trascrizione', 'iscrizione',
      'formalità', 'vincolo',
    ];
    const foundTypes = actTypes.filter((t) =>
      section.text.toLowerCase().includes(t)
    );
    const tipoAtto = foundTypes.length > 0
      ? foundTypes.join(', ')
      : 'Atto generico';

    results.push({
      tipoAtto,
      data: dates.length > 0 ? dates[0].normalized : undefined,
      sintesi: section.text.slice(0, 500).trim(),
      confidence,
      reason: `Keyword match: ${section.matchedKeywords.join(', ')}${section.isTitle ? ' (titolo sezione)' : ''}`,
      citations: [makeCitation(section, 300)],
      candidates: topCandidates(sections),
    });
  }

  return results;
}

// ── B) Costi di Legge / Oneri ──

export function extractLegalCosts(pages: PageText[]): LegalCost[] {
  const sections = findSectionCandidates(pages, 'legalCosts');

  if (sections.length === 0) {
    return [{
      descrizione: 'Non rilevato',
      ultimiDueAnni: false,
      confidence: 0,
      reason: 'Nessun keyword match trovato. Cerca in: oneri, spese a carico, costi, arretrati, spese condominiali.',
      citations: [],
      candidates: [],
      note: 'Verificare manualmente i capitoli: oneri, spese a carico, costi.',
    }];
  }

  const results: LegalCost[] = [];

  for (const section of sections) {
    const confidence = calculateConfidence(section, sections.length);
    const amounts = extractAmounts(section.text);
    const textLower = section.text.toLowerCase();

    const ultimiDueAnni = ULTIMI_DUE_ANNI_PATTERNS.some((p) =>
      textLower.includes(p)
    );

    if (amounts.length > 0) {
      for (const amount of amounts) {
        const start = Math.max(0, amount.startIndex - 100);
        const end = Math.min(section.text.length, amount.startIndex + amount.raw.length + 100);
        const context = section.text.slice(start, end).trim();

        results.push({
          descrizione: context,
          importo: amount.value,
          importoRaw: amount.raw,
          ultimiDueAnni,
          confidence,
          reason: `Importo trovato: ${amount.raw}. Keywords: ${section.matchedKeywords.join(', ')}`,
          citations: [makeCitation(section, 300)],
          candidates: topCandidates(sections),
        });
      }
    } else {
      results.push({
        descrizione: section.text.slice(0, 500).trim(),
        ultimiDueAnni,
        confidence: Math.max(confidence - 0.1, 0),
        reason: `Sezione trovata ma nessun importo estratto. Keywords: ${section.matchedKeywords.join(', ')}`,
        citations: [makeCitation(section, 300)],
        candidates: topCandidates(sections),
      });
    }
  }

  return results;
}

// ── C) Difformità / Abusi ──

export function extractIrregularities(pages: PageText[]): Irregularity[] {
  const sections = findSectionCandidates(pages, 'irregularities');

  if (sections.length === 0) {
    return [{
      categoria: 'Non rilevato',
      descrizione: 'Non sono state individuate difformità nel documento.',
      gravita: 'media',
      impatto: 'Da verificare',
      stimaPresente: false,
      confidence: 0,
      reason: 'Nessun keyword match trovato. Cerca in: stato legittimo, conformità urbanistica/catastale, agibilità, difformità.',
      citations: [],
      candidates: [],
    }];
  }

  const results: Irregularity[] = [];

  const categories: Record<string, string[]> = {
    urbanistica: ['urbanistica', 'urbanistico', 'permesso di costruire', 'dia', 'scia', 'cila'],
    catastale: ['catastale', 'catasto', 'planimetria'],
    edilizia: ['edilizia', 'edilizio', 'abuso edilizio', 'opere abusive', 'condono'],
    impiantistica: ['impianti', 'impiantistica', 'certificazione impianti'],
    'agibilità': ['agibilità', 'abitabilità', 'certificato di agibilità'],
  };

  for (const section of sections) {
    const confidence = calculateConfidence(section, sections.length);
    const amounts = extractAmounts(section.text);
    const textLower = section.text.toLowerCase();

    let categoria = 'generica';
    for (const [cat, kws] of Object.entries(categories)) {
      if (kws.some((kw) => textLower.includes(kw))) {
        categoria = cat;
        break;
      }
    }

    let gravita: 'bassa' | 'media' | 'alta' = 'media';
    if (textLower.includes('abuso') || textLower.includes('opere abusive') || textLower.includes('non sanabile')) {
      gravita = 'alta';
    } else if (textLower.includes('lieve') || textLower.includes('minore') || textLower.includes('tolleranza')) {
      gravita = 'bassa';
    }

    const regolarizzabile = textLower.includes('regolarizzabil') || textLower.includes('sanabil');
    const necessitaOpere = textLower.includes('opere') || textLower.includes('intervento') || textLower.includes('lavori');
    const impatto = regolarizzabile
      ? 'Regolarizzabile' + (necessitaOpere ? ' (necessita opere)' : '')
      : necessitaOpere
      ? 'Necessita opere/intervento'
      : 'Da verificare';

    results.push({
      categoria,
      descrizione: section.text.slice(0, 500).trim(),
      gravita,
      impatto,
      costiEventuali: amounts.length > 0 ? amounts[0].value : undefined,
      costiRaw: amounts.length > 0 ? amounts[0].raw : undefined,
      stimaPresente: amounts.length > 0,
      confidence,
      reason: `Categoria: ${categoria}. Keywords: ${section.matchedKeywords.join(', ')}`,
      citations: [makeCitation(section, 300)],
      candidates: topCandidates(sections),
    });
  }

  return results;
}

// ── D) Valore del Perito ──

export function extractExpertValue(pages: PageText[]): ExpertValue {
  const sections = findSectionCandidates(pages, 'expertValue');

  if (sections.length === 0) {
    return {
      valuta: 'EUR',
      tipo: 'Non rilevato',
      confidence: 0,
      reason: 'Nessun keyword match trovato. Cerca in: determinazione del valore, valore di stima, prezzo base, base d\'asta.',
      citations: [],
      candidates: [],
    };
  }

  const valuePriority = [
    'valore di stima',
    'valore di perizia',
    'più probabile valore',
    'valore stimato',
    'valore di mercato',
    'valore venale',
    'valore commerciale',
    'prezzo base',
    'base d\'asta',
  ];

  let bestSection = sections[0];
  let bestType = 'valore di stima';

  for (const section of sections) {
    const textLower = section.text.toLowerCase();
    for (const vType of valuePriority) {
      if (textLower.includes(vType)) {
        bestSection = section;
        bestType = vType;
        break;
      }
    }
  }

  const confidence = calculateConfidence(bestSection, sections.length);
  const amounts = extractAmounts(bestSection.text);
  const dates = extractDates(bestSection.text);

  const sortedAmounts = [...amounts].sort((a, b) => b.value - a.value);
  const primaryAmount = sortedAmounts[0];

  let range: { min: number; max: number } | undefined;
  if (sortedAmounts.length >= 2) {
    range = {
      min: sortedAmounts[sortedAmounts.length - 1].value,
      max: sortedAmounts[0].value,
    };
  }

  return {
    valore: primaryAmount?.value,
    valoreRaw: primaryAmount?.raw,
    valuta: 'EUR',
    range,
    tipo: bestType,
    dataContesto: dates.length > 0 ? dates[0].normalized : undefined,
    confidence: primaryAmount ? confidence : Math.max(confidence - 0.2, 0),
    reason: `Tipo: ${bestType}. ${primaryAmount ? `Importo: ${primaryAmount.raw}` : 'Nessun importo trovato'}. Keywords: ${bestSection.matchedKeywords.join(', ')}`,
    citations: [makeCitation(bestSection, 300)],
    candidates: sections.slice(0, 3).map((s) => ({
      value: extractAmounts(s.text).sort((a, b) => b.value - a.value)[0]?.value ?? 0,
      confidence: calculateConfidence(s, sections.length),
      reason: `Keywords: ${s.matchedKeywords.join(', ')}`,
      citations: [makeCitation(s)],
    })),
  };
}
