'use client';

import { useState } from 'react';
import { FullExtractionResult, ReviewItem, DebugInfo } from '@/types';
import FieldCard from './FieldCard';
import SummaryPanel from './SummaryPanel';
import ReviewChecklist from './ReviewChecklist';
import ExportButtons from './ExportButtons';
import DebugPanel from './DebugPanel';

interface ExtractionPanelProps {
  documentId: string;
  extraction: FullExtractionResult;
  reviews: ReviewItem[];
  debugInfo?: DebugInfo | null;
  pipelineLogs?: string;
  onGoToPage?: (page: number) => void;
}

type Tab = 'fields' | 'summary' | 'review' | 'debug';

export default function ExtractionPanel({
  documentId,
  extraction,
  reviews,
  debugInfo,
  pipelineLogs,
  onGoToPage,
}: ExtractionPanelProps) {
  const [activeTab, setActiveTab] = useState<Tab>('fields');

  const tabs: { key: Tab; label: string; icon: string; badge?: string }[] = [
    { key: 'fields', label: 'Le 4 Voci', icon: '🔍' },
    { key: 'summary', label: 'Riassunto', icon: '📝' },
    { key: 'review', label: 'Verifica', icon: '✅' },
    {
      key: 'debug',
      label: 'Debug',
      icon: '🛠',
      badge: debugInfo?.extractionWarnings.length
        ? String(debugInfo.extractionWarnings.length)
        : undefined,
    },
  ];

  const formatAmount = (v?: number) => {
    if (!v) return '—';
    return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(v);
  };

  return (
    <div className="h-full flex flex-col">
      {/* Tab bar */}
      <div className="flex items-center border-b border-gray-200 bg-white px-2 flex-shrink-0">
        {tabs.map(({ key, label, icon, badge }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`
              relative flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 transition-all
              ${activeTab === key
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
              }
            `}
          >
            <span>{icon}</span>
            <span>{label}</span>
            {badge && (
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center leading-none">
                {badge}
              </span>
            )}
          </button>
        ))}

        <div className="ml-auto">
          <ExportButtons documentId={documentId} />
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {activeTab === 'fields' && (
          <>
            {/* D) Valore del Perito */}
            <FieldCard
              title="Valore del Perito"
              icon="💰"
              confidence={extraction.expertValue.confidence}
              citations={extraction.expertValue.citations}
              candidates={extraction.expertValue.candidates}
              onGoToPage={onGoToPage}
            >
              <div className="space-y-2">
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-blue-700">
                    {formatAmount(extraction.expertValue.valore)}
                  </span>
                  <span className="text-sm text-gray-500">{extraction.expertValue.tipo}</span>
                </div>
                {extraction.expertValue.range && (
                  <p className="text-xs text-gray-500">
                    Range: {formatAmount(extraction.expertValue.range.min)} — {formatAmount(extraction.expertValue.range.max)}
                  </p>
                )}
                {extraction.expertValue.dataContesto && (
                  <p className="text-xs text-gray-400">Data/contesto: {extraction.expertValue.dataContesto}</p>
                )}
                {extraction.expertValue.confidence === 0 && (
                  <p className="text-xs text-amber-600 bg-amber-50 rounded px-2 py-1">
                    Non rilevato — vai al tab Debug per capire perché
                  </p>
                )}
              </div>
            </FieldCard>

            {/* A) Atti Antecedenti */}
            <FieldCard
              title="Atti Antecedenti"
              icon="📜"
              confidence={extraction.antecedentActs[0]?.confidence ?? 0}
              citations={extraction.antecedentActs[0]?.citations ?? []}
              candidates={extraction.antecedentActs[0]?.candidates ?? []}
              onGoToPage={onGoToPage}
            >
              <div className="space-y-2">
                {extraction.antecedentActs.map((act, i) => (
                  <div key={i} className="border-l-2 border-gray-200 pl-3">
                    <p className="font-medium text-sm">{act.tipoAtto}</p>
                    {act.data && <p className="text-xs text-gray-500">Data: {act.data}</p>}
                    <p className="text-xs text-gray-600 mt-1">{act.sintesi.slice(0, 200)}</p>
                  </div>
                ))}
                {extraction.antecedentActs[0]?.confidence === 0 && (
                  <p className="text-xs text-amber-600 bg-amber-50 rounded px-2 py-1">
                    Non rilevato — vai al tab Debug per capire perché
                  </p>
                )}
              </div>
            </FieldCard>

            {/* B) Costi / Oneri */}
            <FieldCard
              title="Costi di Legge / Oneri"
              icon="💸"
              confidence={extraction.legalCosts[0]?.confidence ?? 0}
              citations={extraction.legalCosts[0]?.citations ?? []}
              candidates={extraction.legalCosts[0]?.candidates ?? []}
              warning={extraction.legalCosts.some((c) => c.ultimiDueAnni) ? 'Riferimento "ultimi 2 anni" rilevato' : undefined}
              onGoToPage={onGoToPage}
            >
              <div className="space-y-2">
                {extraction.legalCosts.map((cost, i) => (
                  <div key={i} className="flex items-start justify-between border-l-2 border-gray-200 pl-3">
                    <div className="flex-1">
                      <p className="text-sm">{cost.descrizione.slice(0, 150)}</p>
                      {cost.ultimiDueAnni && (
                        <span className="inline-block mt-1 text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">
                          Ultimi 2 anni
                        </span>
                      )}
                    </div>
                    {cost.importoRaw && (
                      <span className="text-sm font-semibold text-gray-900 ml-2 whitespace-nowrap">
                        {cost.importoRaw}
                      </span>
                    )}
                  </div>
                ))}
                {extraction.legalCosts[0]?.confidence === 0 && (
                  <p className="text-xs text-amber-600 bg-amber-50 rounded px-2 py-1">
                    Non rilevato — vai al tab Debug per capire perché
                  </p>
                )}
              </div>
            </FieldCard>

            {/* C) Difformità */}
            <FieldCard
              title="Difformità / Abusi"
              icon="⚠️"
              confidence={extraction.irregularities[0]?.confidence ?? 0}
              citations={extraction.irregularities[0]?.citations ?? []}
              candidates={extraction.irregularities[0]?.candidates ?? []}
              onGoToPage={onGoToPage}
            >
              <div className="space-y-2">
                {extraction.irregularities.map((irr, i) => {
                  const severityColor = {
                    alta: 'border-red-400 bg-red-50',
                    media: 'border-amber-400 bg-amber-50',
                    bassa: 'border-green-400 bg-green-50',
                  };
                  return (
                    <div key={i} className={`border-l-2 pl-3 py-1 rounded-r ${severityColor[irr.gravita]}`}>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{irr.categoria}</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                          irr.gravita === 'alta' ? 'bg-red-200 text-red-700' :
                          irr.gravita === 'media' ? 'bg-amber-200 text-amber-700' :
                          'bg-green-200 text-green-700'
                        }`}>
                          {irr.gravita.toUpperCase()}
                        </span>
                      </div>
                      <p className="text-xs text-gray-600 mt-1">{irr.descrizione.slice(0, 150)}</p>
                      <p className="text-xs text-gray-500 mt-1">
                        Impatto: {irr.impatto}
                        {irr.costiRaw && ` | Costi: ${irr.costiRaw}`}
                      </p>
                    </div>
                  );
                })}
                {extraction.irregularities[0]?.confidence === 0 && (
                  <p className="text-xs text-amber-600 bg-amber-50 rounded px-2 py-1">
                    Non rilevato — vai al tab Debug per capire perché
                  </p>
                )}
              </div>
            </FieldCard>
          </>
        )}

        {activeTab === 'summary' && (
          <SummaryPanel summary={extraction} />
        )}

        {activeTab === 'review' && (
          <ReviewChecklist
            documentId={documentId}
            extraction={extraction}
            initialReviews={reviews}
          />
        )}

        {activeTab === 'debug' && (
          <DebugPanel
            debugInfo={debugInfo ?? null}
            pipelineLogs={pipelineLogs ?? ''}
          />
        )}
      </div>
    </div>
  );
}
