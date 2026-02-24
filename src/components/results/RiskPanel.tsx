'use client';

import type { AnalysisResult } from '@/app/api/analyze/route';

interface Props {
  result: AnalysisResult;
}

const PRIORITY_ORDER = [
  { key: 'difformita', label: 'Difformità e Abusi', icon: '⚠️' },
  { key: 'costi_oneri', label: 'Costi e Oneri', icon: '📋' },
  { key: 'atti_antecedenti', label: 'Atti Antecedenti', icon: '📜' },
  { key: 'valore_perito', label: 'Valore del Perito', icon: '💰' },
] as const;

export default function RiskPanel({ result }: Props) {
  const hasDifformita = result.difformita.status === 'found';
  const hasCosti = result.costi_oneri.status === 'found';
  const confidence = result.difformita.confidence;

  // Risk badges — UI only, derived from existing result fields
  const riskBadges: { label: string; cls: string; icon: string }[] = [];

  if (hasDifformita) {
    const sev =
      confidence >= 0.8
        ? 'alta'
        : confidence >= 0.5
          ? 'media'
          : 'bassa';
    const cls =
      sev === 'alta'
        ? 'bg-red-100 text-red-700 border-red-200'
        : sev === 'media'
          ? 'bg-orange-100 text-orange-700 border-orange-200'
          : 'bg-yellow-100 text-yellow-700 border-yellow-200';
    riskBadges.push({ label: `Difformità rilevate (gravità ${sev})`, cls, icon: '⚠️' });
  }

  if (hasCosti) {
    riskBadges.push({
      label: 'Costi e oneri da verificare',
      cls: 'bg-yellow-100 text-yellow-700 border-yellow-200',
      icon: '💶',
    });
  }

  if (riskBadges.length === 0) {
    riskBadges.push({
      label: 'Nessuna criticità evidente',
      cls: 'bg-green-100 text-green-700 border-green-200',
      icon: '✅',
    });
  }

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 space-y-2.5">
      {/* Risk badges */}
      <div className="flex flex-wrap gap-2">
        {riskBadges.map((b, i) => (
          <span
            key={i}
            className={`text-xs font-semibold px-3 py-1 rounded-full border ${b.cls}`}
          >
            {b.icon} {b.label}
          </span>
        ))}
      </div>

      {/* Priority order */}
      <div>
        <p className="text-xs text-gray-400 mb-1.5 font-medium uppercase tracking-wide">
          Priorità di controllo consigliata
        </p>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {PRIORITY_ORDER.map((p, i) => {
            const field = result[p.key as keyof AnalysisResult] as { status: string } | undefined;
            const isFound = field?.status === 'found';
            return (
              <div key={p.key} className="flex items-center gap-1.5 text-xs">
                <span className="font-bold text-gray-400 tabular-nums">{i + 1}.</span>
                <span className={isFound ? 'text-gray-700 font-medium' : 'text-gray-400'}>
                  {p.icon} {p.label}
                </span>
                {isFound && (
                  <span className="w-1.5 h-1.5 rounded-full bg-orange-400 flex-shrink-0" />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
