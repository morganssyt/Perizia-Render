'use client';

import { useState } from 'react';

interface Step {
  key: string;
  step: number;
  label: string;
  tooltip: string;
  icon: string;
}

const STEPS: Step[] = [
  {
    key: 'valore_perito',
    step: 1,
    label: 'Controlla il Valore del Perito',
    tooltip:
      'Il valore stimato dal perito è la base per valutare la convenienza dell\'asta. Confrontalo con i prezzi di mercato della zona e con la base d\'asta.',
    icon: '💰',
  },
  {
    key: 'difformita',
    step: 2,
    label: 'Controlla le Difformità',
    tooltip:
      'Irregolarità urbanistiche o catastali possono richiedere costosi interventi di regolarizzazione prima di poter vendere o ristrutturare l\'immobile.',
    icon: '⚠️',
  },
  {
    key: 'costi_oneri',
    step: 3,
    label: 'Controlla i Costi e Oneri',
    tooltip:
      'Spese condominiali arretrate, ipoteche, tasse e oneri fiscali sono generalmente a carico dell\'acquirente dopo l\'aggiudicazione dell\'asta.',
    icon: '📋',
  },
  {
    key: 'atti_antecedenti',
    step: 4,
    label: 'Controlla gli Atti Antecedenti',
    tooltip:
      'Compravendite, ipoteche, successioni e trascrizioni precedenti possono indicare vincoli, diritti di terzi o problemi di provenienza sull\'immobile.',
    icon: '📜',
  },
];

interface Props {
  verified: Record<string, boolean>;
  onToggle: (key: string, value: boolean) => void;
}

export default function VerifyWorkflow({ verified, onToggle }: Props) {
  const [open, setOpen] = useState(false);
  const [tooltip, setTooltip] = useState<string | null>(null);

  const completedCount = STEPS.filter((s) => verified[s.key]).length;
  const allDone = completedCount === STEPS.length;

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-visible">
      {/* Toggle header */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors rounded-xl"
      >
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <span className="text-sm font-semibold text-gray-800">Checklist di Verifica</span>
          <span
            className={`text-xs px-2 py-0.5 rounded-full font-medium ${
              allDone ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
            }`}
          >
            {completedCount}/{STEPS.length}
          </span>
          {allDone && (
            <span className="text-xs text-green-600 font-medium">— Verifica completata!</span>
          )}
        </div>
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="px-4 pb-4 border-t border-gray-100 pt-3 space-y-1.5">
          <p className="text-xs text-gray-400 mb-3">
            Segna ogni voce come verificata dopo aver controllato i dati estratti.
          </p>
          {STEPS.map((step) => (
            <div
              key={step.key}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                verified[step.key] ? 'bg-green-50' : 'hover:bg-gray-50'
              }`}
            >
              {/* Step number */}
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-500">
                {step.step}
              </div>

              {/* Label + tooltip */}
              <div className="flex-1 flex items-center gap-1.5 min-w-0">
                <span className="text-sm text-gray-700">{step.label}</span>
                <div className="relative flex-shrink-0">
                  <button
                    onMouseEnter={() => setTooltip(step.key)}
                    onMouseLeave={() => setTooltip(null)}
                    onFocus={() => setTooltip(step.key)}
                    onBlur={() => setTooltip(null)}
                    className="text-gray-400 hover:text-gray-600 focus:outline-none"
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
                  {tooltip === step.key && (
                    <div className="absolute left-5 bottom-0 z-20 w-64 bg-gray-800 text-white text-xs rounded-lg px-3 py-2 leading-relaxed shadow-xl pointer-events-none">
                      {step.icon} {step.tooltip}
                    </div>
                  )}
                </div>
              </div>

              {/* Checkbox */}
              <input
                type="checkbox"
                checked={!!verified[step.key]}
                onChange={(e) => onToggle(step.key, e.target.checked)}
                className="w-4 h-4 rounded accent-green-500 flex-shrink-0 cursor-pointer"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
