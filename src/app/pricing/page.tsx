import Link from 'next/link';
import PublicHeader from '@/components/PublicHeader';

const PLANS = [
  {
    name: 'Free',
    price: '0',
    period: null,
    tagline: 'Per valutare lo strumento',
    cta: 'Inizia gratis',
    href: '/signup',
    highlight: false,
    features: [
      '1 analisi inclusa',
      'Tutti i campi estratti',
      'Esito semaforo (Verde / Giallo / Rosso)',
      'Export JSON e CSV',
      'Accesso al report base',
    ],
    missing: [
      'Analisi illimitate',
      'Storico analisi',
      'Export PDF senza watermark',
      'Supporto prioritario',
    ],
  },
  {
    name: 'Pro',
    price: '29',
    period: 'mese',
    tagline: 'Per investitori attivi',
    cta: 'Attiva Pro',
    href: '/signup',
    highlight: true,
    badge: 'Più scelto',
    features: [
      'Analisi illimitate',
      'Tutti i campi estratti',
      'Esito semaforo (Verde / Giallo / Rosso)',
      'Export JSON, CSV e HTML',
      'Report PDF senza watermark',
      'Storico analisi completo',
      'Supporto prioritario via email',
    ],
    missing: [],
  },
  {
    name: 'Studio',
    price: '79',
    period: 'mese',
    tagline: 'Per professionisti e studi',
    cta: 'Contattaci',
    href: '/about#contatti',
    highlight: false,
    features: [
      'Tutto di Pro',
      'Fino a 5 utenti',
      'Branding report personalizzato',
      'Dashboard condivisa',
      'Supporto dedicato',
      'Onboarding guidato',
    ],
    missing: [],
  },
];

function CheckIcon({ inverted }: { inverted?: boolean }) {
  return (
    <svg
      className={`w-4 h-4 flex-shrink-0 ${inverted ? 'text-blue-300' : 'text-blue-700'}`}
      fill="none" viewBox="0 0 24 24" stroke="currentColor"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg className="w-4 h-4 text-slate-300 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

const FAQ = [
  {
    q: "Cosa succede quando esaurisco l'analisi gratuita?",
    a: 'Puoi passare al piano Pro in qualsiasi momento. I tuoi dati e lo storico rimangono invariati.',
  },
  {
    q: 'I dati della perizia vengono salvati?',
    a: "I PDF vengono elaborati in tempo reale e non vengono conservati sui nostri server dopo l'elaborazione. Le analisi rimangono nel tuo browser.",
  },
  {
    q: 'Posso annullare in qualsiasi momento?',
    a: 'Sì. Il piano Pro è mensile, senza vincoli. Puoi disdire quando vuoi dalla pagina Account.',
  },
  {
    q: 'Il piano Studio include più utenti?',
    a: 'Sì, fino a 5 utenti con accesso alla dashboard condivisa e report con branding personalizzato.',
  },
];

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-white">
      <PublicHeader />

      <div className="pt-14">

        {/* Header */}
        <section className="py-20 px-6 text-center">
          <div className="inline-flex items-center gap-2 bg-blue-50 text-blue-700 text-xs font-semibold px-3 py-1.5 rounded-full mb-6 border border-blue-100">
            Pricing trasparente
          </div>
          <h1 className="text-4xl font-bold text-slate-900 mb-4 tracking-tight">
            Scegli il piano giusto
          </h1>
          <p className="text-lg text-slate-500 max-w-xl mx-auto">
            Inizia gratis. Scala quando sei pronto.
            <br />
            Nessun contratto. Nessun costo nascosto.
          </p>
        </section>

        {/* Plans */}
        <section className="px-6 pb-20 max-w-5xl mx-auto">
          <div className="grid md:grid-cols-3 gap-5">
            {PLANS.map((plan) => (
              <div
                key={plan.name}
                className={`relative rounded-2xl flex flex-col p-8 ${
                  plan.highlight
                    ? 'bg-blue-700 text-white shadow-2xl shadow-blue-200 ring-1 ring-blue-600'
                    : 'bg-white border border-slate-200'
                }`}
              >
                {/* Badge */}
                {'badge' in plan && plan.badge && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="bg-blue-900 text-white text-xs font-semibold px-3 py-1 rounded-full">
                      {plan.badge}
                    </span>
                  </div>
                )}

                {/* Plan header */}
                <div className="mb-8">
                  <p className={`text-xs font-semibold uppercase tracking-widest mb-3 ${plan.highlight ? 'text-blue-200' : 'text-slate-400'}`}>
                    {plan.name}
                  </p>
                  <div className="flex items-end gap-1 mb-2">
                    <span className={`text-5xl font-bold tracking-tight ${plan.highlight ? 'text-white' : 'text-slate-900'}`}>
                      €{plan.price}
                    </span>
                    {plan.period && (
                      <span className={`text-sm mb-1.5 ${plan.highlight ? 'text-blue-200' : 'text-slate-400'}`}>
                        /{plan.period}
                      </span>
                    )}
                  </div>
                  <p className={`text-sm ${plan.highlight ? 'text-blue-200' : 'text-slate-500'}`}>
                    {plan.tagline}
                  </p>
                </div>

                {/* Features */}
                <ul className="space-y-3 flex-1 mb-8">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5">
                      <CheckIcon inverted={plan.highlight} />
                      <span className={`text-sm leading-snug ${plan.highlight ? 'text-white' : 'text-slate-700'}`}>{f}</span>
                    </li>
                  ))}
                  {plan.missing.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 opacity-40">
                      <XIcon />
                      <span className="text-sm text-slate-400">{f}</span>
                    </li>
                  ))}
                </ul>

                {/* CTA */}
                <Link
                  href={plan.href}
                  className={`w-full py-3.5 rounded-xl text-sm font-semibold text-center transition-colors ${
                    plan.highlight
                      ? 'bg-white text-blue-700 hover:bg-blue-50'
                      : 'bg-slate-900 text-white hover:bg-slate-800'
                  }`}
                >
                  {plan.cta}
                </Link>
              </div>
            ))}
          </div>

          {/* Trust note */}
          <p className="text-center text-sm text-slate-400 mt-10">
            IVA esclusa · Prezzi in EUR · Annulla quando vuoi
          </p>
        </section>

        {/* FAQ */}
        <section className="px-6 pb-24 max-w-2xl mx-auto">
          <div className="border-t border-slate-100 pt-16">
            <h2 className="text-xl font-bold text-slate-900 mb-10 text-center">Domande frequenti</h2>
            <div className="space-y-8">
              {FAQ.map((item) => (
                <div key={item.q}>
                  <p className="font-semibold text-slate-900 mb-2">{item.q}</p>
                  <p className="text-sm text-slate-500 leading-relaxed">{item.a}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

      </div>
    </div>
  );
}


