import { describe, it, expect } from 'vitest';
import { generateDeterministicSummary } from '../src/lib/summary';
import { ExtractionFields } from '../src/types';

describe('generateDeterministicSummary', () => {
  it('generates summary with found values', () => {
    const fields: ExtractionFields = {
      expertValue: {
        valore: 165000,
        valoreRaw: '€ 165.000,00',
        valuta: 'EUR',
        tipo: 'valore di stima',
        confidence: 0.8,
        reason: 'test',
        citations: [{ page: 9, snippet: 'test snippet' }],
        candidates: [],
      },
      antecedentActs: [{
        tipoAtto: 'compravendita',
        data: '2024-03-15',
        sintesi: 'Atto di compravendita',
        confidence: 0.7,
        reason: 'test',
        citations: [],
        candidates: [],
      }],
      legalCosts: [{
        descrizione: 'Spese condominiali',
        importo: 3450,
        importoRaw: '€ 3.450,00',
        ultimiDueAnni: true,
        confidence: 0.6,
        reason: 'test',
        citations: [],
        candidates: [],
      }],
      irregularities: [{
        categoria: 'catastale',
        descrizione: 'Difformità catastale',
        gravita: 'media',
        impatto: 'Regolarizzabile',
        stimaPresente: false,
        confidence: 0.5,
        reason: 'test',
        citations: [],
        candidates: [],
      }],
    };

    const summary = generateDeterministicSummary(fields);

    expect(summary.summaryAsset).toContain('165.000');
    expect(summary.summaryAsset).toContain('valore di stima');
    expect(summary.summaryRisks).toContain('catastale');
    expect(summary.summaryRisks).toContain('ultimi 2 anni');
    expect(summary.summaryActions).toContain('compravendita');
    expect(summary.summaryActions).toContain('Checklist operativa');
  });

  it('generates summary with not-found values', () => {
    const fields: ExtractionFields = {
      expertValue: {
        valuta: 'EUR',
        tipo: 'Non rilevato',
        confidence: 0,
        reason: 'test',
        citations: [],
        candidates: [],
      },
      antecedentActs: [{
        tipoAtto: 'Non rilevato',
        sintesi: 'Non trovato',
        confidence: 0,
        reason: 'test',
        citations: [],
        candidates: [],
      }],
      legalCosts: [{
        descrizione: 'Non rilevato',
        ultimiDueAnni: false,
        confidence: 0,
        reason: 'test',
        citations: [],
        candidates: [],
      }],
      irregularities: [{
        categoria: 'Non rilevato',
        descrizione: 'Non trovato',
        gravita: 'media',
        impatto: 'Da verificare',
        stimaPresente: false,
        confidence: 0,
        reason: 'test',
        citations: [],
        candidates: [],
      }],
    };

    const summary = generateDeterministicSummary(fields);

    expect(summary.summaryAsset).toContain('NON RILEVATO');
    expect(summary.summaryRisks).toContain('NON RILEVATI');
    expect(summary.summaryActions).toContain('NON RILEVATI');
    expect(summary.summaryActions).toContain('[ ]'); // unchecked items
  });
});
