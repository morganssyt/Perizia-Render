'use client';

import { useState } from 'react';

interface Citation {
  page: number;
  snippet: string;
  keyword?: string;
}

interface FieldData {
  status: 'found' | 'not_found' | 'scan_detected';
  value?: string | null;
  summary?: string | null;
  confidence: number;
  citations: Citation[];
  candidates: Array<{
    value: string;
    confidence: number;
    citations: Citation[];
    explanation?: string;
    reason?: string;
  }>;
}

interface Props {
  fieldKey: string;
  title: string;
  icon: string;
  description: string; // short tooltip / subtitle for non-tech users
  field: FieldData;
  note: string;
  verified: boolean;
  onNoteChange: (v: string) => void;
  onVerifiedChange: (v: boolean) => void;
  /** When provided, citation chips get a "Vai a pagina" button that navigates the PDF viewer */
  onGoToPage?: (page: number) => void;
}

export default function FieldSection({
  title,
  icon,
  description,
  field,
  note,
  verified,
  onNoteChange,
  onVerifiedChange,
  onGoToPage,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [copiedField, setCopiedField] = useState(false);
  const [showCandidates, setShowCandidates] = useState(false);
  const [showDesc, setShowDesc] = useState(false);

  const text = field.value ?? field.summary ?? null;
  const pct = Math.round(field.confidence * 100);
  const hasCandidates = (field.candidates ?? []).length > 0;
  const hasCitations = (field.citations ?? []).length > 0;
  const TRUNCATE_AT = 240;
  const isTruncatable = text && text.length > TRUNCATE_AT;

  const confidenceCls =
    pct >= 80
      ? 'bg-green-100 text-green-700'
      : pct >= 50
        ? 'bg-yellow-100 text-yellow-700'
        : 'bg-red-100 text-red-700';

  const handleCopy = async () => {
    const parts = [
      title,
      field.status === 'found' ? 'Trovato' : field.status === 'scan_detected' ? 'Scansione' : 'Non trovato',
      text ?? '—',
      note ? `Note: ${note}` : '',
    ].filter(Boolean);
    try {
      await navigator.clipboard.writeText(parts.join('\n'));
      setCopiedField(true);
      setTimeout(() => setCopiedField(false), 2000);
    } catch {
      /* clipboard not available */
    }
  };

  return (
    <div
      className={`bg-white rounded-xl border transition-colors ${
        verified ? 'border-green-300 shadow-sm' : 'border-gray-200'
      } overflow-hidden`}
    >
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xl leading-none">{icon}</span>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h3 className="font-semibold text-gray-800 text-sm truncate">{title}</h3>
              <button
                onClick={() => setShowDesc((v) => !v)}
                className="flex-shrink-0 text-gray-400 hover:text-gray-600"
                aria-label="Cosa significa?"
              >
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
            </div>
            {showDesc && (
              <p className="text-xs text-gray-500 mt-0.5 leading-snug">{description}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${confidenceCls}`}>
            {pct}%
          </span>
          {field.status === 'found' ? (
            <span className="text-xs font-semibold bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
              Trovato
            </span>
          ) : field.status === 'scan_detected' ? (
            <span className="text-xs font-semibold bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">
              Scansione
            </span>
          ) : (
            <span className="text-xs font-semibold bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
              Non trovato
            </span>
          )}
        </div>
      </div>

      {/* ── Content ── */}
      <div className="px-4 pb-3 space-y-2">
        {field.status === 'scan_detected' && (
          <p className="text-orange-600 text-sm italic">
            Il documento è una scansione: il testo non è estraibile automaticamente.
          </p>
        )}

        {field.status === 'found' && (
          <>
            {text ? (
              <div>
                <p
                  className={`text-gray-700 text-sm leading-relaxed ${
                    !expanded && isTruncatable ? 'line-clamp-3' : ''
                  }`}
                >
                  {text}
                </p>
                {isTruncatable && (
                  <button
                    onClick={() => setExpanded((v) => !v)}
                    className="text-xs text-blue-500 hover:text-blue-700 mt-1 underline"
                  >
                    {expanded ? 'Mostra meno' : 'Mostra tutto'}
                  </button>
                )}
              </div>
            ) : (
              <p className="text-gray-400 text-sm italic">Valore trovato ma non leggibile.</p>
            )}

            {/* Citations */}
            {hasCitations ? (
              <div className="space-y-1 mt-1">
                {(field.citations ?? []).slice(0, 3).map((c, i) => (
                  <div
                    key={i}
                    className="text-xs bg-blue-50 border border-blue-100 rounded px-2.5 py-1.5 leading-snug"
                  >
                    <div className="flex items-center justify-between gap-2 mb-0.5">
                      <div>
                        <span className="font-semibold text-blue-600">Pagina {c.page}</span>
                        {c.keyword && (
                          <span className="ml-1 text-blue-400 font-normal">[{c.keyword}]</span>
                        )}
                      </div>
                      {onGoToPage && (
                        <button
                          onClick={() => onGoToPage(c.page)}
                          className="text-blue-500 hover:text-blue-700 underline text-xs flex-shrink-0"
                        >
                          Vai →
                        </button>
                      )}
                    </div>
                    <span className="text-gray-600">
                      &ldquo;{c.snippet.slice(0, 160)}&rdquo;
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-400 italic mt-1">
                Evidenze testuali non disponibili in questa versione.
              </p>
            )}
          </>
        )}

        {field.status === 'not_found' && (
          <>
            {hasCandidates ? (
              <div>
                <p className="text-gray-500 text-sm italic">
                  Non trovato con certezza —{' '}
                  <button
                    onClick={() => setShowCandidates((v) => !v)}
                    className="text-blue-500 hover:text-blue-700 underline"
                  >
                    {showCandidates
                      ? 'nascondi'
                      : `mostra ${field.candidates.length} candidat${field.candidates.length === 1 ? 'o' : 'i'}`}
                  </button>
                </p>
                {showCandidates && (
                  <div className="mt-2 space-y-1.5">
                    {field.candidates.map((c, i) => {
                      const cpct = Math.round(c.confidence * 100);
                      const ccls =
                        cpct >= 70
                          ? 'bg-green-100 text-green-700'
                          : 'bg-yellow-100 text-yellow-700';
                      return (
                        <div
                          key={i}
                          className="bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2 text-xs"
                        >
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="font-medium text-gray-800">{c.value}</span>
                            <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${ccls}`}>
                              {cpct}%
                            </span>
                          </div>
                          {(c.explanation ?? c.reason) && (
                            <p className="text-gray-500">{c.explanation ?? c.reason}</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-gray-400 text-sm italic">
                Dato non presente nel documento.
              </p>
            )}
          </>
        )}
      </div>

      {/* ── Actions bar ── */}
      <div className="flex items-center gap-2 px-4 py-2 border-t border-gray-100 bg-gray-50/60">
        <button
          onClick={handleCopy}
          className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1 px-2 py-1 rounded hover:bg-gray-200 transition-colors"
        >
          {copiedField ? '✓ Copiato' : 'Copia'}
        </button>
        <div className="flex-1" />
        <label className="flex items-center gap-1.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={verified}
            onChange={(e) => onVerifiedChange(e.target.checked)}
            className="w-3.5 h-3.5 rounded accent-green-500"
          />
          <span className="text-xs text-gray-600">
            {verified ? 'Verificato ✅' : 'Segna come verificato'}
          </span>
        </label>
      </div>

      {/* ── Notes textarea ── */}
      <div className="px-4 pb-4 pt-2">
        <textarea
          value={note}
          onChange={(e) => onNoteChange(e.target.value)}
          placeholder="Note personali (salvate automaticamente)…"
          className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 text-gray-700 placeholder-gray-400 resize-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400 outline-none transition-all bg-white"
          rows={2}
        />
      </div>
    </div>
  );
}
