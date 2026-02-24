'use client';

import { useState } from 'react';
import type { ResocontoCompleto, ResocontoField } from '@/app/api/analyze/route';

// ─────────────────────────────────────────────────────────────────────────────
// Section metadata
// ─────────────────────────────────────────────────────────────────────────────

const SECTIONS: Array<{
  key: keyof Omit<ResocontoCompleto, 'rischi' | 'checklist'>;
  num: string;
  title: string;
  icon: string;
  glossario?: string;
}> = [
  { key: 'identificazione',   num: '1', title: 'Identificazione immobile',    icon: '🏠',
    glossario: 'Destinazione d\'uso: uso che la legge consente per quell\'immobile (es. residenziale, commerciale).' },
  { key: 'dati_catastali',    num: '2', title: 'Dati catastali',               icon: '📋',
    glossario: 'Foglio/Particella/Sub: codici del Catasto italiano che identificano univocamente la proprietà. Rendita catastale: valore fiscale base per calcolo IMU/TARI.' },
  { key: 'superfici',         num: '3', title: 'Superfici',                    icon: '📐',
    glossario: 'Sup. commerciale: include pareti e pertinenze. Sup. catastale: base per calcolo imposta. Sup. utile: superficie effettivamente abitabile.' },
  { key: 'titolarita',        num: '4', title: 'Titolarità e quota',           icon: '👤' },
  { key: 'vincoli_ipoteche',  num: '5', title: 'Vincoli, ipoteche, servitù',  icon: '⚖️',
    glossario: 'Ipoteca: garanzia reale su immobile a favore di un creditore. Pignoramento: blocco dell\'immobile in attesa di vendita forzata. Servitù: diritto di un terzo sull\'immobile.' },
  { key: 'stato_occupativo',  num: '6', title: 'Stato occupativo',             icon: '🔑' },
  { key: 'conformita',        num: '7', title: 'Conformità urbanistica/edilizia', icon: '🏗️',
    glossario: 'Difformità catastale: la planimetria depositata al catasto non corrisponde all\'immobile reale. Abuso edilizio: costruzione senza permesso o in difformità dal progetto approvato.' },
  { key: 'stato_manutentivo', num: '8', title: 'Stato manutentivo e impianti', icon: '🔧' },
  { key: 'spese_condominio',  num: '9', title: 'Spese condominiali e oneri',   icon: '💶' },
  { key: 'valutazione',       num: '10', title: 'Valutazione e base d\'asta',  icon: '💰' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function ConfidenzaBadge({ c }: { c: 'Alta' | 'Media' | 'Bassa' }) {
  const cls =
    c === 'Alta'  ? 'bg-emerald-100 text-emerald-700 border-emerald-200' :
    c === 'Media' ? 'bg-amber-100 text-amber-700 border-amber-200' :
                    'bg-red-100 text-red-700 border-red-200';
  return (
    <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-semibold border ${cls}`}>
      Confidenza {c}
    </span>
  );
}

function SeveritaBadge({ s }: { s: 'Alta' | 'Media' | 'Bassa' }) {
  const cls =
    s === 'Alta'  ? 'bg-red-100 text-red-700 border-red-200' :
    s === 'Media' ? 'bg-amber-100 text-amber-700 border-amber-200' :
                    'bg-blue-100 text-blue-700 border-blue-200';
  return (
    <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-semibold border ${cls}`}>
      {s}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Single section row
// ─────────────────────────────────────────────────────────────────────────────

function SectionRow({
  num, title, icon, glossario, field,
}: {
  num: string; title: string; icon: string; glossario?: string; field: ResocontoField;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className={`border rounded-xl overflow-hidden transition-all ${
      field.trovato ? 'border-slate-200 bg-white' : 'border-slate-100 bg-slate-50'
    }`}>
      {/* Header */}
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-start gap-3 p-3.5 text-left hover:bg-slate-50 transition-colors"
      >
        <span className="text-base flex-shrink-0 mt-0.5">{icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-slate-400 font-mono">{num}.</span>
            <span className="text-sm font-semibold text-slate-800">{title}</span>
            {field.trovato ? (
              <span className="text-xs text-emerald-600 font-medium">✓ trovato</span>
            ) : (
              <span className="text-xs text-slate-400">— non rilevato</span>
            )}
          </div>
          {field.trovato && field.valore && (
            <p className="text-xs text-slate-600 mt-0.5 truncate">{field.valore}</p>
          )}
        </div>
        <svg
          className={`w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Expanded body */}
      {open && (
        <div className="border-t border-slate-100 p-3.5 space-y-3">
          {!field.trovato ? (
            <p className="text-xs text-slate-400 italic">
              Informazione non presente nel testo della perizia.
            </p>
          ) : (
            <>
              {/* Cosa dice */}
              {field.cosa_dice && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
                    Cosa dice la perizia
                  </p>
                  <p className="text-sm text-slate-700 leading-relaxed">{field.cosa_dice}</p>
                </div>
              )}

              {/* Cosa significa */}
              {field.cosa_significa && (
                <div className="bg-blue-50 border border-blue-100 rounded-lg p-3">
                  <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-1">
                    Cosa significa per te
                  </p>
                  <p className="text-sm text-blue-800 leading-relaxed">{field.cosa_significa}</p>
                </div>
              )}

              {/* Estratto + pagina */}
              {(field.estratto || field.pagina_rif) && (
                <div className="bg-slate-50 border border-slate-100 rounded-lg p-2.5">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">
                    Fonte
                  </p>
                  {field.pagina_rif && (
                    <p className="text-xs text-slate-500 font-medium mb-0.5">📄 {field.pagina_rif}</p>
                  )}
                  {field.estratto && (
                    <p className="text-xs text-slate-600 italic">"{field.estratto}"</p>
                  )}
                </div>
              )}

              {/* Confidenza */}
              <div className="flex items-center justify-end">
                <ConfidenzaBadge c={field.confidenza} />
              </div>
            </>
          )}

          {/* Glossario */}
          {glossario && (
            <div className="bg-amber-50 border border-amber-100 rounded-lg p-2.5">
              <p className="text-xs text-amber-700">
                <span className="font-semibold">Glossario: </span>{glossario}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export default function ResocontoSection({ resoconto }: { resoconto: ResocontoCompleto }) {
  const [allOpen, setAllOpen] = useState(false);

  const foundCount = SECTIONS.filter(s => resoconto[s.key]?.trovato).length;
  const topRischi = [...(resoconto.rischi ?? [])].sort((a, b) => {
    const order = { Alta: 0, Media: 1, Bassa: 2 };
    return order[a.severita] - order[b.severita];
  }).slice(0, 5);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-slate-900">Resoconto completo</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            {foundCount}/{SECTIONS.length} sezioni trovate
          </p>
        </div>
        <button
          onClick={() => setAllOpen(v => !v)}
          className="text-xs text-blue-600 hover:text-blue-800 font-medium px-2.5 py-1.5 rounded-lg border border-blue-200 hover:border-blue-300 transition-colors"
        >
          {allOpen ? 'Comprimi tutto' : 'Espandi tutto'}
        </button>
      </div>

      {/* Rischi top — show at top for visibility */}
      {topRischi.length > 0 && (
        <div className="border border-red-200 bg-red-50 rounded-xl p-4 space-y-3">
          <p className="text-xs font-bold text-red-700 uppercase tracking-wide">
            ⚠ Rischi principali ({topRischi.length})
          </p>
          {topRischi.map((r, i) => (
            <div key={i} className="bg-white border border-red-100 rounded-lg p-3 space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <SeveritaBadge s={r.severita} />
                <p className="text-sm font-semibold text-slate-800">{r.descrizione}</p>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">{r.cosa_significa}</p>
            </div>
          ))}
        </div>
      )}

      {/* Sections accordion */}
      <div className="space-y-2">
        {SECTIONS.map(s => {
          const field = resoconto[s.key];
          if (!field) return null;
          return (
            <SectionRow
              key={s.key}
              num={s.num}
              title={s.title}
              icon={s.icon}
              glossario={s.glossario}
              field={field}
            />
          );
        })}
      </div>

      {/* Checklist */}
      {(resoconto.checklist ?? []).length > 0 && (
        <div className="border border-slate-200 bg-white rounded-xl p-4 space-y-3">
          <p className="text-xs font-bold text-slate-700 uppercase tracking-wide">
            12. Checklist — da verificare prima di offrire
          </p>
          <ul className="space-y-1.5">
            {resoconto.checklist.map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-slate-100 text-slate-500 text-xs font-bold flex items-center justify-center mt-0.5 leading-none">
                  {i + 1}
                </span>
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
