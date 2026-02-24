'use client';

import { useState } from 'react';

interface Props {
  riassunto: {
    paragrafo1: string;
    paragrafo2: string;
    paragrafo3: string;
  };
}

const BOX_LABELS = [
  { num: '1', label: 'Bene e Stima' },
  { num: '2', label: 'Rischi e Difformità' },
  { num: '3', label: 'Azioni Consigliate' },
];

export default function SummarySection({ riassunto }: Props) {
  const [copied, setCopied] = useState(false);

  const paragraphs = [riassunto.paragrafo1, riassunto.paragrafo2, riassunto.paragrafo3];

  const handleCopy = async () => {
    const text = paragraphs
      .map((p, i) => `${i + 1}. ${p}`)
      .join('\n\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-blue-100">
        <h3 className="font-semibold text-blue-900 text-sm">Riassunto Operativo</h3>
        <button
          onClick={handleCopy}
          className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1.5 px-2.5 py-1 rounded-lg hover:bg-blue-100 transition-colors"
        >
          {copied ? '✓ Copiato' : 'Copia riassunto'}
        </button>
      </div>

      {/* 3 numbered paragraphs */}
      <div className="p-4 space-y-3">
        {paragraphs.map((p, i) => (
          <div key={i} className="flex gap-3 items-start">
            <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-200 text-blue-800 text-xs font-bold flex items-center justify-center">
              {BOX_LABELS[i].num}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-blue-600 mb-0.5">{BOX_LABELS[i].label}</p>
              <p className="text-blue-900 text-sm leading-relaxed">{p}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
