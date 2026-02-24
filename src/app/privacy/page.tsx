import Link from 'next/link';
import PublicHeader from '@/components/PublicHeader';

export const metadata = {
  title: 'Privacy Policy – Perizia Analyzer',
  description: 'Informativa sul trattamento dei dati personali di Perizia Analyzer.',
};

const SECTIONS = [
  {
    title: '1. Dati raccolti',
    content: [
      "Perizia Analyzer raccoglie i dati strettamente necessari al funzionamento del servizio. Al momento della registrazione vengono acquisiti: nome, indirizzo email e password (conservata in forma cifrata).",
      "I documenti PDF caricati per l'analisi vengono trasmessi ai server solo per il tempo necessario all'elaborazione e non vengono conservati permanentemente. Lo storico delle analisi è salvato localmente nel browser dell'utente (localStorage) e non su server centralizzati.",
    ],
  },
  {
    title: '2. Finalità del trattamento',
    content: [
      "I dati personali vengono trattati esclusivamente per: (a) erogare il servizio di analisi delle perizie immobiliari; (b) gestire l'account dell'utente; (c) inviare comunicazioni di servizio quando necessario; (d) migliorare le funzionalità del prodotto in forma aggregata e anonimizzata.",
      "Non utilizziamo i dati per profilazione a fini pubblicitari né li cediamo a terze parti per scopi commerciali.",
    ],
  },
  {
    title: '3. Conservazione dei dati',
    content: [
      "I dati dell'account vengono conservati per tutta la durata del rapporto contrattuale e per un periodo massimo di 12 mesi dalla chiusura dell'account, salvo obblighi di legge diversi.",
      "I PDF caricati per l'analisi vengono eliminati dai server entro 24 ore dall'elaborazione. Lo storico delle analisi locale (nel browser) è sotto il pieno controllo dell'utente, che può eliminarlo in qualsiasi momento dalla sezione Account.",
    ],
  },
  {
    title: '4. Sicurezza',
    content: [
      "Adottiamo misure tecniche e organizzative adeguate per proteggere i dati personali contro accessi non autorizzati, perdita accidentale o distruzione. Tutte le comunicazioni tra il browser dell'utente e i nostri server avvengono su connessione cifrata TLS.",
      "L'accesso ai dati è limitato al personale strettamente necessario e soggetto a obblighi di riservatezza.",
    ],
  },
  {
    title: "5. Diritti dell'utente",
    content: [
      "In qualità di interessato, hai il diritto di: accedere ai tuoi dati personali; richiedere la rettifica di dati inesatti; richiedere la cancellazione dei dati (diritto all'oblio); opporti al trattamento; richiedere la portabilità dei dati; proporre reclamo all'autorità di controllo competente (Garante per la protezione dei dati personali — www.garanteprivacy.it).",
      "Per esercitare questi diritti, scrivi a privacy@perizia-analyzer.app indicando la tua richiesta. Risponderemo entro 30 giorni.",
    ],
  },
  {
    title: '6. Contatto GDPR',
    content: [
      "Per qualsiasi questione relativa al trattamento dei tuoi dati personali o per esercitare i tuoi diritti, contattaci all'indirizzo: privacy@perizia-analyzer.app.",
      "La presente informativa è soggetta ad aggiornamenti periodici. Le modifiche sostanziali saranno comunicate agli utenti registrati via email prima dell'entrata in vigore.",
    ],
  },
];

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-white">
      <PublicHeader />

      <div className="pt-14">

        {/* Header */}
        <section className="py-16 px-6 border-b border-slate-100">
          <div className="max-w-3xl mx-auto">
            <p className="text-xs font-semibold text-blue-700 uppercase tracking-widest mb-4">Documenti legali</p>
            <h1 className="text-4xl font-bold text-slate-900 mb-4 tracking-tight">Privacy Policy</h1>
            <p className="text-slate-500 text-sm">
              Ultimo aggiornamento: gennaio 2025 · Versione 1.0
            </p>
          </div>
        </section>

        {/* Content */}
        <section className="py-16 px-6">
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
              <h3 className="font-semibold text-slate-900 mb-2">Hai domande sulla tua privacy?</h3>
              <p className="text-sm text-slate-500 mb-4">
                Scrivici per qualsiasi domanda sul trattamento dei tuoi dati personali.
              </p>
              <a
                href="mailto:privacy@perizia-analyzer.app"
                className="inline-flex items-center gap-2 text-sm font-medium text-blue-700 hover:text-blue-800 transition-colors"
              >
                privacy@perizia-analyzer.app
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </a>
            </div>

            {/* Navigation */}
            <div className="mt-8 flex flex-wrap gap-4 text-sm">
              <Link href="/terms" className="text-blue-700 hover:underline font-medium">
                Termini di servizio →
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
