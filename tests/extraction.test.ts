import { describe, it, expect } from 'vitest';
import { findSectionCandidates } from '../src/lib/extraction/section-finder';
import { calculateConfidence } from '../src/lib/extraction/confidence';
import { PageText } from '../src/types';

const mockPages: PageText[] = [
  {
    page: 1,
    text: 'PERIZIA DI STIMA - TRIBUNALE DI MILANO Procedura esecutiva n. 123/2024 Il sottoscritto perito incaricato procede alla stima del bene immobile.',
  },
  {
    page: 3,
    text: `CAPITOLO 4 - ATTI ANTECEDENTI E PROVENIENZA
L'immobile proviene da atto di compravendita stipulato in data 15/03/2010 presso il notaio Rossi, repertorio n. 12345, raccolta n. 6789.
Trascrizione presso la Conservatoria dei Registri Immobiliari di Milano al n. 45678/2010.
Si segnala la presenza di un pignoramento trascritto in data 20/05/2023.
Ipoteca iscritta a favore della Banca Esempio per € 200.000,00.`,
  },
  {
    page: 5,
    text: `6.1 CONFORMITÀ URBANISTICA E CATASTALE
Si rilevano le seguenti difformità:
- Difformità catastale: la planimetria non corrisponde allo stato attuale. Chiusura balcone non autorizzata.
- Abuso edilizio: realizzazione di un soppalco senza permesso di costruire.
La regolarizzazione è possibile mediante SCIA in sanatoria con costi stimati di € 5.000,00.
L'agibilità non risulta rilasciata.`,
  },
  {
    page: 7,
    text: `ONERI E SPESE A CARICO DELL'AGGIUDICATARIO
Spese condominiali arretrate ultimi due anni: € 3.450,00
Imposte e tributi dovuti: secondo normativa vigente
Spese per regolarizzazione urbanistica: € 5.000,00 (stimate)
Spese di liberazione: a carico della procedura`,
  },
  {
    page: 9,
    text: `DETERMINAZIONE DEL VALORE
Sulla base di quanto sopra esposto, il valore di stima dell'immobile, nello stato di fatto e di diritto in cui si trova, è determinato in:
Valore di mercato: € 185.000,00
Considerati i costi di regolarizzazione e gli oneri, il valore di stima ai fini della vendita è pari a € 165.000,00 (centosessantacinquemila/00 euro).`,
  },
];

describe('findSectionCandidates', () => {
  it('finds antecedent acts section', () => {
    const candidates = findSectionCandidates(mockPages, 'antecedentActs');
    expect(candidates.length).toBeGreaterThan(0);
    const topCandidate = candidates[0];
    expect(topCandidate.page).toBe(3);
    expect(topCandidate.matchedKeywords.length).toBeGreaterThan(0);
  });

  it('finds legal costs section', () => {
    const candidates = findSectionCandidates(mockPages, 'legalCosts');
    expect(candidates.length).toBeGreaterThan(0);
    const hasPage7 = candidates.some((c) => c.page === 7);
    expect(hasPage7).toBe(true);
  });

  it('finds irregularities section', () => {
    const candidates = findSectionCandidates(mockPages, 'irregularities');
    expect(candidates.length).toBeGreaterThan(0);
    const hasPage5 = candidates.some((c) => c.page === 5);
    expect(hasPage5).toBe(true);
  });

  it('finds expert value section', () => {
    const candidates = findSectionCandidates(mockPages, 'expertValue');
    expect(candidates.length).toBeGreaterThan(0);
    const hasPage9 = candidates.some((c) => c.page === 9);
    expect(hasPage9).toBe(true);
  });
});

describe('calculateConfidence', () => {
  it('gives higher confidence for title matches', () => {
    const titleCandidate = {
      text: 'ATTI ANTECEDENTI...',
      page: 3,
      startOffset: 0,
      endOffset: 500,
      matchedKeywords: ['atti antecedenti', 'provenienza'],
      isTitle: true,
      score: 5,
    };

    const bodyCandidate = {
      text: 'riferimento a provenienza...',
      page: 4,
      startOffset: 0,
      endOffset: 200,
      matchedKeywords: ['provenienza'],
      isTitle: false,
      score: 1,
    };

    const titleConf = calculateConfidence(titleCandidate, 2);
    const bodyConf = calculateConfidence(bodyCandidate, 2);
    expect(titleConf).toBeGreaterThan(bodyConf);
  });

  it('gives higher confidence for single candidates', () => {
    const candidate = {
      text: 'Some text...',
      page: 1,
      startOffset: 0,
      endOffset: 300,
      matchedKeywords: ['keyword1', 'keyword2'],
      isTitle: false,
      score: 2,
    };

    const singleConf = calculateConfidence(candidate, 1);
    const multiConf = calculateConfidence(candidate, 5);
    expect(singleConf).toBeGreaterThan(multiConf);
  });
});
