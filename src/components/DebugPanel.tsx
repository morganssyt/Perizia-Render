'use client';

import { DebugInfo } from '@/types';

interface DebugPanelProps {
  debugInfo: DebugInfo | null;
  pipelineLogs: string;
}

export default function DebugPanel({ debugInfo, pipelineLogs }: DebugPanelProps) {
  if (!debugInfo && !pipelineLogs) {
    return (
      <div className="p-4 text-sm text-gray-500">
        Nessuna informazione di debug disponibile. Rielabora il documento.
      </div>
    );
  }

  const coveragePct = debugInfo ? Math.round(debugInfo.textCoverage * 100) : 0;
  const coverageColor =
    coveragePct >= 70 ? 'text-green-600' :
    coveragePct >= 30 ? 'text-amber-600' :
    'text-red-600';

  return (
    <div className="space-y-4 animate-fade-in text-sm">

      {/* ── Coverage bar ── */}
      {debugInfo && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
          <h3 className="font-semibold text-gray-800">Qualità testo estratto</h3>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="bg-gray-50 rounded-lg p-3">
              <div className={`text-2xl font-bold ${coverageColor}`}>{coveragePct}%</div>
              <div className="text-gray-500 mt-0.5">copertura testo</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="text-2xl font-bold text-gray-700">{debugInfo.totalPages}</div>
              <div className="text-gray-500 mt-0.5">pagine totali</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="text-2xl font-bold text-gray-700">{Math.round(debugInfo.avgCharsPerPage)}</div>
              <div className="text-gray-500 mt-0.5">caratteri/pag media</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="text-2xl font-bold text-gray-700">{debugInfo.pagesWithText}/{debugInfo.totalPages}</div>
              <div className="text-gray-500 mt-0.5">pagine con testo</div>
            </div>
          </div>

          {debugInfo.isProbablyScan && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
              <strong>Probabile scansione:</strong> {debugInfo.scanReason}
            </div>
          )}

          <div className="w-full bg-gray-100 rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all ${
                coveragePct >= 70 ? 'bg-green-500' :
                coveragePct >= 30 ? 'bg-amber-500' : 'bg-red-500'
              }`}
              style={{ width: `${coveragePct}%` }}
            />
          </div>
        </div>
      )}

      {/* ── Extraction warnings ── */}
      {debugInfo && debugInfo.extractionWarnings.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-1.5">
          <h3 className="font-semibold text-red-800 text-xs uppercase tracking-wide">
            Warning estrazione ({debugInfo.extractionWarnings.length})
          </h3>
          {debugInfo.extractionWarnings.map((w, i) => (
            <div key={i} className="text-xs text-red-700 flex gap-2">
              <span className="shrink-0">⚠</span>
              <span>{w}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Keyword match report ── */}
      {debugInfo && debugInfo.keywordMatches.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
          <h3 className="font-semibold text-gray-800">Report keyword match</h3>
          <div className="space-y-2">
            {debugInfo.keywordMatches.map((km) => {
              const found = km.sectionsFound > 0;
              return (
                <div key={km.field} className={`rounded-lg p-3 text-xs ${found ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className={`font-semibold ${found ? 'text-green-800' : 'text-red-800'}`}>
                      {found ? '✓' : '✗'} {FIELD_LABELS[km.field] ?? km.field}
                    </span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      found ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                    }`}>
                      {km.sectionsFound} sezioni
                    </span>
                  </div>

                  {km.matchedKeywords.length > 0 && (
                    <div className="mb-1.5">
                      <span className="text-gray-500">Match: </span>
                      <span className="text-green-700">{km.matchedKeywords.slice(0, 8).join(', ')}{km.matchedKeywords.length > 8 ? ` +${km.matchedKeywords.length - 8}` : ''}</span>
                    </div>
                  )}

                  {km.sampleText && (
                    <div className="mt-1.5 bg-white rounded p-2 text-gray-600 font-mono text-xs border border-gray-100 max-h-20 overflow-y-auto">
                      {km.sampleText.slice(0, 250)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── First 500 words ── */}
      {debugInfo && debugInfo.firstWords && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-2">
          <h3 className="font-semibold text-gray-800">Prime parole estratte</h3>
          <pre className="text-xs text-gray-600 bg-gray-50 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap max-h-48 overflow-y-auto font-mono border border-gray-100">
            {debugInfo.firstWords}
          </pre>
        </div>
      )}

      {/* ── Per-page breakdown ── */}
      {debugInfo && debugInfo.perPage.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-2">
          <h3 className="font-semibold text-gray-800">Dettaglio per pagina</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-400 border-b border-gray-100">
                  <th className="text-left py-1 pr-3">Pag.</th>
                  <th className="text-right py-1 pr-3">Caratteri</th>
                  <th className="text-left py-1 pr-3">Stato</th>
                  <th className="text-left py-1">Anteprima</th>
                </tr>
              </thead>
              <tbody>
                {debugInfo.perPage.map((p) => (
                  <tr key={p.page} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-1 pr-3 font-medium text-gray-700">{p.page}</td>
                    <td className="py-1 pr-3 text-right tabular-nums text-gray-600">{p.chars}</td>
                    <td className="py-1 pr-3">
                      <span className={`px-1.5 py-0.5 rounded-full text-xs ${
                        p.hasText ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                      }`}>
                        {p.hasText ? 'testo' : 'vuota'}
                      </span>
                    </td>
                    <td className="py-1 text-gray-400 font-mono truncate max-w-xs">
                      {p.firstWords.replace(/\n/g, ' ').slice(0, 60)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Pipeline logs ── */}
      {pipelineLogs && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-2">
          <h3 className="font-semibold text-gray-800">Log pipeline</h3>
          <pre className="text-xs text-gray-600 bg-gray-900 text-green-400 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap max-h-64 overflow-y-auto font-mono">
            {pipelineLogs}
          </pre>
        </div>
      )}
    </div>
  );
}

const FIELD_LABELS: Record<string, string> = {
  antecedentActs: 'Atti Antecedenti',
  legalCosts: 'Costi / Oneri',
  irregularities: 'Difformità / Abusi',
  expertValue: 'Valore del Perito',
};
