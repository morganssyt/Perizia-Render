'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getHistory, getEsitoFromResult, formatDate, type HistoryEntry } from '@/lib/history';

function EsitoDot({ esito }: { esito: 'verde' | 'giallo' | 'rosso' }) {
  const cls =
    esito === 'verde'
      ? 'bg-emerald-500'
      : esito === 'giallo'
        ? 'bg-amber-400'
        : 'bg-red-500';
  return <span className={`inline-block w-2 h-2 rounded-full ${cls}`} />;
}

export default function DashboardPage() {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setHistory(getHistory().slice(0, 5));
    setLoaded(true);
  }, []);

  const totalAnalisi = history.length;
  const rischiosi = history.filter(
    (e) => getEsitoFromResult(e.result) === 'rosso',
  ).length;

  return (
    <div className="max-w-5xl mx-auto px-6 py-10">

      <div className="mb-10">
        <h1 className="text-2xl font-bold text-slate-900 mb-1">Dashboard</h1>
        <p className="text-slate-500 text-sm">Panoramica delle tue analisi recenti.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-10">
        {[
          { label: 'Analisi totali', value: totalAnalisi, sub: 'nel tuo storico' },
          { label: 'Con rischi', value: rischiosi, sub: 'esito rosso' },
          { label: 'Piano attivo', value: 'Free', sub: '1 analisi inclusa' },
          { label: 'Crediti rimasti', value: totalAnalisi === 0 ? 1 : 0, sub: 'analisi disponibili' },
        ].map((stat) => (
          <div key={stat.label} className="bg-white rounded-2xl border border-slate-200 p-5">
            <p className="text-xs text-slate-400 mb-1">{stat.label}</p>
            <p className="text-2xl font-bold text-slate-900">{stat.value}</p>
            <p className="text-xs text-slate-400 mt-0.5">{stat.sub}</p>
          </div>
        ))}
      </div>

      {/* Upload CTA */}
      <Link
        href="/app/analyze"
        className="group mb-10 flex flex-col items-center justify-center w-full bg-white border-2 border-dashed border-slate-200 rounded-2xl p-10 hover:border-blue-300 hover:bg-blue-50/30 transition-all"
      >
        <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center mb-4 group-hover:bg-blue-100 transition-colors">
          <svg className="w-6 h-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
        </div>
        <p className="font-semibold text-slate-900 mb-1">Carica una nuova perizia</p>
        <p className="text-sm text-slate-400">PDF · max 15 MB · analisi in 30 secondi</p>
      </Link>

      {/* Recent analyses */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-slate-900">Ultime analisi</h2>
          {history.length > 0 && (
            <Link href="/app/reports" className="text-sm text-blue-700 hover:underline">
              Vedi tutte →
            </Link>
          )}
        </div>

        {!loaded ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 bg-slate-100 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : history.length === 0 ? (
          <div className="bg-white border border-slate-100 rounded-2xl p-10 text-center">
            <p className="text-slate-400 text-sm">
              Nessuna analisi ancora.{' '}
              <Link href="/app/analyze" className="text-blue-700 font-medium hover:underline">
                Inizia ora →
              </Link>
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {history.map((entry) => {
              const esito = getEsitoFromResult(entry.result);
              return (
                <Link
                  key={entry.id}
                  href={`/app/report/${entry.id}`}
                  className="flex items-center gap-4 bg-white border border-slate-100 rounded-xl px-5 py-4 hover:border-slate-200 hover:shadow-sm transition-all group"
                >
                  <div className="w-9 h-9 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center flex-shrink-0">
                    <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586l5.414 5.414V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-800 text-sm truncate">{entry.fileName}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{formatDate(entry.analyzedAt)}</p>
                  </div>
                  <EsitoDot esito={esito} />
                  <svg className="w-4 h-4 text-slate-300 group-hover:text-slate-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
