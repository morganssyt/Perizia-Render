'use client';

import { Citation } from '@/types';

interface CitationSnippetProps {
  citation: Citation;
  onGoToPage?: (page: number) => void;
}

export default function CitationSnippet({ citation, onGoToPage }: CitationSnippetProps) {
  return (
    <div className="mt-2 bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium text-gray-500">
          Pagina {citation.page}
        </span>
        {onGoToPage && (
          <button
            onClick={() => onGoToPage(citation.page)}
            className="text-xs text-blue-600 hover:text-blue-800 underline focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
          >
            Vai a pagina {citation.page}
          </button>
        )}
      </div>
      <p className="text-gray-600 italic leading-relaxed">
        &ldquo;{citation.snippet.slice(0, 250)}{citation.snippet.length > 250 ? '...' : ''}&rdquo;
      </p>
    </div>
  );
}
