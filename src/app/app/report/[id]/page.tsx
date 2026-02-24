'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { getHistoryEntry, getEsitoFromResult, formatDate, type HistoryEntry } from '@/lib/history';
import FieldSection from '@/components/results/FieldSection';
import SummarySection from '@/components/results/SummarySection';
import ExportMenu from '@/components/export/ExportMenu';
import { usePersistenceById } from '@/hooks/usePersistenceById';
import type { AnalysisResult } from '@/app/api/analyze/route';

const FIELDS = [
  {
    key: 'valore_perito' as const,
    title: 'Valore del Perito',
    icon: '💰',
    description: "Il valore stimato dal perito per l'immobile.",
  },
  {
    key: 'atti_antecedenti' as const,
    title: 'Atti Antecedenti',
    icon: '📜',
    description: "Compravendite, ipoteche e atti precedenti che gravano sull'immobile.",
  },
  {
    key: 'costi_oneri' as const,
    title: 'Costi e Oneri',
    icon: '📋',
    description: "Spese condominiali arretrate e oneri a carico dell'acquirente.",
  },
  {
    key: 'difformita' as const,
    title: 'Difformità e Abusi',
    icon: '⚠️',
    description: 'Irregolarità urbanistiche o catastali rilevate.',
  },
] as const;

function EsitoCard({ result }: { result: AnalysisResult }) {
  const esito = getEsitoFromResult(result);

  const map = {
    verde: {
      bg: 'bg-emerald-50', border: 'border-emerald-200', dot: 'bg-emerald-500',
      label: 'text-emerald-700', badge: 'Verde — Nessuna criticità',
    },
    giallo: {
      bg: 'bg-amber-50', border: 'border-amber-200', dot: 'bg-amber-400',
      label: 'text-amber-700', badge: 'Giallo — Da verificare',
    },
    rosso: {
      bg: 'bg-red-50', border: 'border-red-200', dot: 'bg-red-500',
      label: 'text-red-700', badge: 'Rosso — Rischi rilevanti',
    },
  }[esito];

  const difformitaFound = result.difformita.status === 'found';
  const attiFound = result.atti_antecedenti.status === 'found';
  const costiFound = result.costi_oneri.status === 'found';
  type AnyField = { value?: string | null; summary?: string | null };
  const valoreRaw = (result.valore_perito as unknown as AnyField).value ?? (result.valore_perito as unknown as AnyField).summary ?? null;
  const costiRaw = (result.costi_oneri as unknown as AnyField).value ?? (result.costi_oneri as unknown as AnyField).summary ?? null;

  const grid = [
    { label: 'Valore Perito', value: valoreRaw ? valoreRaw.split(/\s+/).slice(0, 4).join(' ') : 'N/D', warn: false },
    { label: 'Costi e Oneri', value: costiFound ? (costiRaw ? costiRaw.split(/\s+/).slice(0, 4).join(' ') : 'Trovati') : 'Non rilevati', warn: costiFound },
    { label: 'Atti Precedenti', value: attiFound ? 'Trovati' : 'Nessuno', warn: attiFound },
    { label: 'Difformità', value: difformitaFound ? 'Rilevate' : 'Nessuna', warn: difformitaFound },
  ];

  return (
    <div className="space-y-3">
      <div className={`${map.bg} ${map.border} border rounded-2xl p-5 flex items-start gap-3`}>
        <div className={`flex-shrink-0 w-3 h-3 rounded-full ${map.dot} mt-1`} />
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className={`text-sm font-bold ${map.label}`}>Esito generale</span>
            <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${map.bg} ${map.label} border ${map.border}`}>
              {map.badge}
            </span>
          </div>
          <p className={`text-sm ${map.label} leading-relaxed opacity-80`}>{result.riassunto.paragrafo1}</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        {grid.map((item) => (
          <div key={item.label} className={`rounded-xl border px-4 py-3 ${item.warn ? 'bg-amber-50 border-amber-100' : 'bg-white border-slate-100'}`}>
            <p className="text-xs text-slate-400 mb-0.5">{item.label}</p>
            <p className={`text-sm font-semibold truncate ${item.warn ? 'text-amber-700' : 'text-slate-900'}`}>{item.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ReportPage() {
  const { id } = useParams<{ id: string }>();
  const [entry, setEntry] = useState<HistoryEntry | null>(null);
  const [loaded, setLoaded] = useState(false);

  const { notes, verified, setNote, setVerified } = usePersistenceById(id ?? null);

  useEffect(() => {
    setEntry(getHistoryEntry(id));
    setLoaded(true);
  }, [id]);

  if (!loaded) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-20 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-blue-700 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!entry) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-20 text-center">
        <p className="text-slate-500 mb-4">Report non trovato o eliminato.</p>
        <Link href="/app/reports" className="text-blue-700 font-medium hover:underline text-sm">
          ← Torna ai report
        </Link>
      </div>
    );
  }

  const { result } = entry;

  return (
    <div className="max-w-2xl mx-auto px-6 py-10">

      {/* Header */}
      <div className="mb-8">
        <Link
          href="/app/reports"
          className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-700 mb-5 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Report
        </Link>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-slate-900 truncate">{entry.fileName}</h1>
            <p className="text-sm text-slate-400 mt-1">{formatDate(entry.analyzedAt)}</p>
          </div>
          <ExportMenu result={result} fileName={entry.fileName} notes={notes} verified={verified} />
        </div>
      </div>

      <div className="space-y-5">
        <EsitoCard result={result} />

        {FIELDS.map((f) => {
          const field = result[f.key] as {
            status: 'found' | 'not_found' | 'scan_detected';
            value?: string | null; summary?: string | null;
            confidence: number;
            citations: { page: number; snippet: string; keyword?: string }[];
            candidates: { value: string; confidence: number; citations: { page: number; snippet: string }[]; explanation?: string; reason?: string }[];
          };
          return (
            <FieldSection
              key={f.key} fieldKey={f.key} title={f.title} icon={f.icon}
              description={f.description} field={field}
              note={notes[f.key] ?? ''} verified={!!verified[f.key]}
              onNoteChange={(v) => setNote(f.key, v)}
              onVerifiedChange={(v) => setVerified(f.key, v)}
            />
          );
        })}

        <SummarySection riassunto={result.riassunto} />

        <div className="pt-2 flex justify-end">
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 px-4 py-2 border border-slate-200 text-sm text-slate-600 rounded-xl hover:bg-slate-50 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            Stampa report
          </button>
        </div>
      </div>
    </div>
  );
}
