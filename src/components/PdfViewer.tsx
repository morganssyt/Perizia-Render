'use client';

import { useState, useEffect, useRef } from 'react';

interface PdfViewerProps {
  url: string;
  /** When this changes, the PDF viewer navigates to this page */
  targetPage?: number;
  totalPages?: number;
}

export default function PdfViewer({ url, targetPage, totalPages }: PdfViewerProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [navPage, setNavPage] = useState<number | undefined>(undefined);
  const [inputValue, setInputValue] = useState('');
  const [navigated, setNavigated] = useState(false);

  // When targetPage prop changes (from citation/evidence click), navigate
  useEffect(() => {
    if (targetPage && targetPage !== navPage) {
      setNavPage(targetPage);
      setInputValue(String(targetPage));
      setNavigated(true);
      const t = setTimeout(() => setNavigated(false), 2000);
      return () => clearTimeout(t);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetPage]);

  const currentSrc = navPage ? `${url}#page=${navPage}` : url;

  const goToPage = (page: number) => {
    if (!page || page < 1) return;
    if (totalPages && page > totalPages) return;
    setNavPage(page);
    setInputValue(String(page));
    setNavigated(true);
    setTimeout(() => setNavigated(false), 2000);
  };

  const handleInputKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const n = parseInt(inputValue, 10);
      if (!isNaN(n)) goToPage(n);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-200 bg-white flex-shrink-0">
        {/* Prev / page input / next */}
        <button
          onClick={() => navPage && navPage > 1 && goToPage(navPage - 1)}
          disabled={!navPage || navPage <= 1}
          className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title="Pagina precedente"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        <div className="flex items-center gap-1 text-xs">
          <input
            type="number"
            min={1}
            max={totalPages}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleInputKey}
            placeholder="Pag."
            className="w-12 border border-slate-200 rounded px-1.5 py-0.5 text-center text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
          {totalPages && <span className="text-slate-400">/ {totalPages}</span>}
        </div>

        <button
          onClick={() => navPage && totalPages && navPage < totalPages && goToPage(navPage + 1)}
          disabled={!navPage || !totalPages || navPage >= totalPages}
          className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title="Pagina successiva"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>

        {navigated && (
          <span className="text-xs text-blue-600 font-medium animate-fade-in">
            → Pagina {navPage}
          </span>
        )}

        <div className="flex-1" />

        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1 text-xs text-slate-400 hover:text-blue-600 transition-colors flex-shrink-0"
          title="Apri in nuova scheda"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
          <span className="hidden sm:inline">Apri</span>
        </a>
      </div>

      {/* PDF iframe — key forces reload/navigation when src changes */}
      <iframe
        ref={iframeRef}
        key={currentSrc}
        src={currentSrc}
        className="flex-1 w-full border-0 min-h-0"
        title="Visualizzatore PDF"
      />
    </div>
  );
}
