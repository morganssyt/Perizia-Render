import { describe, it, expect } from 'vitest';
import {
  extractAntecedentActs,
  extractLegalCosts,
  extractIrregularities,
  extractExpertValue,
} from '../src/lib/extraction/field-extractors';
import { PageText } from '../src/types';

// Simulated perizia text (realistic Italian legal document)
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

describe('extractAntecedentActs', () => {
  it('finds acts with confidence > 0', () => {
    const results = extractAntecedentActs(mockPages);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].confidence).toBeGreaterThan(0);
  });

  it('identifies act types', () => {
    const results = extractAntecedentActs(mockPages);
    const found = results.some(r =>
      r.tipoAtto.includes('compravendita') || r.tipoAtto.includes('pignoramento') || r.tipoAtto.includes('ipoteca')
    );
    expect(found).toBe(true);
  });

  it('includes citations with page numbers', () => {
    const results = extractAntecedentActs(mockPages);
    const withCitations = results.filter(r => r.citations.length > 0);
    expect(withCitations.length).toBeGreaterThan(0);
    expect(withCitations[0].citations[0].page).toBe(3);
  });
});

describe('extractLegalCosts', () => {
  it('finds costs with amounts', () => {
    const results = extractLegalCosts(mockPages);
    const withAmounts = results.filter(r => r.importo && r.importo > 0);
    expect(withAmounts.length).toBeGreaterThan(0);
  });

  it('detects "ultimi due anni"', () => {
    const results = extractLegalCosts(mockPages);
    const withUltimi = results.some(r => r.ultimiDueAnni);
    expect(withUltimi).toBe(true);
  });
});

describe('extractIrregularities', () => {
  it('finds irregularities', () => {
    const results = extractIrregularities(mockPages);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].confidence).toBeGreaterThan(0);
  });

  it('detects category', () => {
    const results = extractIrregularities(mockPages);
    const categories = results.map(r => r.categoria);
    expect(categories.some(c => c !== 'Non rilevato')).toBe(true);
  });

  it('estimates severity for abuso', () => {
    const results = extractIrregularities(mockPages);
    const alta = results.some(r => r.gravita === 'alta');
    expect(alta).toBe(true);
  });
});

describe('extractExpertValue', () => {
  it('finds value amount', () => {
    const result = extractExpertValue(mockPages);
    expect(result.valore).toBeDefined();
    expect(result.valore).toBeGreaterThan(0);
  });

  it('identifies correct value type', () => {
    const result = extractExpertValue(mockPages);
    expect(result.tipo).not.toBe('Non rilevato');
  });

  it('has confidence > 0', () => {
    const result = extractExpertValue(mockPages);
    expect(result.confidence).toBeGreaterThan(0);
  });

  it('finds the primary value (largest)', () => {
    const result = extractExpertValue(mockPages);
    // Should find 185000 or 165000
    expect(result.valore).toBeGreaterThanOrEqual(165000);
  });
});

describe('not-found handling', () => {
  it('returns confidence 0 for empty pages', () => {
    const emptyPages: PageText[] = [{ page: 1, text: 'Testo generico senza keyword rilevanti.' }];

    expect(extractAntecedentActs(emptyPages)[0].confidence).toBe(0);
    expect(extractLegalCosts(emptyPages)[0].confidence).toBe(0);
    expect(extractIrregularities(emptyPages)[0].confidence).toBe(0);
    expect(extractExpertValue(emptyPages).confidence).toBe(0);
  });

  it('includes suggestion in reason when not found', () => {
    const emptyPages: PageText[] = [{ page: 1, text: 'Niente di utile qui.' }];

    expect(extractAntecedentActs(emptyPages)[0].reason).toContain('Cerca in:');
    expect(extractExpertValue(emptyPages).reason).toContain('Cerca in:');
  });
});
