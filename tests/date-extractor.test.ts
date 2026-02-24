import { describe, it, expect } from 'vitest';
import { extractDates } from '../src/lib/extraction/date-extractor';

describe('extractDates', () => {
  it('extracts dd/mm/yyyy dates', () => {
    const text = 'Data dell\'atto: 15/03/2024 presso il notaio.';
    const dates = extractDates(text);
    expect(dates.length).toBe(1);
    expect(dates[0].normalized).toBe('2024-03-15');
  });

  it('extracts dd-mm-yyyy dates', () => {
    const text = 'Stipulato in data 01-12-2023.';
    const dates = extractDates(text);
    expect(dates.length).toBe(1);
    expect(dates[0].normalized).toBe('2023-12-01');
  });

  it('extracts textual Italian dates', () => {
    const text = 'Il 5 gennaio 2024 è stato effettuato il sopralluogo.';
    const dates = extractDates(text);
    expect(dates.length).toBe(1);
    expect(dates[0].normalized).toBe('2024-01-05');
  });

  it('extracts multiple dates', () => {
    const text = 'Atto del 10/05/2020 e successiva modifica del 3 marzo 2022.';
    const dates = extractDates(text);
    expect(dates.length).toBe(2);
  });

  it('returns empty for text without dates', () => {
    const text = 'Nessuna data presente nel testo.';
    const dates = extractDates(text);
    expect(dates.length).toBe(0);
  });
});
