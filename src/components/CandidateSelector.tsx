'use client';

import { useState } from 'react';
import { Candidate } from '@/types';
import ConfidenceBadge from './ConfidenceBadge';

interface CandidateSelectorProps {
  candidates: Candidate<any>[];
  label?: string;
}

export default function CandidateSelector({ candidates, label = 'Candidati alternativi' }: CandidateSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);

  if (!candidates || candidates.length <= 1) return null;

  return (
    <div className="mt-2">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
      >
        <svg
          className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-90' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        {label} ({candidates.length})
      </button>

      {isOpen && (
        <div className="mt-2 space-y-2 animate-fade-in">
          {candidates.map((candidate, i) => (
            <div
              key={i}
              className="bg-white border border-gray-200 rounded-lg p-2 text-sm"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-gray-400">Candidato {i + 1}</span>
                <ConfidenceBadge confidence={candidate.confidence} size="sm" />
              </div>
              <p className="text-gray-600 text-xs">
                {typeof candidate.value === 'string'
                  ? candidate.value.slice(0, 200)
                  : String(candidate.value)}
              </p>
              <p className="text-xs text-gray-400 mt-1">{candidate.reason}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
