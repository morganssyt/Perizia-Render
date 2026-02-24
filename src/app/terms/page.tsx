import Link from 'next/link';
import PublicHeader from '@/components/PublicHeader';

export const metadata = {
  title: 'Termini di Servizio – Perizia Analyzer',
  description: 'Termini e condizioni di utilizzo del servizio Perizia Analyzer.',
};

const SECTIONS = [
  {
    title: '1. Uso consentito',
    content: [
      "Perizia Analyzer è un servizio destinato all'analisi automatizzata di perizie di stima immobiliare prodotte nell'ambito di procedure di asta giudiziaria italiana. L'utilizzo è consentito esclusivamente per scopi leciti, professionali o personali, nel rispetto della normativa vigente.",
      "È vietato: caricare documenti di cui non si ha diritto di trattamento; utilizzare il servizio per scopi fraudolenti o illegali; tentare di accedere a sistemi non autorizzati; effettuare reverse engineering del software.",
    ],
  },
  {
    title: '2. Limitazione di responsabilità',
    content: [
      "Perizia Analyzer è uno strumento di supporto alla decisione basato su intelligenza artificiale. I risultati delle analisi sono generati automaticamente e possono contenere errori, omissioni o imprecisioni.",
      "Il servizio non fornisce consulenza legale, finanziaria o tecnica. Perizia Analyzer non è responsabile per decisioni prese dagli utenti sulla base delle analisi prodotte, né per eventuali perdite economiche derivanti dall'utilizzo del servizio.",
    ],
  },
  {
    title: "3. Accuratezza dell'analisi AI",
    content: [
      "Le analisi sono prodotte da modelli di intelligenza artificiale e non sostituiscono la valutazione di un professionista qualificato (avvocato, geometra, perito, consulente finanziario).",
      "Prima di partecipare a un'asta immobiliare, si raccomanda di verificare i risultati dell'analisi con un professionista abilitato. Perizia Analyzer non garantisce l'accuratezza, la completezza o l'aggiornamento delle informazioni estratte.",
    ],
  },
  {
    title: '4. Pagamenti e abbonamenti',
    content: [
      "Il piano Free include 1 analisi gratuita senza necessità di carta di credito. I piani a pagamento (Pro, Studio) sono soggetti a fatturazione mensile o annuale secondo le tariffe pubblicate nella pagina Pricing.",
      "Il pagamento avviene anticipatamente. In caso di mancato rinnovo, l'account torna automaticamente al piano Free. I rimborsi sono valutati caso per caso entro 14 giorni dall'acquisto.",
    ],
  },
  {
    title: '5. Recesso',
    content: [
      "L'utente può disdire il proprio abbonamento in qualsiasi momento dalla sezione Account. La cancellazione è efficace al termine del periodo di fatturazione già pagato.",
      "L'utente può eliminare il proprio account in qualsiasi momento. A seguito della cancellazione, i dati personali saranno rimossi secondo quanto previsto dalla Privacy Policy.",
    ],
  },
  {
    title: '6. Legge applicabile',
    content: [
      "I presenti Termini sono regolati dalla legge italiana. Per qualsiasi controversia derivante dall'utilizzo del servizio, è competente il foro del luogo di residenza dell'utente consumatore, o il Foro di Milano per le controversie tra professionisti.",
      "Eventuali controversie saranno risolte preferibilmente in via amichevole. Per reclami, scrivi a supporto@perizia-analyzer.app.",
    ],
  },
];

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-white">
      <PublicHeader />

      <div className="pt-14">

        {/* Header */}
        <section className="py-16 px-6 border-b border-slate-100">
          <div className="max-w-3xl mx-auto">
            <p className="text-xs font-semibold text-blue-700 uppercase tracking-widest mb-4">Documenti legali</p>
            <h1 className="text-4xl font-bold text-slate-900 mb-4 tracking-tight">Termini di Servizio</h1>
            <p className="text-slate-500 text-sm">
              Ultimo aggiornamento: gennaio 2025 · Versione 1.0
            </p>
          </div>
        </section>

        {/* Intro */}
        <section className="pt-12 px-6">
          <div className="max-w-3xl mx-auto">
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 mb-12">
              <p className="text-sm text-amber-800 leading-relaxed">
                <strong>Importante:</strong> leggere attentamente questi termini prima di utilizzare il servizio.
                Accedendo a Perizia Analyzer, l&apos;utente accetta integralmente le condizioni riportate di seguito.
              </p>
            </div>
          </div>
        </section>

        {/* Content */}
        <section className="pb-16 px-6">
          <div className="max-w-3xl mx-auto">

            <div className="space-y-12">
              {SECTIONS.map((section) => (
                <div key={section.title}>
                  <h2 className="text-base font-bold text-slate-900 mb-4 pb-3 border-b border-slate-100">
                    {section.title}
                  </h2>
                  <div className="space-y-3">
                    {section.content.map((para, i) => (
                      <p key={i} className="text-slate-600 text-sm leading-relaxed">
                        {para}
                      </p>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Contact box */}
            <div className="mt-16 bg-slate-50 border border-slate-100 rounded-2xl p-8">
              <h3 className="font-semibold text-slate-900 mb-2">Domande sui termini?</h3>
              <p className="text-sm text-slate-500 mb-4">
                Per chiarimenti sui termini di servizio o per segnalare un problema, contattaci.
              </p>
              <a
                href="mailto:supporto@perizia-analyzer.app"
                className="inline-flex items-center gap-2 text-sm font-medium text-blue-700 hover:text-blue-800 transition-colors"
              >
                supporto@perizia-analyzer.app
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </a>
            </div>

            {/* Navigation */}
            <div className="mt-8 flex flex-wrap gap-4 text-sm">
              <Link href="/privacy" className="text-blue-700 hover:underline font-medium">
                Privacy Policy →
              </Link>
              <Link href="/contact" className="text-slate-500 hover:text-slate-700 transition-colors">
                Contattaci
              </Link>
            </div>

          </div>
        </section>

      </div>
    </div>
  );
}
