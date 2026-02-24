import PublicHeader from '@/components/PublicHeader';
import Link from 'next/link';

export const metadata = {
  title: 'Contatti – Perizia Analyzer',
  description: 'Contatta il team di Perizia Analyzer per supporto, domande o richieste commerciali.',
};

const CONTACTS = [
  {
    label: 'Supporto generale',
    email: 'supporto@perizia-analyzer.app',
    desc: 'Per domande sul servizio, problemi tecnici o richieste di assistenza.',
    icon: 'M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z',
  },
  {
    label: 'Privacy e dati personali',
    email: 'privacy@perizia-analyzer.app',
    desc: 'Per richieste relative al trattamento dei dati personali, esercizio dei diritti GDPR.',
    icon: 'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z',
  },
  {
    label: 'Piani Studio e partnership',
    email: 'business@perizia-analyzer.app',
    desc: 'Per informazioni sui piani aziendali, accordi commerciali e integrazioni API.',
    icon: 'M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
  },
];

export default function ContactPage() {
  return (
    <div className="min-h-screen bg-white">
      <PublicHeader />

      <div className="pt-14">

        {/* Header */}
        <section className="py-16 px-6 border-b border-slate-100">
          <div className="max-w-3xl mx-auto">
            <p className="text-xs font-semibold text-blue-700 uppercase tracking-widest mb-4">Supporto</p>
            <h1 className="text-4xl font-bold text-slate-900 mb-4 tracking-tight">Contattaci</h1>
            <p className="text-lg text-slate-500 leading-relaxed max-w-xl">
              Siamo disponibili per rispondere a domande, raccogliere feedback e supportarti nell&apos;utilizzo della piattaforma.
            </p>
          </div>
        </section>

        {/* Contact cards */}
        <section className="py-16 px-6">
          <div className="max-w-3xl mx-auto">

            <div className="space-y-4 mb-16">
              {CONTACTS.map((c) => (
                <div key={c.label} className="flex gap-5 bg-white border border-slate-100 rounded-2xl p-6 hover:border-slate-200 hover:shadow-sm transition-all">
                  <div className="w-11 h-11 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
                    <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={c.icon} />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-900 mb-1">{c.label}</p>
                    <p className="text-sm text-slate-500 mb-3 leading-relaxed">{c.desc}</p>
                    <a
                      href={`mailto:${c.email}`}
                      className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-700 hover:text-blue-800 transition-colors"
                    >
                      {c.email}
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </a>
                  </div>
                </div>
              ))}
            </div>

            {/* Response time */}
            <div className="bg-slate-50 border border-slate-100 rounded-2xl p-8 mb-8">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <p className="font-semibold text-slate-900 mb-1">Tempi di risposta</p>
                  <p className="text-sm text-slate-500 leading-relaxed">
                    Rispondiamo generalmente entro <strong>24–48 ore lavorative</strong>. Per urgenze tecniche,
                    indica &ldquo;URGENTE&rdquo; nell&apos;oggetto dell&apos;email.
                  </p>
                </div>
              </div>
            </div>

            {/* Links */}
            <div className="flex flex-wrap gap-4 text-sm">
              <Link href="/privacy" className="text-blue-700 hover:underline font-medium">
                Privacy Policy →
              </Link>
              <Link href="/terms" className="text-slate-500 hover:text-slate-700 transition-colors">
                Termini di servizio
              </Link>
              <Link href="/pricing" className="text-slate-500 hover:text-slate-700 transition-colors">
                Pricing
              </Link>
            </div>

          </div>
        </section>

      </div>
    </div>
  );
}
