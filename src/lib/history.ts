import type { AnalysisResult } from '@/app/api/analyze/route';

export interface HistoryEntry {
  id: string;
  fileName: string;
  analyzedAt: string;
  result: AnalysisResult;
}

const STORAGE_KEY = 'pa_history';

export function getHistory(): HistoryEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as HistoryEntry[]) : [];
  } catch {
    return [];
  }
}

export function saveToHistory(fileName: string, result: AnalysisResult): string {
  const id =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Date.now().toString(36);

  const entry: HistoryEntry = {
    id,
    fileName,
    analyzedAt: new Date().toISOString(),
    result,
  };

  const existing = getHistory();
  const updated = [entry, ...existing].slice(0, 50); // keep last 50
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch {
    /* localStorage full or unavailable */
  }
  return id;
}

export function getHistoryEntry(id: string): HistoryEntry | null {
  return getHistory().find((e) => e.id === id) ?? null;
}

export function deleteHistoryEntry(id: string): void {
  const updated = getHistory().filter((e) => e.id !== id);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch {
    /* localStorage error */
  }
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function getEsitoFromResult(result: AnalysisResult): 'verde' | 'giallo' | 'rosso' {
  const difformita = result.difformita;
  const costi = result.costi_oneri;

  if (difformita.status === 'found' && difformita.confidence >= 0.7) return 'rosso';
  if (difformita.status === 'found' || costi.status === 'found') return 'giallo';
  return 'verde';
}
