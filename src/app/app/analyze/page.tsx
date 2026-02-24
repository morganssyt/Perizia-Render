'use client';

import { useState, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';

import type {
  AnalysisResult,
  DebugInfo,
  Meta,
  PageRenderDebug,
  OcrPageDebug,
  PdfDebugInfo,
  Evidence,
} from '@/app/api/analyze/route';

import { usePersistence } from '@/hooks/usePersistence';
import FieldSection from '@/components/results/FieldSection';
import SummarySection from '@/components/results/SummarySection';
import ResocontoSection from '@/components/results/ResocontoSection';
import ExportMenu from '@/components/export/ExportMenu';
import VerifyWorkflow from '@/components/verify/VerifyWorkflow';
import RiskPanel from '@/components/results/RiskPanel';
import { saveToHistory } from '@/lib/history';
import { openAndPrintResoconto } from '@/lib/generate-resoconto-pdf';

const PdfViewer = dynamic(() => import('@/components/PdfViewer'), {
  ssr: false,
  loading: () => (
    <div className="flex-1 flex items-center justify-center">
      <div className="w-5 h-5 border-2 border-blue-700 border-t-transparent rounded-full animate-spin" />
    </div>
  ),
});

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type ApiError = {
  error: string;
  detail?: string;
  issues?: unknown[];
  raw?: unknown;
  debug?: DebugInfo;
  ocrDebug?: Array<{ page: number; chars: number; status: string; preview?: string }>;
  renderDebug?: Array<{ page: number; bytes: number; whiteness: number; isBlank: boolean }>;
  debugDocId?: string;
  requestId?: string;
  httpStatus?: number;
  pdfDebug?: PdfDebugInfo;
};

// ─────────────────────────────────────────────────────────────────────────────
// Field config
// ─────────────────────────────────────────────────────────────────────────────

const FIELDS = [
  {
    key: 'valore_perito' as const,
    title: 'Valore del Perito',
    icon: '💰',
    description:
      'Il valore stimato dal perito per l\'immobile. È il riferimento per valutare la convenienza rispetto alla base d\'asta.',
  },
  {
    key: 'atti_antecedenti' as const,
    title: 'Atti Antecedenti',
    icon: '📜',
    description:
      'Compravendite, ipoteche, successioni e altri atti precedenti che gravano sull\'immobile.',
  },
  {
    key: 'costi_oneri' as const,
    title: 'Costi e Oneri',
    icon: '📋',
    description:
      'Spese condominiali arretrate, oneri fiscali e altri costi a carico dell\'acquirente.',
  },
  {
    key: 'difformita' as const,
    title: 'Difformità e Abusi',
    icon: '⚠️',
    description:
      'Irregolarità urbanistiche, catastali o edilizie che potrebbero richiedere interventi di regolarizzazione.',
  },
] as const;

type FieldKey = (typeof FIELDS)[number]['key'];

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function friendlyErrorMessage(status: number | undefined, raw: string): string {
  const prefix = status ? `HTTP ${status} — ` : '';
  const fallbacks: Record<number, string> = {
    400: 'Richiesta non valida.',
    413: 'File troppo grande (max 15 MB).',
    422: 'PDF non analizzabile (scansione o testo non estraibile).',
    429: 'Troppe richieste. Attendi qualche secondo e riprova.',
    500: 'Errore interno del server.',
    502: 'Errore upstream (Claude API).',
    503: 'Servizio non disponibile. Riprova tra qualche istante.',
    504: 'Timeout: il server ha impiegato troppo tempo.',
  };
  if (!status) return raw || 'Impossibile raggiungere il server. Controlla la connessione internet.';
  return prefix + (raw || fallbacks[status] || `Errore sconosciuto.`);
}

function getEsito(result: AnalysisResult): { label: string; color: 'verde' | 'giallo' | 'rosso' } {
  const difformita = result.difformita;
  const costi = result.costi_oneri;
  if (difformita.status === 'found' && difformita.confidence >= 0.7) {
    return { label: 'Rischi rilevanti', color: 'rosso' };
  }
  if (difformita.status === 'found' || costi.status === 'found') {
    return { label: 'Da verificare', color: 'giallo' };
  }
  return { label: 'Nessuna criticità', color: 'verde' };
}

// ─────────────────────────────────────────────────────────────────────────────
// Debug panel (hidden by default — for tech users)
// ─────────────────────────────────────────────────────────────────────────────

function WhitenessPill({ w }: { w: number }) {
  if (w < 0) return <span className="text-gray-400 font-mono text-xs">?</span>;
  const pct = Math.round(w * 100);
  const cls =
    w > 0.97 ? 'bg-red-100 text-red-700' : w > 0.85 ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700';
  return <span className={`px-1.5 py-0.5 rounded font-mono font-semibold text-xs ${cls}`}>{pct}%</span>;
}

function RenderPageRow({ p, docId }: { p: PageRenderDebug; docId?: string }) {
  const url = docId ? `/api/debug/image?docId=${docId}&page=${p.page}` : null;
  return (
    <tr className={`border-b border-gray-50 ${p.isBlank ? 'bg-red-50' : ''}`}>
      <td className="py-1 pr-2 font-medium text-gray-700 text-xs w-8">{p.page}</td>
      <td className="py-1 pr-2 text-xs text-right tabular-nums">
        {p.bytes > 0 ? `${Math.round(p.bytes / 1024)}KB` : '—'}
      </td>
      <td className="py-1 pr-2 text-xs">{p.width > 0 ? `${p.width}×${p.height}` : '—'}</td>
      <td className="py-1 pr-2"><WhitenessPill w={p.whiteness} /></td>
      <td className="py-1 pr-2 text-xs">
        {p.isBlank ? <span className="text-red-600 font-bold">BIANCA</span> : <span className="text-green-600 font-semibold">OK</span>}
        {p.renderError && <span className="ml-1 text-red-400">{p.renderError.slice(0, 30)}</span>}
      </td>
      <td className="py-1 text-xs">
        {url && (
          <a href={url} target="_blank" rel="noreferrer" className={`underline ${p.isBlank ? 'text-red-400' : 'text-blue-500'}`}>
            preview
          </a>
        )}
      </td>
    </tr>
  );
}

function OcrPageRow({ p }: { p: OcrPageDebug }) {
  const [expanded, setExpanded] = useState(false);
  const statusColor =
    p.status === 'ok' ? 'text-green-600' :
    p.status === 'skipped_blank' ? 'text-gray-400' :
    p.status === 'rate_limited' ? 'text-orange-600' : 'text-red-600';
  const statusLabel =
    p.status === 'ok' ? `OK — ${p.chars} car` :
    p.status === 'empty' ? 'VUOTA' :
    p.status === 'skipped_blank' ? 'BIANCA (saltata)' :
    p.status === 'rate_limited' ? '429 RATE LIMIT' : 'ERRORE';

  return (
    <div className={`border rounded p-2 text-xs ${
      p.status === 'ok' ? 'border-green-200 bg-green-50' :
      p.status === 'rate_limited' ? 'border-orange-200 bg-orange-50' :
      p.status === 'skipped_blank' ? 'border-gray-200 bg-gray-50' :
      'border-red-200 bg-red-50'
    }`}>
      <div className="flex items-center justify-between">
        <span className="font-semibold text-gray-700">Pagina {p.page}</span>
        <span className={`font-bold ${statusColor}`}>{statusLabel}</span>
      </div>
      {p.status === 'ok' && p.preview && (
        <>
          <button onClick={() => setExpanded((v) => !v)} className="text-purple-600 underline mt-1">
            {expanded ? 'nascondi' : 'mostra anteprima OCR'}
          </button>
          {expanded && (
            <pre className="mt-1 text-gray-600 whitespace-pre-wrap font-mono max-h-32 overflow-auto bg-white rounded p-1 text-xs">
              {p.preview}
            </pre>
          )}
        </>
      )}
    </div>
  );
}

const REASON_LABELS: Record<string, string> = {
  too_short: 'Testo troppo breve (< 1200 car)',
  low_avg_chars_per_page: 'Media < 200 car/pag',
  repeated_disclaimer: 'Disclaimer ripetuto rilevato',
  watermark_dominated: 'Layer dominato da watermark',
  low_unique_tokens: 'Vocabolario troppo ripetitivo',
  ok: 'Testo OK',
};

function DebugPanel({ debug, meta }: { debug: DebugInfo; meta?: Meta }) {
  const is2Pass = meta?.analysis_mode === 'vision_ocr_2pass';
  const isPdfDirect = meta?.analysis_mode === 'pdf_direct';
  const docId = meta?.debugDocId;
  const topPages = [...debug.charsPerPage].sort((a, b) => b.chars - a.chars).slice(0, 10);

  return (
    <div className="space-y-4 text-xs">
      <div className={`rounded-lg p-3 ${isPdfDirect ? 'bg-blue-50' : is2Pass ? 'bg-purple-50' : 'bg-green-50'}`}>
        <div className={`font-semibold mb-1 ${isPdfDirect ? 'text-blue-700' : is2Pass ? 'text-purple-700' : 'text-green-700'}`}>
          Modalità analisi
        </div>
        <div className={`font-bold text-sm ${isPdfDirect ? 'text-blue-900' : is2Pass ? 'text-purple-900' : 'text-green-900'}`}>
          {isPdfDirect ? 'PDF Diretto — gpt-4.1-mini Responses API (nessun OCR)' :
           is2Pass ? 'Vision OCR 2-Pass (render → OCR → LLM estrazione)' :
           'Testo (keyword windows + LLM)'}
        </div>
        {meta?.reason_for_vision && (
          <div className="mt-1 text-purple-600">
            Motivo Vision: {REASON_LABELS[meta.reason_for_vision] ?? meta.reason_for_vision}
          </div>
        )}
        {docId && <div className="mt-1 text-gray-400 font-mono">docId: {docId}</div>}
      </div>

      {debug.textQualityMetrics && (
        <div className="bg-gray-50 rounded-lg p-3">
          <div className="font-semibold text-gray-700 mb-2">Qualità testo layer PDF</div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            {([
              ['Lunghezza', `${debug.textQualityMetrics.len.toLocaleString()} car`],
              ['Media car/pag', Math.round(debug.textQualityMetrics.avgCharsPerPage)],
              ['Watermark hits', debug.textQualityMetrics.watermarkHits],
              ['Ripetizione', `${(debug.textQualityMetrics.repetitionScore * 100).toFixed(0)}%`],
              ['Token unici', `${(debug.textQualityMetrics.uniqueTokenRatio * 100).toFixed(0)}%`],
            ] as [string, string | number][]).map(([lbl, val]) => (
              <div key={lbl} className="flex justify-between text-xs py-0.5 border-b border-gray-100">
                <span className="text-gray-500">{lbl}</span>
                <span className="font-medium text-gray-800">{val}</span>
              </div>
            ))}
            <div className="flex justify-between text-xs py-0.5 col-span-2">
              <span className="text-gray-500">Risultato</span>
              <span className={`font-semibold ${debug.textQualityReason === 'ok' ? 'text-green-600' : 'text-red-600'}`}>
                {REASON_LABELS[debug.textQualityReason ?? ''] ?? debug.textQualityReason}
              </span>
            </div>
          </div>
        </div>
      )}

      {is2Pass && debug.renderPages && debug.renderPages.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="font-semibold text-gray-700">
              Render ({debug.renderMethod ?? 'pdfjs'} · {debug.renderScale}× · JPEG {debug.renderJpegQuality}%)
            </span>
            <div className="flex gap-2">
              <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                {debug.nonBlankPageCount} OK
              </span>
              {(debug.blankPageCount ?? 0) > 0 && (
                <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">
                  {debug.blankPageCount} BIANCHE
                </span>
              )}
            </div>
          </div>
          {(debug.blankPageCount ?? 0) > 0 && (
            <div className="bg-red-50 border border-red-200 rounded p-2 mb-2 text-red-700">
              Immagini bianche rilevate. Causa possibile: DRM, rendering fallito, o formato non supportato.
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-400 border-b border-gray-100 text-xs">
                  <th className="text-left py-1 pr-2">Pag.</th>
                  <th className="text-right py-1 pr-2">Size</th>
                  <th className="text-right py-1 pr-2">Dim.</th>
                  <th className="text-right py-1 pr-2">Bianchezza</th>
                  <th className="text-left py-1 pr-2">Stato</th>
                  <th className="text-left py-1">Preview</th>
                </tr>
              </thead>
              <tbody>
                {debug.renderPages.map((p) => (
                  <RenderPageRow key={p.page} p={p} docId={docId} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {is2Pass && debug.ocrPages && debug.ocrPages.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="font-semibold text-gray-700">
              OCR per pagina (media {Math.round(debug.ocrAvgChars ?? 0)} car/pag)
            </span>
            {debug.ocrEscalated && (
              <span className="bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium">
                Qualità escalata 3×
              </span>
            )}
          </div>
          <div className="space-y-2">
            {debug.ocrPages.map((p) => <OcrPageRow key={p.page} p={p} />)}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-gray-50 rounded-lg p-3">
          <div className="text-gray-500 mb-0.5">Pagine totali</div>
          <div className="font-bold text-base">{debug.totalPages}</div>
        </div>
        <div className="bg-gray-50 rounded-lg p-3">
          <div className="text-gray-500 mb-0.5">Car. testo grezzo</div>
          <div className="font-bold text-base">{debug.totalChars.toLocaleString('it-IT')}</div>
        </div>
        <div className={`rounded-lg p-3 ${debug.textCoverage >= 80 ? 'bg-green-50' : 'bg-red-50'}`}>
          <div className={`mb-0.5 ${debug.textCoverage >= 80 ? 'text-green-600' : 'text-red-600'}`}>Char/pag (media)</div>
          <div className={`font-bold text-base ${debug.textCoverage >= 80 ? 'text-green-800' : 'text-red-800'}`}>
            {Math.round(debug.textCoverage)}
          </div>
        </div>
        <div className={`rounded-lg p-3 ${debug.isScanDetected ? 'bg-orange-50' : 'bg-green-50'}`}>
          <div className={`mb-0.5 ${debug.isScanDetected ? 'text-orange-600' : 'text-green-600'}`}>PDF inutilizzabile</div>
          <div className={`font-bold text-base ${debug.isScanDetected ? 'text-orange-800' : 'text-green-800'}`}>
            {debug.isScanDetected ? 'Sì' : 'No'}
          </div>
        </div>
      </div>

      {!is2Pass && (
        <div className="bg-gray-50 rounded-lg p-3">
          <div className="text-gray-600 font-semibold mb-2">Keyword hits per categoria</div>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(debug.hitsPerCategory).map(([cat, count]) => (
              <div key={cat} className="flex justify-between items-center">
                <span className="text-gray-600 capitalize">{cat}</span>
                <span className={`font-bold px-2 py-0.5 rounded ${(count as number) > 0 ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-600'}`}>
                  {count as number}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {topPages.length > 0 && (
        <div className="bg-gray-50 rounded-lg p-3">
          <div className="text-gray-600 font-semibold mb-2">Top pagine per car. testo</div>
          {topPages.map((p) => (
            <div key={p.page} className="flex items-center gap-2 mb-1">
              <span className="text-gray-500 w-14">Pag. {p.page}</span>
              <div className="flex-1 bg-gray-200 rounded-full h-1.5">
                <div
                  className="bg-blue-500 h-1.5 rounded-full"
                  style={{ width: `${Math.min(100, (p.chars / (topPages[0]?.chars || 1)) * 100)}%` }}
                />
              </div>
              <span className="text-gray-600 w-16 text-right">{p.chars.toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}

      <div className="bg-gray-50 rounded-lg p-3">
        <div className="text-gray-600 font-semibold mb-2">Prime 2000 char testo grezzo PDF</div>
        <pre className="text-gray-700 whitespace-pre-wrap break-words max-h-48 overflow-auto leading-relaxed">
          {debug.first2000chars || '(vuoto — probabile PDF solo immagine)'}
        </pre>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Used pages panel — shows which pages were analyzed and their text previews
// ─────────────────────────────────────────────────────────────────────────────

function UsedPagesPanel({
  evidence,
  fileUrl,
  onGoToPage,
}: {
  evidence: Evidence;
  fileUrl: string | null;
  onGoToPage?: (page: number) => void;
}) {
  const [expandedPage, setExpandedPage] = useState<number | null>(null);
  const { usedPages, pageSnippets, extractionStats } = evidence;

  return (
    <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
          Pagine analizzate
        </p>
        <span className="text-xs text-slate-400">
          {usedPages.length}/{extractionStats.totalPages} pag
          {' · '}
          {(extractionStats.usedTextLen / 1000).toFixed(0)}K car
        </span>
      </div>

      {/* Page number chips */}
      <div className="flex flex-wrap gap-1.5">
        {usedPages.map((p) => (
          <button
            key={p}
            onClick={() => setExpandedPage(expandedPage === p ? null : p)}
            className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition-all ${
              expandedPage === p
                ? 'bg-blue-700 text-white border-blue-700'
                : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300 hover:text-blue-700'
            }`}
          >
            {p}
          </button>
        ))}
      </div>

      {/* Accordion: text snippet + open-in-PDF link */}
      {expandedPage !== null && (() => {
        const s = pageSnippets.find((x) => x.page === expandedPage);
        return (
          <div className="space-y-2">
            {s && s.snippet && (
              <pre className="bg-white border border-slate-100 rounded-xl p-3 text-xs text-slate-600 whitespace-pre-wrap leading-relaxed max-h-36 overflow-auto font-mono">
                {s.snippet}
              </pre>
            )}
            <div className="flex items-center gap-3 flex-wrap">
              {onGoToPage && expandedPage !== null && (
                <button
                  onClick={() => onGoToPage(expandedPage)}
                  className="inline-flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 font-medium"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                  Vai a pagina {expandedPage} nel viewer
                </button>
              )}
              {fileUrl && (
                <a
                  href={`${fileUrl}#page=${expandedPage}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                  Apri in nuova scheda
                </a>
              )}
            </div>
          </div>
        );
      })()}

      {/* Warning if any pages were penalized */}
      {extractionStats.penalizedPages.length > 0 && (
        <p className="text-xs text-amber-600">
          Escluse {extractionStats.penalizedPages.length} pagine con copyright/watermark
          {' '}(pag. {extractionStats.penalizedPages.map((p) => p.page).join(', ')})
        </p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Print layout
// ─────────────────────────────────────────────────────────────────────────────

function PrintLayout({
  result,
  fileName,
  notes,
  verified,
}: {
  result: AnalysisResult | null;
  fileName: string;
  notes: Record<string, string>;
  verified: Record<string, boolean>;
}) {
  if (!result) return null;
  const analyzedAt = new Date().toLocaleString('it-IT');

  return (
    <div className="print-only hidden print:block">
      <div className="print-sheet p-8 max-w-3xl mx-auto font-sans">
        <div className="border-b-2 border-gray-800 pb-4 mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Perizia Analyzer — Scheda Asta</h1>
          <p className="text-sm text-gray-500 mt-1">
            File: <strong>{fileName}</strong> — Analisi del: {analyzedAt}
          </p>
        </div>

        <div className="space-y-5 mb-6">
          {FIELDS.map((f) => {
            const field = result[f.key] as {
              status: string; value?: string | null; summary?: string | null; confidence: number;
            };
            const text = field?.value ?? field?.summary ?? '—';
            const pct = Math.round((field?.confidence ?? 0) * 100);
            const statusLabel =
              field?.status === 'found' ? 'Trovato' :
              field?.status === 'scan_detected' ? 'Scansione' : 'Non trovato';

            return (
              <div key={f.key} className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="font-bold text-gray-900">{f.icon} {f.title}</h2>
                  <div className="flex gap-2 text-xs">
                    <span className="border border-gray-300 rounded px-2 py-0.5">{statusLabel}</span>
                    <span className="border border-gray-300 rounded px-2 py-0.5">Confidenza: {pct}%</span>
                    {verified[f.key] && (
                      <span className="border border-green-400 rounded px-2 py-0.5 text-green-700">✅ Verificato</span>
                    )}
                  </div>
                </div>
                <p className="text-gray-700 text-sm">{text}</p>
                {notes[f.key] && (
                  <p className="mt-2 text-xs text-gray-500 italic border-t pt-2">Note: {notes[f.key]}</p>
                )}
              </div>
            );
          })}
        </div>

        <div className="border border-blue-200 bg-blue-50 rounded-lg p-4 mb-6">
          <h2 className="font-bold text-blue-900 mb-3">Riassunto Operativo</h2>
          <div className="space-y-2">
            {[result.riassunto.paragrafo1, result.riassunto.paragrafo2, result.riassunto.paragrafo3].map((p, i) => (
              <p key={i} className="text-sm text-blue-800"><strong>{i + 1}.</strong> {p}</p>
            ))}
          </div>
        </div>

        <div className="border-t border-gray-200 pt-4 text-xs text-gray-400">
          Generato da Perizia Analyzer — {analyzedAt} — Uso interno riservato
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Esito card (new polished display, derived from existing result data)
// ─────────────────────────────────────────────────────────────────────────────

function EsitoCard({ result }: { result: AnalysisResult }) {
  const esito = getEsito(result);

  const colorMap = {
    verde: {
      bg: 'bg-emerald-50',
      border: 'border-emerald-200',
      dot: 'bg-emerald-500',
      label: 'text-emerald-700',
      summary: 'text-emerald-800',
    },
    giallo: {
      bg: 'bg-amber-50',
      border: 'border-amber-200',
      dot: 'bg-amber-400',
      label: 'text-amber-700',
      summary: 'text-amber-800',
    },
    rosso: {
      bg: 'bg-red-50',
      border: 'border-red-200',
      dot: 'bg-red-500',
      label: 'text-red-700',
      summary: 'text-red-800',
    },
  }[esito.color];

  // Derive quick stats from existing result
  type AnyField = { value?: string | null; summary?: string | null };
  const valoreRaw = (result.valore_perito as unknown as AnyField).value ?? (result.valore_perito as unknown as AnyField).summary ?? null;
  const costiRaw = (result.costi_oneri as unknown as AnyField).value ?? (result.costi_oneri as unknown as AnyField).summary ?? null;
  const difformitaFound = result.difformita.status === 'found';
  const attiFound = result.atti_antecedenti.status === 'found';
  const costiFound = result.costi_oneri.status === 'found';

  const rischioCount = [difformitaFound, attiFound, costiFound].filter(Boolean).length;

  const grid = [
    {
      label: 'Valore Perito',
      value: valoreRaw ? valoreRaw.split(/\s+/).slice(0, 4).join(' ') : 'N/D',
      found: result.valore_perito.status === 'found',
    },
    {
      label: 'Costi e Oneri',
      value: costiFound ? (costiRaw ? costiRaw.split(/\s+/).slice(0, 4).join(' ') : 'Trovati') : 'Non rilevati',
      found: costiFound,
      warn: costiFound,
    },
    {
      label: 'Atti Precedenti',
      value: attiFound ? 'Trovati' : 'Nessuno',
      found: attiFound,
      warn: attiFound,
    },
    {
      label: 'Difformità',
      value: difformitaFound ? 'Rilevate' : 'Nessuna',
      found: difformitaFound,
      warn: difformitaFound,
    },
  ];

  return (
    <div className="space-y-3">
      {/* Esito banner */}
      <div className={`${colorMap.bg} ${colorMap.border} border rounded-2xl p-4 flex items-start gap-3`}>
        <div className={`flex-shrink-0 w-3 h-3 rounded-full ${colorMap.dot} mt-1`} />
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-sm font-bold ${colorMap.label}`}>Esito generale</span>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${colorMap.bg} ${colorMap.label} border ${colorMap.border}`}>
              {esito.label}
            </span>
          </div>
          <p className={`text-sm ${colorMap.summary} leading-relaxed`}>
            {result.riassunto.paragrafo1}
          </p>
        </div>
      </div>

      {/* 2×2 quick stats */}
      <div className="grid grid-cols-2 gap-2.5">
        {grid.map((item) => (
          <div
            key={item.label}
            className={`rounded-xl border px-4 py-3 ${
              item.warn ? 'bg-amber-50 border-amber-100' : 'bg-white border-slate-100'
            }`}
          >
            <p className="text-xs text-slate-400 mb-0.5">{item.label}</p>
            <p className={`text-sm font-semibold truncate ${
              item.warn ? 'text-amber-700' : item.found ? 'text-slate-900' : 'text-emerald-600'
            }`}>
              {item.value}
            </p>
          </div>
        ))}
      </div>

      {/* Risk count */}
      {rischioCount > 0 && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-50 border border-slate-100 rounded-xl">
          <svg className="w-4 h-4 text-amber-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
          <p className="text-xs text-slate-600">
            <span className="font-semibold">{rischioCount} element{rischioCount > 1 ? 'i' : 'o'}</span> da verificare prima dell&apos;offerta.
          </p>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────

// Progressive loading step labels shown during analysis
const LOADING_STEPS = [
  'Caricamento su cloud…',
  'OCR avanzato (Textract)…',
  'Analisi AI strutturata…',
  'Elaborazione risultati…',
] as const;

// Quick-start guide shown on "Aiuto" toggle
const HELP_STEPS = [
  'Scarica il PDF della perizia dal portale aste (PVP, Tribunale, ecc.).',
  'Trascina il file nell\'area di upload oppure clicca "Scegli un file".',
  'Premi "Analizza perizia" e attendi 30–60 secondi.',
  'Controlla le 4 sezioni estratte: Valore, Atti, Costi, Difformità.',
  'Usa la Checklist di Verifica per confermare ogni voce.',
  'Esporta il report in PDF, CSV o JSON tramite il pulsante "Esporta".',
];

export default function AnalizzaPage() {
  const [file, setFile] = useState<File | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingStepIdx, setLoadingStepIdx] = useState(0);
  const stepIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [pdfDebug, setPdfDebug] = useState<PdfDebugInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [apiError, setApiError] = useState<ApiError | null>(null);
  const [showDebug, setShowDebug] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [targetPage, setTargetPage] = useState<number | undefined>(undefined);

  const { notes, verified, setNote, setVerified } = usePersistence(file?.name, file?.size);

  // ── File selection ──────────────────────────────────────────────────────

  const selectFile = useCallback(
    (selected: File) => {
      if (selected.type !== 'application/pdf') {
        setError('Seleziona un file PDF valido.');
        return;
      }
      const MAX_MB = 15;
      if (selected.size > MAX_MB * 1024 * 1024) {
        setError(`Il file è troppo grande. Dimensione massima: ${MAX_MB} MB.`);
        return;
      }
      if (fileUrl) URL.revokeObjectURL(fileUrl);
      setFile(selected);
      setFileUrl(URL.createObjectURL(selected));
      setResult(null);
      setRequestId(null);
      setError(null);
      setApiError(null);
      setPdfDebug(null);
      setShowDebug(false);
    },
    [fileUrl],
  );

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selected = e.target.files?.[0];
      if (selected) selectFile(selected);
    },
    [selectFile],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const dropped = e.dataTransfer.files[0];
      if (dropped) selectFile(dropped);
    },
    [selectFile],
  );

  // ── Analysis ────────────────────────────────────────────────────────────

  const runAnalysis = useCallback(
    async (_extended: boolean) => {
      if (!file) return;
      setLoading(true);
      setError(null);
      setResult(null);
      setRequestId(null);
      setApiError(null);
      setPdfDebug(null);
      setShowDebug(false);
      if (stepIntervalRef.current) clearInterval(stepIntervalRef.current);
      setLoadingStepIdx(0);

      try {
        // ── Try new async flow: upload → S3 → BullMQ → poll ───────────────
        let uploadData: { jobId: string; documentId: string; s3Uploaded: boolean } | null = null;
        try {
          const fd = new FormData();
          fd.append('file', file);
          const uploadRes = await fetch('/api/upload', { method: 'POST', body: fd });
          if (uploadRes.ok) uploadData = await uploadRes.json();
        } catch { /* fall through to sync */ }

        // ── If S3 not available → fall back to sync /api/analyze ──────────
        if (!uploadData?.s3Uploaded) {
          setLoadingStepIdx(2);
          const fd = new FormData();
          fd.append('file', file);
          let res: Response;
          try {
            res = await fetch('/api/analyze', { method: 'POST', body: fd });
          } catch (networkErr) {
            setError(`Impossibile raggiungere il server: ${networkErr instanceof Error ? networkErr.message : String(networkErr)}`);
            return;
          }
          let payload: unknown;
          try {
            payload = res.headers.get('content-type')?.includes('application/json')
              ? await res.json()
              : { error: `HTTP ${res.status}`, detail: await res.text() };
          } catch (e) { payload = { error: `HTTP ${res.status}`, detail: String(e) }; }

          if (!res.ok || (typeof payload === 'object' && payload !== null && 'error' in payload)) {
            const apiErr = payload as ApiError;
            setError(friendlyErrorMessage(res.status, apiErr.error ?? ''));
            setApiError({ ...apiErr, httpStatus: res.status });
            return;
          }
          const r = payload as AnalysisResult & { pdfDebug?: PdfDebugInfo; requestId?: string };
          setResult(r);
          if (r.requestId) setRequestId(r.requestId);
          if (r.pdfDebug) setPdfDebug(r.pdfDebug);
          try { saveToHistory(file.name, r); } catch { /* ok */ }
          return;
        }

        // ── Poll /api/jobs/{jobId} ────────────────────────────────────────
        const { jobId } = uploadData;
        const MAX_POLLS = 120; // 6 minutes
        for (let i = 0; i < MAX_POLLS; i++) {
          await new Promise((r) => setTimeout(r, 3000));
          let jobData: Record<string, unknown>;
          try {
            const r = await fetch(`/api/jobs/${jobId}`);
            jobData = await r.json();
          } catch { continue; }

          const status   = jobData.status as string;
          const progress = (jobData.progress as number) ?? 0;
          setLoadingStepIdx(progress < 40 ? 0 : progress < 60 ? 1 : progress < 90 ? 2 : 3);

          if (status === 'failed') {
            const msg = (jobData.error as string) ?? 'Errore durante l\'elaborazione.';
            setError(msg);
            setApiError({ error: msg });
            return;
          }

          if (status === 'succeeded') {
            const raw = jobData.result as Record<string, unknown> | null;
            if (!raw) { setError('Risultato non trovato.'); return; }

            const getF = (f: unknown) => f as Record<string, unknown> ?? {};
            const base = (f: unknown) => ({
              status:     ((getF(f).status as string) ?? 'not_found') as 'found' | 'not_found',
              confidence: (getF(f).confidence as number) ?? 0.5,
              citations:  [] as { page: number; snippet: string }[],
              candidates: [] as { value: string; confidence: number; citations: { page: number; snippet: string }[] }[],
            });
            const meta = getF(raw.meta);

            const mapped: AnalysisResult = {
              valore_perito:    { ...base(raw.valore_perito), value: (getF(raw.valore_perito).value as string) ?? null },
              atti_antecedenti: { ...base(raw.atti_antecedenti), summary: (getF(raw.atti_antecedenti).summary as string) ?? null },
              costi_oneri:      { ...base(raw.costi_oneri), summary: (getF(raw.costi_oneri).summary as string) ?? null },
              difformita:       { ...base(raw.difformita), summary: (getF(raw.difformita).summary as string) ?? null },
              riassunto:        (raw.riassunto as AnalysisResult['riassunto']) ?? { paragrafo1: '', paragrafo2: '', paragrafo3: '' },
              debug: {
                totalPages: (meta.total_pages as number) ?? 0,
                totalChars: (meta.textLen as number) ?? 0,
                charsPerPage: [], textCoverage: 0, isScanDetected: false,
                hitsPerCategory: {}, first2000chars: '', last2000chars: '',
                promptPayloadLength: 0, extractionEngine: 'textract',
              },
              meta: {
                analysis_mode: 'pdf_direct',
                total_pages: (meta.total_pages as number) ?? 0,
                pages_analyzed: (meta.pages_analyzed as number) ?? 0,
                notes: `Textract + Claude Haiku · ${meta.total_pages ?? 0} pag.`,
              },
            };

            setResult(mapped);
            try { saveToHistory(file.name, mapped); } catch { /* ok */ }
            return;
          }
        }
        setError('Timeout: elaborazione troppo lenta. Riprova.');
      } finally {
        if (stepIntervalRef.current) {
          clearInterval(stepIntervalRef.current);
          stepIntervalRef.current = null;
        }
        setLoading(false);
      }
    },
    [file],
  );

  const handleAnalyze = useCallback(() => runAnalysis(false), [runAnalysis]);
  const handleExpanded = useCallback(() => runAnalysis(true), [runAnalysis]);

  const handleReset = useCallback(() => {
    if (fileUrl) URL.revokeObjectURL(fileUrl);
    setFile(null);
    setFileUrl(null);
    setResult(null);
    setRequestId(null);
    setError(null);
    setApiError(null);
    setPdfDebug(null);
    setShowDebug(false);
    setTargetPage(undefined);
  }, [fileUrl]);

  const debugData = result?.debug ?? apiError?.debug ?? null;

  const canExpand =
    result?.meta?.analysis_mode === 'vision_ocr_2pass' &&
    (result.valore_perito.status === 'not_found' ||
      result.atti_antecedenti.status === 'not_found' ||
      result.costi_oneri.status === 'not_found' ||
      result.difformita.status === 'not_found') &&
    result.meta.pages_analyzed < result.meta.total_pages;

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <>
      {/* Screen layout */}
      <div className="flex h-[calc(100vh-56px)] overflow-hidden no-print">

        {/* LEFT: PDF viewer */}
        <div className="w-1/2 border-r border-slate-200 bg-slate-50 flex flex-col overflow-hidden">
          {fileUrl ? (
            <PdfViewer
              url={fileUrl}
              targetPage={targetPage}
              totalPages={result?.meta?.total_pages}
            />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 p-10 text-center">
              <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center">
                <svg className="w-7 h-7 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div>
                <p className="text-slate-500 font-medium text-sm">Nessuna perizia caricata</p>
                <p className="text-slate-400 text-xs mt-1">Carica un PDF per visualizzarlo qui</p>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT: Upload + results */}
        <div className="w-1/2 overflow-y-auto bg-white">
          <div className="p-6 space-y-5 max-w-xl mx-auto">

            {/* Page title + help toggle */}
            <div className="flex items-start justify-between gap-2">
              <div>
                <h1 className="text-lg font-bold text-slate-900">Analizza perizia</h1>
                <p className="text-xs text-slate-400 mt-0.5">PDF scaricato dal portale aste · max 15 MB</p>
              </div>
              <button
                onClick={() => setShowHelp((v) => !v)}
                className={`flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border transition-colors flex-shrink-0 ${
                  showHelp
                    ? 'bg-blue-50 border-blue-200 text-blue-700'
                    : 'bg-white border-slate-200 text-slate-400 hover:text-slate-700 hover:border-slate-300'
                }`}
                aria-label="Guida rapida"
              >
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd"
                    d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z"
                    clipRule="evenodd" />
                </svg>
                Guida
              </button>
            </div>

            {/* Quick-start help panel */}
            {showHelp && (
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 animate-fade-in">
                <p className="text-xs font-semibold text-blue-800 mb-2.5">Come analizzare una perizia</p>
                <ol className="space-y-1.5">
                  {HELP_STEPS.map((step, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="flex-shrink-0 w-4 h-4 rounded-full bg-blue-200 text-blue-800 text-xs font-bold flex items-center justify-center leading-none mt-0.5">
                        {i + 1}
                      </span>
                      <span className="text-xs text-blue-700 leading-relaxed">{step}</span>
                    </li>
                  ))}
                </ol>
                <p className="text-xs text-blue-500 mt-3 pt-2.5 border-t border-blue-100">
                  Il documento viene elaborato in modo sicuro. Nessun dato viene condiviso con terze parti.
                </p>
              </div>
            )}

            {/* Drop zone */}
            <label
              htmlFor="pdf-input"
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              className={`flex flex-col items-center justify-center w-full border-2 border-dashed rounded-2xl p-6 cursor-pointer transition-all ${
                dragOver
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-slate-200 hover:border-blue-300 hover:bg-slate-50'
              }`}
            >
              <svg className="w-7 h-7 text-slate-300 mb-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              {file ? (
                <div className="text-center">
                  <span className="text-sm font-semibold text-blue-700 truncate max-w-xs block">{file.name}</span>
                  <span className="text-xs text-slate-400 mt-0.5 block">
                    {(file.size / 1024 / 1024).toFixed(1)} MB · clicca per cambiare
                  </span>
                </div>
              ) : (
                <div className="text-center">
                  <span className="text-sm text-slate-500">
                    <span className="font-semibold text-blue-700">Scegli un file</span> o trascinalo qui
                  </span>
                  <span className="text-xs text-slate-400 block mt-1">Solo PDF · max 15 MB</span>
                </div>
              )}
              <input id="pdf-input" type="file" accept=".pdf" onChange={handleFileChange} className="hidden" />
            </label>

            {/* Analyze button */}
            <button
              onClick={handleAnalyze}
              disabled={!file || loading}
              className="w-full bg-blue-700 text-white py-3 px-4 rounded-xl font-semibold text-sm hover:bg-blue-800 active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  {LOADING_STEPS[loadingStepIdx]}
                </>
              ) : (
                'Analizza perizia'
              )}
            </button>

            {/* Loading progress sub-label */}
            {loading && (
              <div className="flex items-center gap-2 -mt-3">
                <div className="flex-1 h-1 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-600 rounded-full transition-all duration-[2000ms] ease-out"
                    style={{ width: `${((loadingStepIdx + 1) / LOADING_STEPS.length) * 100}%` }}
                  />
                </div>
                <span className="text-xs text-slate-400 flex-shrink-0 tabular-nums">
                  {loadingStepIdx + 1}/{LOADING_STEPS.length}
                </span>
              </div>
            )}

            {/* Extended button */}
            {canExpand && !loading && (
              <button
                onClick={handleExpanded}
                className="w-full bg-purple-600 text-white py-2.5 px-4 rounded-xl font-medium text-sm hover:bg-purple-700 transition-all"
              >
                Analisi estesa (fino a 16 pagine)
              </button>
            )}

            {/* Error banner */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-2 animate-fade-in">
                <div className="flex items-start gap-2">
                  <svg className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                      clipRule="evenodd" />
                  </svg>
                  <div className="min-w-0 flex-1">
                    {apiError?.httpStatus && (
                      <span className="inline-block text-xs font-mono font-bold bg-red-200 text-red-800 rounded px-1.5 py-0.5 mr-1.5 mb-1">
                        HTTP {apiError.httpStatus}
                      </span>
                    )}
                    <p className="text-red-700 text-sm font-medium break-words">{error}</p>
                    {apiError?.requestId && (
                      <p className="text-red-400 text-xs font-mono mt-0.5">ID: {apiError.requestId}</p>
                    )}
                  </div>
                </div>
                {(apiError?.detail || apiError?.issues) && (
                  <details className="text-xs">
                    <summary className="text-red-400 cursor-pointer hover:text-red-600">Dettagli tecnici</summary>
                    <div className="mt-1.5 space-y-1">
                      {apiError?.detail && (
                        <p className="text-red-600 font-mono bg-red-100 rounded px-2 py-1 break-all">{String(apiError.detail)}</p>
                      )}
                      {apiError?.issues && (
                        <p className="text-red-600 font-mono bg-red-100 rounded px-2 py-1 break-all">{JSON.stringify(apiError.issues, null, 2)}</p>
                      )}
                    </div>
                  </details>
                )}
              </div>
            )}

            {/* Results */}
            {result && (
              <div className="space-y-5 animate-fade-in">

                {/* ── PDF type badge + quality gate (deterministic, no false positives) ── */}
                {(() => {
                  const eng = result.debug.extractionEngine ?? '';
                  const visionUsed = result.debug.vision_used ?? result.debug.isScanDetected;
                  const hasTextLayer = result.debug.has_text_layer ?? !visionUsed;
                  const qScore = result.debug.data_quality_score ?? (result.debug.isScanDetected ? 30 : 70);
                  const qReason = result.debug.data_quality_reason ?? '';

                  if (eng === 'failed') {
                    return (
                      <div className="bg-red-50 border border-red-300 rounded-xl p-4 flex items-start gap-3">
                        <svg className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                        </svg>
                        <div>
                          <p className="text-red-800 font-semibold text-sm">Impossibile leggere il PDF</p>
                          <p className="text-red-700 text-xs mt-0.5">Il parsing del PDF è fallito. Riprova con un PDF non protetto.</p>
                        </div>
                      </div>
                    );
                  }

                  if (hasTextLayer && !visionUsed) {
                    return (
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                          PDF testuale rilevato
                        </span>
                        <span className="text-xs text-slate-400 font-mono">Q:{qScore}/100</span>
                        {requestId && <span className="text-xs text-slate-300 font-mono">ID:{requestId}</span>}
                      </div>
                    );
                  }

                  if (visionUsed && qScore >= 60) {
                    return (
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 border border-blue-200">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                          </svg>
                          PDF scannerizzato — OCR applicato con successo
                        </span>
                        <span className="text-xs text-slate-400 font-mono">Q:{qScore}/100</span>
                        {requestId && <span className="text-xs text-slate-300 font-mono">ID:{requestId}</span>}
                      </div>
                    );
                  }

                  // Low quality warning (the only case we show amber/red)
                  return (
                    <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 flex items-start gap-3">
                      <svg className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                      </svg>
                      <div className="flex-1">
                        <p className="text-amber-800 font-semibold text-sm">
                          PDF scannerizzato — qualità dati bassa
                        </p>
                        <p className="text-amber-700 text-xs mt-0.5">
                          Il PDF non contiene testo selezionabile e la qualità OCR è bassa
                          (score: <strong>{qScore}/100</strong>). I risultati potrebbero essere incompleti.
                          {qReason && <span> Motivo: {qReason}.</span>}
                        </p>
                        {requestId && <p className="text-amber-500 text-xs font-mono mt-1">ID:{requestId}</p>}
                      </div>
                    </div>
                  );
                })()}

                {/* Staging: pdfDebug panel */}
                {pdfDebug && (
                  <div className="bg-slate-800 text-slate-100 rounded-xl p-4 text-xs font-mono space-y-1">
                    <p className="text-slate-400 font-sans font-semibold mb-2">PDF Debug (staging only)</p>
                    <p>ok: <span className={pdfDebug.ok ? 'text-green-400' : 'text-red-400'}>{String(pdfDebug.ok)}</span></p>
                    <p>fileBytes: <span className="text-yellow-300">{pdfDebug.fileBytes.toLocaleString()}</span></p>
                    <p>magic: <span className="text-yellow-300">{JSON.stringify(pdfDebug.magic)}</span></p>
                    <p>pdfPages: <span className="text-yellow-300">{pdfDebug.pdfPages}</span></p>
                    <p>extractedTextLength: <span className={pdfDebug.extractedTextLength >= 200 ? 'text-green-400' : 'text-red-400'}>{pdfDebug.extractedTextLength.toLocaleString()}</span></p>
                    <p>extractionEngine: <span className="text-yellow-300">{pdfDebug.extractionEngine}</span></p>
                    {pdfDebug.error && (
                      <p className="text-red-400 break-all">error: {pdfDebug.error}</p>
                    )}
                  </div>
                )}

                {/* Export bar */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <p className="text-xs text-slate-400">Analisi completata</p>
                    <button
                      onClick={handleReset}
                      className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1 px-2 py-1 rounded hover:bg-slate-100 transition-colors"
                      title="Nuova analisi"
                    >
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M12 4v16m8-8H4" />
                      </svg>
                      Nuova
                    </button>
                  </div>
                  <ExportMenu result={result} fileName={file?.name ?? 'perizia'} notes={notes} verified={verified} />
                </div>

                {/* Esito + 2x2 grid */}
                <EsitoCard result={result} />

                {/* Risk insights + priority order */}
                <RiskPanel result={result} />

                {/* Used pages panel */}
                {result.evidence && (
                  <UsedPagesPanel
                    evidence={result.evidence}
                    fileUrl={fileUrl}
                    onGoToPage={setTargetPage}
                  />
                )}

                {/* Field sections */}
                {FIELDS.map((f) => {
                  const field = result[f.key] as {
                    status: 'found' | 'not_found' | 'scan_detected';
                    value?: string | null;
                    summary?: string | null;
                    confidence: number;
                    citations: { page: number; snippet: string; keyword?: string }[];
                    candidates: {
                      value: string; confidence: number;
                      citations: { page: number; snippet: string }[];
                      explanation?: string; reason?: string;
                    }[];
                  };
                  return (
                    <FieldSection
                      key={f.key}
                      fieldKey={f.key}
                      title={f.title}
                      icon={f.icon}
                      description={f.description}
                      field={field}
                      note={notes[f.key] ?? ''}
                      verified={!!verified[f.key]}
                      onNoteChange={(v) => setNote(f.key, v)}
                      onVerifiedChange={(v) => setVerified(f.key, v)}
                      onGoToPage={setTargetPage}
                    />
                  );
                })}

                {/* Operative summary */}
                <SummarySection riassunto={result.riassunto} />

                {/* Resoconto completo (12 sections) */}
                {result.resoconto_completo && (
                  <div className="border-t border-slate-100 pt-5 space-y-4">
                    <ResocontoSection resoconto={result.resoconto_completo} />
                  </div>
                )}

                {/* PDF Resoconto button */}
                <div className="border border-blue-200 bg-blue-50 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center gap-3 justify-between">
                  <div>
                    <p className="text-sm font-bold text-blue-900">Resoconto completo in PDF</p>
                    <p className="text-xs text-blue-600 mt-0.5">
                      Genera un PDF professionale con copertina, indice, tutte le sezioni e appendice fonti.
                    </p>
                  </div>
                  <button
                    onClick={() => openAndPrintResoconto(result, file?.name ?? 'perizia.pdf')}
                    className="flex-shrink-0 flex items-center gap-2 bg-blue-700 text-white px-5 py-2.5 rounded-xl font-semibold text-sm hover:bg-blue-800 active:scale-[0.98] transition-all shadow-sm"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Vedi il resoconto (PDF)
                  </button>
                </div>

                {/* Verify workflow */}
                <VerifyWorkflow verified={verified} onToggle={setVerified} />

                {/* Expand banner */}
                {canExpand && !loading && (
                  <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
                    <p className="text-purple-800 text-sm mb-2">
                      Alcuni campi non trovati ({result.meta.pages_analyzed}/{result.meta.total_pages} pagine analizzate).
                      L&apos;analisi estesa esamina fino a 16 pagine.
                    </p>
                    <button
                      onClick={handleExpanded}
                      className="bg-purple-600 text-white py-2 px-4 rounded-lg text-sm font-medium hover:bg-purple-700 transition-colors"
                    >
                      Analisi estesa (fino a 16 pagine)
                    </button>
                  </div>
                )}

                {/* Debug toggle */}
                {debugData && (
                  <div>
                    <button
                      onClick={() => setShowDebug((v) => !v)}
                      className="text-xs text-slate-300 hover:text-slate-500 flex items-center gap-1.5 transition-colors"
                    >
                      <svg className={`w-3.5 h-3.5 transition-transform ${showDebug ? 'rotate-90' : ''}`}
                        fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                      {showDebug ? 'Nascondi dettagli tecnici' : 'Dettagli tecnici'}
                    </button>
                    {showDebug && (
                      <div className="mt-3">
                        <DebugPanel debug={debugData} meta={result?.meta} />
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Print layout */}
      <PrintLayout result={result} fileName={file?.name ?? ''} notes={notes} verified={verified} />
    </>
  );
}
