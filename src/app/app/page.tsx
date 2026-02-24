'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getHistory, getEsitoFromResult, formatDate } from '@/lib/history';

type EsitoType = 'verde' | 'giallo' | 'rosso';

const ESITO_MAP: Record<EsitoType, { label: string; cls: string }> = {
  verde: { label: 'Verde', cls: 'bg-emerald-50 text-emerald-700 border border-emerald-200' },
  giallo: { label: 'Da verificare', cls: 'bg-amber-50 text-amber-700 border border-amber-200' },
  rosso: { label: 'Rischi', cls: 'bg-red-50 text-red-700 border border-red-200' },
};

const COSA_ANALIZZA = [
  { label: 'Valore di stima', icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
  { label: 'Difformità urbanistiche', icon: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z' },
  { label: 'Atti precedenti', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586l5.414 5.414V19a2 2 0 01-2 2z' },
  { label: 'Oneri e spese', icon: 'M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z' },
  { label: 'Indicatori di rischio', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
];

export default function AppHomePage() {
  const [name, setName] = useState('');
  const [recent, setRecent] = useState<Array<{
    id: string; fileName: string; analyzedAt: string; esito: EsitoType;
  }>>([]);
  const [stats, setStats] = useState({ total: 0, rossi: 0, lastAt: '' });

  useEffect(() => {
    try {
      const raw = localStorage.getItem('pa_user');
      if (raw) {
        const u = JSON.parse(raw);
        setName(u.name?.split(' ')[0] ?? '');
      }
    } catch { /* ok */ }

    const history = getHistory();
    const last5 = history.slice(0, 5);
    setRecent(last5.map((e) => ({
      id: e.id,
      fileName: e.fileName,
      analyzedAt: e.analyzedAt,
      esito: getEsitoFromResult(e.result),
    })));

    const rossi = history.filter((e) => getEsitoFromResult(e.result) === 'rosso').length;
    setStats({
      total: history.length,
      rossi,
      lastAt: history[0]?.analyzedAt ? formatDate(history[0].analyzedAt) : '—',
    });
  }, []);

  return (
    <div className="max-w-5xl mx-auto px-6 py-12">

      {/* Hero */}
      <div className="mb-12">
        <p className="text-xs font-semibold text-blue-700 uppercase tracking-widest mb-3">
          Area riservata
        </p>
        <h1 className="text-3xl font-bold text-slate-900 tracking-tight mb-2">
          {name ? `Benvenuto, ${name}.` : 'Bentornato.'}
        </h1>
        <p className="text-slate-500 mb-8">
          Analizza una nuova perizia o rivedi le tue analisi precedenti.
        </p>
        <Link
          href="/app/analyze"
          className="inline-flex items-center gap-2.5 px-8 py-3.5 bg-blue-700 text-white font-semibold rounded-xl hover:bg-blue-800 transition-colors text-base shadow-sm shadow-blue-200"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Nuova Analisi
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-12">
        {[
          { label: 'Analisi totali', value: stats.total === 0 ? '—' : stats.total, sub: 'nel tuo storico' },
          { label: 'Con rischi', value: stats.rossi === 0 ? '—' : stats.rossi, sub: 'esito rosso' },
          { label: 'Ultima attività', value: stats.lastAt, sub: 'analisi recente' },
        ].map((stat) => (
          <div key={stat.label} className="bg-white rounded-2xl border border-slate-200 p-5">
            <p className="text-xs text-slate-400 mb-1">{stat.label}</p>
            <p className="text-2xl font-bold text-slate-900">{stat.value}</p>
            <p className="text-xs text-slate-400 mt-0.5">{stat.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-8">

        {/* Recent analyses */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-semibold text-slate-700">Ultime analisi</p>
            {recent.length > 0 && (
              <Link href="/app/reports" className="text-sm text-blue-700 hover:text-blue-800 font-medium transition-colors">
                Vedi tutte →
              </Link>
            )}
          </div>

          {recent.length === 0 ? (
            <div className="bg-white border border-dashed border-slate-200 rounded-2xl p-10 text-center">
              <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center mx-auto mb-3">
                <svg className="w-5 h-5 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586l5.414 5.414V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <p className="text-sm text-slate-400 mb-2">Nessuna analisi ancora.</p>
              <Link href="/app/analyze" className="text-sm text-blue-700 font-medium hover:underline">
                Inizia la tua prima analisi →
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              {recent.map((entry) => {
                const esito = ESITO_MAP[entry.esito];
                return (
                  <Link
                    key={entry.id}
                    href={`/app/report/${entry.id}`}
                    className="flex items-center gap-4 bg-white border border-slate-100 rounded-xl px-5 py-4 hover:border-slate-200 hover:shadow-sm transition-all"
                  >
                    <div className="w-9 h-9 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center flex-shrink-0">
                      <svg className="w-4 h-4 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586l5.414 5.414V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{entry.fileName}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{formatDate(entry.analyzedAt)}</p>
                    </div>
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full flex-shrink-0 ${esito.cls}`}>
                      {esito.label}
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* Cosa analizza il sistema */}
        <div>
          <p className="text-sm font-semibold text-slate-700 mb-4">Cosa analizza il sistema</p>
          <div className="bg-white border border-slate-100 rounded-2xl p-6 space-y-4">
            {COSA_ANALIZZA.map((item) => (
              <div key={item.label} className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={item.icon} />
                  </svg>
                </div>
                <p className="text-sm text-slate-700 font-medium">{item.label}</p>
                <svg className="w-4 h-4 text-blue-500 ml-auto flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              </div>
            ))}
            <div className="pt-3 border-t border-slate-50">
              <Link
                href="/app/analyze"
                className="flex items-center justify-center gap-2 w-full py-2.5 bg-blue-50 text-blue-700 text-sm font-semibold rounded-xl hover:bg-blue-100 transition-colors"
              >
                Analizza ora
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </Link>
            </div>
          </div>

          {/* Quick links */}
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Link
              href="/app/reports"
              className="flex items-center gap-2.5 bg-white border border-slate-100 rounded-xl px-4 py-3 hover:border-slate-200 hover:shadow-sm transition-all"
            >
              <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586l5.414 5.414V19a2 2 0 01-2 2z" />
              </svg>
              <span className="text-sm font-medium text-slate-700">Report</span>
            </Link>
            <Link
              href="/app/account"
              className="flex items-center gap-2.5 bg-white border border-slate-100 rounded-xl px-4 py-3 hover:border-slate-200 hover:shadow-sm transition-all"
            >
              <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              <span className="text-sm font-medium text-slate-700">Account</span>
            </Link>
          </div>
        </div>

      </div>
    </div>
  );
}
