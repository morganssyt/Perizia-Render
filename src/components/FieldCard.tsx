'use client';

import { Citation, Candidate } from '@/types';
import ConfidenceBadge from './ConfidenceBadge';
import CitationSnippet from './CitationSnippet';
import CandidateSelector from './CandidateSelector';

interface FieldCardProps {
  title: string;
  icon: string;
  children: React.ReactNode;
  confidence: number;
  citations: Citation[];
  candidates: Candidate<any>[];
  warning?: string;
  onGoToPage?: (page: number) => void;
}

export default function FieldCard({
  title,
  icon,
  children,
  confidence,
  citations,
  candidates,
  warning,
  onGoToPage,
}: FieldCardProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden animate-fade-in">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">{icon}</span>
          <h3 className="font-semibold text-gray-900 text-sm">{title}</h3>
        </div>
        <ConfidenceBadge confidence={confidence} />
      </div>

      {/* Body */}
      <div className="p-4">
        {warning && (
          <div className="mb-3 bg-amber-50 border border-amber-200 rounded-lg p-2 text-xs text-amber-800">
            {warning}
          </div>
        )}

        {confidence === 0 && (
          <div className="mb-3 bg-red-50 border border-red-200 rounded-lg p-2 text-xs text-red-700">
            Non rilevato nel documento. Verifica manuale necessaria.
          </div>
        )}

        <div className="text-sm text-gray-700 leading-relaxed">
          {children}
        </div>

        {/* Citations */}
        {citations.length > 0 && (
          <div className="mt-3">
            <span className="text-xs font-medium text-gray-500">Citazioni dal PDF</span>
            {citations.slice(0, 2).map((cit, i) => (
              <CitationSnippet key={i} citation={cit} onGoToPage={onGoToPage} />
            ))}
          </div>
        )}

        {/* Candidates */}
        <CandidateSelector candidates={candidates} />
      </div>
    </div>
  );
}
