import { describe, it, expect } from 'vitest';
import { normalizeAmount, extractAmounts } from '../src/lib/extraction/amount-extractor';

describe('normalizeAmount', () => {
  it('handles Italian format: 123.456,78', () => {
    expect(normalizeAmount('123.456,78')).toBe(123456.78);
  });

  it('handles ambiguous format 123.456 (dot as decimal when no comma)', () => {
    // Without comma, 123.456 is ambiguous; parser treats single dot as decimal
    expect(normalizeAmount('123.456')).toBe(123.456);
  });

  it('handles Italian thousands with explicit decimal: 123.456,00', () => {
    expect(normalizeAmount('123.456,00')).toBe(123456);
  });

  it('handles simple number with comma decimal: 1.234,56', () => {
    expect(normalizeAmount('1.234,56')).toBe(1234.56);
  });

  it('handles English format: 123,456.78', () => {
    expect(normalizeAmount('123,456.78')).toBe(123456.78);
  });

  it('handles simple number: 5000', () => {
    expect(normalizeAmount('5000')).toBe(5000);
  });

  it('handles number with only comma: 5000,50', () => {
    expect(normalizeAmount('5000,50')).toBe(5000.50);
  });

  it('returns 0 for invalid input', () => {
    expect(normalizeAmount('abc')).toBe(0);
  });
});

describe('extractAmounts', () => {
  it('extracts € amounts', () => {
    const text = 'Il valore è pari a € 123.456,78 come indicato.';
    const amounts = extractAmounts(text);
    expect(amounts.length).toBeGreaterThanOrEqual(1);
    expect(amounts[0].value).toBe(123456.78);
  });

  it('extracts amounts with euro keyword', () => {
    const text = 'Spese pari a 5.000,00 euro per regolarizzazione.';
    const amounts = extractAmounts(text);
    expect(amounts.length).toBeGreaterThanOrEqual(1);
    expect(amounts[0].value).toBe(5000);
  });

  it('extracts multiple amounts', () => {
    const text = 'Importo € 10.000,00 e ulteriori € 5.000,00.';
    const amounts = extractAmounts(text);
    expect(amounts.length).toBeGreaterThanOrEqual(2);
  });

  it('returns empty for text without amounts', () => {
    const text = 'Non ci sono importi in questo testo.';
    const amounts = extractAmounts(text);
    expect(amounts.length).toBe(0);
  });
});
