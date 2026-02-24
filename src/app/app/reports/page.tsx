'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  getHistory,
  deleteHistoryEntry,
  getEsitoFromResult,
  formatDate,
  type HistoryEntry,
} from '@/lib/history';

function EsitoBadge({ esito }: { esito: 'verde' | 'giallo' | 'rosso' }) {
  const map = {
    verde: { label: 'Verde', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    giallo: { label: 'Da verificare', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
    rosso: { label: 'Rischi', cls: 'bg-red-50 text-red-700 border-red-200' },
  }[esito];
  return (
    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${map.cls}`}>
      {map.label}
    </span>
  );
}

type FilterType = 'tutti' | 'verde' | 'giallo' | 'rosso';

export default function ReportsPage() {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [filter, setFilter] = useState<FilterType>('tutti');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    setHistory(getHistory());
    setLoaded(true);
  }, []);

  const filtered =
    filter === 'tutti'
      ? history
      : history.filter((e) => getEsitoFromResult(e.result) === filter);

  const handleDelete = (id: string) => {
    setDeletingId(id);
    setTimeout(() => {
      deleteHistoryEntry(id);
      setHistory(getHistory());
      setDeletingId(null);
    }, 300);
  };

  const FILTERS: { value: FilterType; label: string }[] = [
    { value: 'tutti', label: 'Tutti' },
    { value: 'verde', label: 'Verde' },
    { value: 'giallo', label: 'Da verificare' },
    { value: 'rosso', label: 'Rischi' },
  ];

  return (
    <div className="max-w-3xl mx-auto px-6 py-10">

      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 mb-1">Report</h1>
          <p className="text-sm text-slate-400">{history.length} analisi salvate</p>
        </div>
        <Link
          href="/app/analyze"
          className="flex items-center gap-1.5 px-4 py-2 bg-blue-700 text-white text-sm font-medium rounded-xl hover:bg-blue-800 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Nuova
        </Link>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-2 mb-6">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filter === f.value
                ? 'bg-slate-900 text-white'
                : 'bg-white text-slate-500 border border-slate-200 hover:border-slate-300'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* List */}
      {!loaded ? (
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-20 bg-slate-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-slate-100 rounded-2xl p-14 text-center">
          <div className="w-12 h-12 bg-slate-50 rounded-xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586l5.414 5.414V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <p className="text-slate-400 text-sm">
            {filter === 'tutti' ? (
              <>
                Nessun report.{' '}
                <Link href="/app/analyze" className="text-blue-700 font-medium hover:underline">
                  Inizia subito →
                </Link>
              </>
            ) : (
              'Nessun report corrisponde al filtro selezionato.'
            )}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((entry) => {
            const esito = getEsitoFromResult(entry.result);
            const isDeleting = deletingId === entry.id;
            return (
              <div
                key={entry.id}
                className={`flex items-center gap-4 bg-white border border-slate-100 rounded-xl px-5 py-4 transition-all ${
                  isDeleting ? 'opacity-40 scale-[0.99]' : 'hover:border-slate-200 hover:shadow-sm'
                }`}
              >
                <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586l5.414 5.414V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-slate-800 text-sm truncate">{entry.fileName}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{formatDate(entry.analyzedAt)}</p>
                </div>
                <EsitoBadge esito={esito} />
                <div className="flex items-center gap-1 flex-shrink-0">
                  <Link
                    href={`/app/report/${entry.id}`}
                    className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-lg transition-colors"
                  >
                    Apri
                  </Link>
                  <button
                    onClick={() => handleDelete(entry.id)}
                    className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    title="Elimina"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
