'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { exportAsJSON, exportAsCSV, exportAsText } from '@/lib/export-client';
import type { AnalysisResult } from '@/app/api/analyze/route';

interface Props {
  result: AnalysisResult;
  fileName: string;
  notes: Record<string, string>;
  verified: Record<string, boolean>;
}

export default function ExportMenu({ result, fileName, notes, verified }: Props) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const analyzedAt = new Date().toLocaleString('it-IT', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const opts = { result, fileName, notes, verified, analyzedAt };

  // Close on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleCopyText = useCallback(async () => {
    const text = exportAsText(opts);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      /* clipboard unavailable */
    }
    setOpen(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, fileName, notes, verified]);

  const handlePrint = useCallback(() => {
    window.print();
    setOpen(false);
  }, []);

  const menuItems = [
    {
      icon: '🖨️',
      label: 'Stampa / PDF',
      sub: 'Scheda stampabile A4',
      onClick: handlePrint,
      border: false,
    },
    {
      icon: '{ }',
      label: 'Esporta JSON',
      sub: 'Dati completi strutturati',
      onClick: () => { exportAsJSON(opts); setOpen(false); },
      border: true,
    },
    {
      icon: '📊',
      label: 'Esporta CSV',
      sub: 'Per Excel o CRM',
      onClick: () => { exportAsCSV(opts); setOpen(false); },
      border: true,
    },
    {
      icon: '💬',
      label: copied ? 'Copiato! ✓' : 'Copia testo',
      sub: 'Per WhatsApp o email',
      onClick: handleCopyText,
      border: true,
    },
  ];

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors shadow-sm"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
          />
        </svg>
        Esporta
        <svg
          className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-56 bg-white border border-gray-200 rounded-xl shadow-xl z-50 overflow-hidden animate-fade-in">
          {menuItems.map((item, i) => (
            <button
              key={i}
              onClick={item.onClick}
              className={`w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-3 transition-colors ${
                item.border ? 'border-t border-gray-100' : ''
              }`}
            >
              <span className="text-base w-5 text-center flex-shrink-0">{item.icon}</span>
              <div className="min-w-0">
                <div className="font-medium text-gray-800">{item.label}</div>
                <div className="text-xs text-gray-400">{item.sub}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
