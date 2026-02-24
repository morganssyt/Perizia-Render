'use client';

import { OperativeSummary } from '@/types';

interface SummaryPanelProps {
  summary: OperativeSummary;
}

const SECTIONS = [
  {
    key: 'summaryAsset' as const,
    title: 'Quadro del bene & stima',
    icon: '🏠',
    color: 'border-blue-400',
    bg: 'bg-blue-50',
  },
  {
    key: 'summaryRisks' as const,
    title: 'Rischi / difformità & costi',
    icon: '⚠️',
    color: 'border-amber-400',
    bg: 'bg-amber-50',
  },
  {
    key: 'summaryActions' as const,
    title: 'Atti antecedenti & azioni consigliate',
    icon: '📋',
    color: 'border-green-400',
    bg: 'bg-green-50',
  },
];

export default function SummaryPanel({ summary }: SummaryPanelProps) {
  return (
    <div className="space-y-4 animate-fade-in">
      <h2 className="text-base font-semibold text-gray-900">Riassunto Operativo</h2>

      {SECTIONS.map(({ key, title, icon, color, bg }) => (
        <div
          key={key}
          className={`rounded-xl border-l-4 ${color} ${bg} p-4`}
        >
          <div className="flex items-center gap-2 mb-2">
            <span>{icon}</span>
            <h3 className="font-semibold text-sm text-gray-900">{title}</h3>
          </div>
          <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">
            {summary[key] || 'Non disponibile.'}
          </p>
        </div>
      ))}
    </div>
  );
}
