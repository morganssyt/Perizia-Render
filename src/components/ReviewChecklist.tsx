'use client';

import { useState, useCallback } from 'react';
import { ReviewItem, FullExtractionResult } from '@/types';

interface ReviewChecklistProps {
  documentId: string;
  extraction: FullExtractionResult;
  initialReviews: ReviewItem[];
}

interface ReviewState {
  verified: boolean;
  notes: string;
  userEdit: string;
  saving: boolean;
}

const FIELD_CONFIG = [
  {
    key: 'expertValue' as const,
    label: 'Valore del Perito',
    icon: '💰',
    getItems: (e: FullExtractionResult) => [e.expertValue],
    getLabel: (item: any) => item.valoreRaw || item.tipo || 'N/D',
    getCandidates: (item: any) => item.candidates || [],
  },
  {
    key: 'antecedentActs' as const,
    label: 'Atti Antecedenti',
    icon: '📜',
    getItems: (e: FullExtractionResult) => e.antecedentActs,
    getLabel: (item: any) => item.tipoAtto,
    getCandidates: (item: any) => item.candidates || [],
  },
  {
    key: 'legalCosts' as const,
    label: 'Costi / Oneri',
    icon: '💸',
    getItems: (e: FullExtractionResult) => e.legalCosts,
    getLabel: (item: any) => item.importoRaw || item.descrizione?.slice(0, 60),
    getCandidates: (item: any) => item.candidates || [],
  },
  {
    key: 'irregularities' as const,
    label: 'Difformità / Abusi',
    icon: '⚠️',
    getItems: (e: FullExtractionResult) => e.irregularities,
    getLabel: (item: any) => `${item.categoria} - ${item.gravita}`,
    getCandidates: (item: any) => item.candidates || [],
  },
];

export default function ReviewChecklist({
  documentId,
  extraction,
  initialReviews,
}: ReviewChecklistProps) {
  const [reviews, setReviews] = useState<Record<string, ReviewState>>(() => {
    const state: Record<string, ReviewState> = {};
    for (const r of initialReviews) {
      state[`${r.fieldKey}-${r.itemIndex}`] = {
        verified: r.verified,
        notes: r.notes || '',
        userEdit: r.userEdit || '',
        saving: false,
      };
    }
    return state;
  });

  const getState = (key: string, index: number): ReviewState => {
    return reviews[`${key}-${index}`] || { verified: false, notes: '', userEdit: '', saving: false };
  };

  const saveReview = useCallback(async (
    fieldKey: string,
    itemIndex: number,
    verified: boolean,
    notes: string,
    userEdit?: string
  ) => {
    const stateKey = `${fieldKey}-${itemIndex}`;
    setReviews((prev) => ({
      ...prev,
      [stateKey]: { verified, notes, userEdit: userEdit || prev[stateKey]?.userEdit || '', saving: true },
    }));

    try {
      await fetch(`/api/documents/${documentId}/review`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fieldKey, itemIndex, verified, notes, userEdit }),
      });
    } catch (err) {
      console.error('Error saving review:', err);
    } finally {
      setReviews((prev) => ({
        ...prev,
        [stateKey]: { ...prev[stateKey], saving: false },
      }));
    }
  }, [documentId]);

  const useCandidateValue = useCallback((fieldKey: string, itemIndex: number, candidateValue: string) => {
    const stateKey = `${fieldKey}-${itemIndex}`;
    const current = reviews[stateKey] || { verified: false, notes: '', userEdit: '', saving: false };
    setReviews((prev) => ({
      ...prev,
      [stateKey]: { ...current, userEdit: candidateValue },
    }));
    saveReview(fieldKey, itemIndex, current.verified, current.notes, candidateValue);
  }, [reviews, saveReview]);

  const totalItems = FIELD_CONFIG.reduce((sum, f) => sum + f.getItems(extraction).length, 0);
  const verifiedCount = FIELD_CONFIG.reduce(
    (sum, f) => sum + f.getItems(extraction).filter((_, i) => getState(f.key, i).verified).length,
    0
  );
  const allVerified = verifiedCount === totalItems && totalItems > 0;

  const getBadge = (key: string, index: number) => {
    const state = getState(key, index);
    if (state.verified) return { label: 'Verificato', cls: 'bg-green-100 text-green-600' };
    if (state.userEdit) return { label: 'Modificato', cls: 'bg-blue-100 text-blue-600' };
    return { label: 'Estratto', cls: 'bg-yellow-100 text-yellow-600' };
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-900">Checklist di Verifica</h2>
        <span className={`text-xs font-medium px-2 py-1 rounded-full ${allVerified ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
          {verifiedCount}/{totalItems} verificati
        </span>
      </div>

      <div className="progress-bar">
        <div
          className="progress-bar-fill"
          style={{ width: `${totalItems > 0 ? (verifiedCount / totalItems) * 100 : 0}%`, background: allVerified ? '#16a34a' : undefined }}
        />
      </div>

      {FIELD_CONFIG.map((field) => {
        const items = field.getItems(extraction);
        return (
          <div key={field.key} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-2 bg-gray-50 border-b border-gray-100">
              <span className="text-sm font-medium text-gray-700">
                {field.icon} {field.label}
              </span>
            </div>

            <div className="divide-y divide-gray-100">
              {items.map((item, index) => {
                const state = getState(field.key, index);
                const badge = getBadge(field.key, index);
                const candidates = field.getCandidates(item);

                return (
                  <div key={index} className="px-4 py-3 space-y-2">
                    <div className="flex items-start gap-3">
                      <button
                        onClick={() => saveReview(field.key, index, !state.verified, state.notes, state.userEdit)}
                        disabled={state.saving}
                        className={`
                          mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0
                          transition-all duration-200
                          ${state.verified
                            ? 'bg-green-500 border-green-500'
                            : 'border-gray-300 hover:border-blue-400'
                          }
                          ${state.saving ? 'opacity-50' : ''}
                        `}
                        aria-label={`${state.verified ? 'Segna come da rivedere' : 'Segna come verificato'}: ${field.getLabel(item)}`}
                      >
                        {state.verified && (
                          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </button>

                      <div className="flex-1 min-w-0">
                        <p className={`text-sm ${state.verified ? 'text-gray-400 line-through' : 'text-gray-700'}`}>
                          {field.getLabel(item)}
                        </p>

                        <input
                          type="text"
                          placeholder="Valore corretto..."
                          value={state.userEdit}
                          onChange={(e) => {
                            const userEdit = e.target.value;
                            setReviews((prev) => ({
                              ...prev,
                              [`${field.key}-${index}`]: { ...state, userEdit },
                            }));
                          }}
                          onBlur={() => saveReview(field.key, index, state.verified, state.notes, state.userEdit)}
                          className="mt-1 w-full text-xs text-gray-700 bg-gray-50 border border-gray-200 rounded px-2 py-1 focus:border-blue-400 focus:outline-none"
                        />

                        <input
                          type="text"
                          placeholder="Note..."
                          value={state.notes}
                          onChange={(e) => {
                            const notes = e.target.value;
                            setReviews((prev) => ({
                              ...prev,
                              [`${field.key}-${index}`]: { ...state, notes },
                            }));
                          }}
                          onBlur={() => saveReview(field.key, index, state.verified, state.notes, state.userEdit)}
                          className="mt-1 w-full text-xs text-gray-500 bg-transparent border-0 border-b border-transparent hover:border-gray-200 focus:border-blue-400 focus:outline-none px-0 py-0.5"
                        />
                      </div>

                      <span className={`text-xs px-1.5 py-0.5 rounded-full whitespace-nowrap ${badge.cls}`}>
                        {badge.label}
                      </span>
                    </div>

                    {candidates.length > 1 && (
                      <div className="ml-8 flex flex-wrap gap-1">
                        {candidates.slice(0, 3).map((cand: any, ci: number) => (
                          <button
                            key={ci}
                            onClick={() => {
                              const val = typeof cand.value === 'number'
                                ? String(cand.value)
                                : typeof cand.value === 'string'
                                ? cand.value.slice(0, 100)
                                : String(cand.value);
                              useCandidateValue(field.key, index, val);
                            }}
                            className="text-xs px-2 py-0.5 bg-gray-100 hover:bg-blue-100 text-gray-600 hover:text-blue-700 rounded transition-colors"
                            title={cand.reason}
                          >
                            Cand. #{ci + 1} ({Math.round(cand.confidence * 100)}%)
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
