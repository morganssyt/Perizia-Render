'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import PublicHeader from '@/components/PublicHeader';

// ─── Product mockup ────────────────────────────────────────────────────────────

function ProductMockup() {
  return (
    <div className="relative mx-auto max-w-2xl">
      <div className="rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-200 overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100 bg-slate-50">
          <div className="flex gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-slate-200" />
            <div className="w-2.5 h-2.5 rounded-full bg-slate-200" />
            <div className="w-2.5 h-2.5 rounded-full bg-slate-200" />
          </div>
          <div className="flex-1 mx-3 bg-white border border-slate-200 rounded-md px-3 py-1 text-xs text-slate-400 truncate">
            perizia-analyzer.app/app/analyze
          </div>
        </div>
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 bg-blue-700 rounded-md" />
            <span className="text-xs font-semibold text-slate-700">Perizia Analyzer</span>
          </div>
          <div className="flex gap-3 text-xs text-slate-400">
            <span>Dashboard</span>
            <span className="text-blue-700 font-medium">Analizza</span>
            <span>Pricing</span>
          </div>
        </div>
        <div className="p-5 grid grid-cols-2 gap-4">
          <div className="space-y-3">
            <div className="border border-blue-200 bg-blue-50 rounded-xl p-3 flex items-center gap-2.5">
              <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586l5.414 5.414V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium text-slate-700 truncate">perizia_asta_2024.pdf</p>
                <p className="text-xs text-slate-400">4.2 MB · PDF caricato</p>
              </div>
            </div>
            <div className="border border-green-200 bg-green-50 rounded-xl p-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-semibold text-slate-600">Esito generale</span>
                <span className="text-xs font-bold text-green-700 bg-green-100 px-2 py-0.5 rounded-full">Verde</span>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">Perizia regolare. Nessuna difformità critica.</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: 'Valore Perito', value: '€ 320.000', color: 'text-slate-900' },
                { label: 'Costi e Oneri', value: 'Trovati', color: 'text-amber-600' },
                { label: 'Atti Prec.', value: 'Nessuno', color: 'text-green-600' },
                { label: 'Difformità', value: 'Nessuna', color: 'text-green-600' },
              ].map((item) => (
                <div key={item.label} className="bg-slate-50 rounded-lg p-2.5 border border-slate-100">
                  <p className="text-xs text-slate-400 mb-0.5">{item.label}</p>
                  <p className={`text-sm font-semibold ${item.color}`}>{item.value}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-3">
              <p className="text-xs font-semibold text-blue-700 mb-2">Riassunto Operativo</p>
              <div className="space-y-2">
                {[
                  'Appartamento stimato €320.000, libero da ipoteche rilevanti.',
                  'Presenza di oneri condominiali arretrati da verificare.',
                  "Procedere con verifica catastale prima dell'offerta.",
                ].map((text, i) => (
                  <div key={i} className="flex gap-2">
                    <span className="flex-shrink-0 w-4 h-4 rounded-full bg-blue-200 text-blue-800 text-xs font-bold flex items-center justify-center">{i + 1}</span>
                    <p className="text-xs text-slate-600 leading-snug">{text}</p>
                  </div>
                ))}
              </div>
            </div>
            <button className="w-full bg-blue-700 text-white text-xs font-medium py-2 rounded-lg">
              Esporta report →
            </button>
          </div>
        </div>
      </div>
      <div className="absolute inset-0 -z-10 blur-3xl opacity-20 bg-blue-400 rounded-full scale-75 translate-y-8" />
    </div>
  );
}

// ─── Public landing ────────────────────────────────────────────────────────────

function PublicLanding() {
  return (
    <div className="bg-white">
      <PublicHeader />

      {/* Hero */}
      <section className="pt-32 pb-24 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <div className="inline-flex items-center gap-2 bg-blue-50 text-blue-700 text-xs font-semibold px-3 py-1.5 rounded-full mb-6 border border-blue-100">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
              Analisi AI in tempo reale
            </div>
            <h1 className="text-5xl font-bold text-slate-900 leading-tight tracking-tight mb-6">
              Analizza perizie immobiliari
              <br />
              <span className="text-blue-700">in modo intelligente.</span>
            </h1>
            <p className="text-xl text-slate-500 leading-relaxed mb-10">
              Estrai automaticamente valore stimato, difformità urbanistiche,
              atti precedenti e rischi nascosti in pochi secondi.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link href="/signup" className="px-8 py-3.5 bg-blue-700 text-white font-semibold rounded-xl hover:bg-blue-800 transition-colors text-base">
                Prova gratuitamente
              </Link>
              <Link href="/#come-funziona" className="px-8 py-3.5 bg-white text-slate-700 font-medium rounded-xl hover:bg-slate-50 transition-colors text-base border border-slate-200">
                Guarda come funziona
              </Link>
            </div>
            <p className="text-xs text-slate-400 mt-4">Nessuna carta di credito. 1 analisi gratuita.</p>
          </div>
          <ProductMockup />
        </div>
      </section>

      {/* Come funziona */}
      <section id="come-funziona" className="py-24 px-6 bg-slate-50 border-y border-slate-100">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-xs font-semibold text-blue-700 uppercase tracking-widest mb-3">Come funziona</p>
            <h2 className="text-3xl font-bold text-slate-900 mb-3">Tre passaggi. Risultato immediato.</h2>
            <p className="text-slate-500">Dalla perizia grezza alla decisione informata in meno di un minuto.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-10">
            {[
              {
                step: '01',
                title: 'Carica la perizia',
                desc: 'Scarica il PDF dal portale aste (PVP, Aste Giudiziarie). Trascinalo nella piattaforma o selezionalo dal tuo computer.',
              },
              {
                step: '02',
                title: 'Analisi AI strutturata',
                desc: "Il sistema legge l'intero documento ed estrae in modo strutturato: valore stimato, difformità, atti precedenti, oneri e rischi.",
              },
              {
                step: '03',
                title: 'Ottieni risk score e riepilogo',
                desc: 'Ricevi un report con esito semaforo (Verde / Giallo / Rosso), dati chiave ed export per le tue decisioni di investimento.',
              },
            ].map((item) => (
              <div key={item.step} className="relative">
                <div className="text-6xl font-bold text-slate-100 mb-4 select-none leading-none">{item.step}</div>
                <h3 className="text-lg font-semibold text-slate-900 mb-2">{item.title}</h3>
                <p className="text-slate-500 text-sm leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Cosa analizza */}
      <section className="py-24 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-xs font-semibold text-blue-700 uppercase tracking-widest mb-3">Estrazione strutturata</p>
            <h2 className="text-3xl font-bold text-slate-900 mb-3">Cosa analizza il sistema</h2>
            <p className="text-slate-500">I dati che contano, estratti automaticamente da ogni perizia.</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {[
              {
                title: 'Valore di stima',
                desc: "Il valore stimato dall'esperto. Il riferimento fondamentale per valutare la convenienza rispetto alla base d'asta.",
                icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
              },
              {
                title: 'Difformità urbanistiche',
                desc: 'Irregolarità urbanistiche, catastali ed edilizie che possono bloccare la compravendita o richiedere interventi costosi.',
                icon: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z',
              },
              {
                title: 'Atti precedenti',
                desc: "Compravendite, ipoteche e successioni che gravano sull'immobile, estratti automaticamente dal testo della perizia.",
                icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586l5.414 5.414V19a2 2 0 01-2 2z',
              },
              {
                title: 'Oneri e spese',
                desc: "Spese condominiali arretrate, oneri fiscali e altri costi che l'acquirente dovrà sostenere dopo l'aggiudicazione.",
                icon: 'M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z',
              },
              {
                title: 'Indicatori di rischio',
                desc: "Un risk score aggregato basato su tutti i fattori rilevati: difformità, atti critici, oneri e anomalie nel documento.",
                icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
              },
            ].map((item) => (
              <div key={item.title} className="flex gap-4 p-6 rounded-2xl border border-slate-100 hover:border-blue-100 hover:shadow-sm transition-all bg-white">
                <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={item.icon} />
                  </svg>
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900 mb-1.5">{item.title}</h3>
                  <p className="text-sm text-slate-500 leading-relaxed">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Per chi è */}
      <section className="py-24 px-6 bg-slate-50 border-y border-slate-100">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-xs font-semibold text-blue-700 uppercase tracking-widest mb-3">Per chi è</p>
            <h2 className="text-3xl font-bold text-slate-900 mb-3">Progettato per i professionisti del settore</h2>
            <p className="text-slate-500">Chiunque lavori con perizie immobiliari trova un vantaggio immediato.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                title: 'Investitori in aste',
                desc: 'Valuta rapidamente decine di lotti in parallelo. Individua opportunità e rischi senza perdere ore su ogni PDF.',
                icon: 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6',
              },
              {
                title: 'Studi tecnici',
                desc: "Geometri, architetti e ingegneri che supportano clienti nelle procedure d'asta e necessitano di una prima analisi strutturata e verificabile.",
                icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4',
              },
              {
                title: 'Agenti immobiliari',
                desc: "Offri ai tuoi clienti un'analisi professionale della perizia prima dell'offerta. Differenziati con un servizio di valore aggiunto.",
                icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6',
              },
            ].map((item) => (
              <div key={item.title} className="bg-white rounded-2xl border border-slate-200 p-7 hover:shadow-sm transition-shadow">
                <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center mb-5">
                  <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={item.icon} />
                  </svg>
                </div>
                <h3 className="font-semibold text-slate-900 mb-2">{item.title}</h3>
                <p className="text-sm text-slate-500 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Sicurezza */}
      <section className="py-24 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-xs font-semibold text-blue-700 uppercase tracking-widest mb-3">Sicurezza e Privacy</p>
            <h2 className="text-3xl font-bold text-slate-900 mb-3">I tuoi documenti sono al sicuro</h2>
            <p className="text-slate-500">Tecnologia enterprise per proteggere i dati sensibili dei tuoi clienti.</p>
          </div>
          <div className="grid sm:grid-cols-2 gap-5">
            {[
              {
                title: 'Analisi AI avanzata',
                desc: 'Estrazione testuale ad alta precisione con modelli linguistici di ultima generazione per documenti tecnico-legali.',
                icon: 'M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18',
              },
              {
                title: 'Archiviazione sicura',
                desc: 'I tuoi dati rimangono sul tuo browser. Nessuna copia dei PDF sui nostri server oltre il tempo necessario all\'analisi.',
                icon: 'M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z',
              },
              {
                title: 'Crittografia end-to-end',
                desc: 'Tutte le comunicazioni avvengono su connessioni cifrate TLS. I tuoi documenti non sono mai trasmessi in chiaro.',
                icon: 'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z',
              },
              {
                title: 'Eliminazione su richiesta',
                desc: 'Hai il pieno controllo sui tuoi dati. Puoi eliminare lo storico delle analisi in qualsiasi momento dalla sezione Account.',
                icon: 'M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16',
              },
            ].map((item) => (
              <div key={item.title} className="flex gap-4 p-6 rounded-2xl border border-slate-100 bg-white hover:border-slate-200 transition-colors">
                <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={item.icon} />
                  </svg>
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900 mb-1.5">{item.title}</h3>
                  <p className="text-sm text-slate-500 leading-relaxed">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing teaser */}
      <section className="py-24 px-6 bg-slate-50 border-y border-slate-100">
        <div className="max-w-3xl mx-auto text-center">
          <p className="text-xs font-semibold text-blue-700 uppercase tracking-widest mb-3">Prezzi</p>
          <h2 className="text-3xl font-bold text-slate-900 mb-3">Semplice. Trasparente.</h2>
          <p className="text-slate-500 mb-12">Inizia gratis. Passa a Pro quando sei pronto.</p>
          <div className="grid sm:grid-cols-3 gap-4 mb-10">
            {[
              { name: 'Free', price: '0', note: 'Per iniziare', highlight: false },
              { name: 'Pro', price: '29', note: 'al mese', highlight: true },
              { name: 'Studio', price: '79', note: 'al mese', highlight: false },
            ].map((plan) => (
              <div key={plan.name} className={`rounded-2xl p-6 text-center ${plan.highlight ? 'bg-blue-700 shadow-lg shadow-blue-200' : 'bg-white border border-slate-200'}`}>
                <p className={`text-xs font-semibold uppercase tracking-wide mb-2 ${plan.highlight ? 'text-blue-200' : 'text-slate-400'}`}>{plan.name}</p>
                <div className="flex items-end justify-center gap-1 mb-1">
                  <span className={`text-3xl font-bold ${plan.highlight ? 'text-white' : 'text-slate-900'}`}>€{plan.price}</span>
                  {plan.price !== '0' && <span className={`text-sm mb-1 ${plan.highlight ? 'text-blue-200' : 'text-slate-400'}`}>/mese</span>}
                </div>
                <p className={`text-xs ${plan.highlight ? 'text-blue-200' : 'text-slate-400'}`}>{plan.note}</p>
              </div>
            ))}
          </div>
          <Link href="/pricing" className="inline-flex items-center gap-2 text-sm font-medium text-blue-700 hover:text-blue-800 transition-colors">
            Vedi tutti i dettagli e funzionalità
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
          </Link>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-24 px-6">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-xs font-semibold text-blue-700 uppercase tracking-widest mb-3">FAQ</p>
            <h2 className="text-3xl font-bold text-slate-900 mb-3">Domande frequenti</h2>
          </div>
          <div className="space-y-4">
            {[
              {
                q: "Come funziona l'analisi?",
                a: "Carichi il PDF della perizia d'asta. Il sistema estrae il testo e lo analizza con modelli AI avanzati, identificando automaticamente valore stimato, difformità, atti precedenti e oneri.",
              },
              {
                q: "I miei documenti sono al sicuro?",
                a: "Sì. I PDF vengono elaborati in modo sicuro e non vengono conservati sui nostri server. Lo storico delle analisi rimane nel tuo browser in locale.",
              },
              {
                q: "Posso analizzare qualsiasi tipo di perizia?",
                a: "Il sistema è ottimizzato per le perizie di stima prodotte dai tribunali italiani per le aste giudiziarie. Funziona meglio con documenti testuali (non scansioni a bassa qualità).",
              },
              {
                q: "L'analisi AI sostituisce un consulente?",
                a: "No. Perizia Analyzer è uno strumento di supporto alla decisione. I risultati sono basati su AI e possono contenere errori. Prima di partecipare a un'asta, consulta sempre un professionista qualificato.",
              },
              {
                q: "Posso esportare i risultati?",
                a: "Sì. Il report può essere esportato in formato PDF, CSV e JSON. Utile per documentare le tue analisi o condividerle con consulenti.",
              },
              {
                q: "Come funziona il piano Free?",
                a: "Il piano Free include 1 analisi completa, senza carta di credito. Puoi valutare lo strumento su una perizia reale prima di scegliere un piano a pagamento.",
              },
            ].map((item, i) => (
              <details key={i} className="group bg-white border border-slate-100 rounded-2xl overflow-hidden hover:border-slate-200 transition-colors">
                <summary className="flex items-center justify-between px-6 py-5 cursor-pointer list-none">
                  <span className="font-medium text-slate-900 text-sm">{item.q}</span>
                  <svg className="w-4 h-4 text-slate-400 group-open:rotate-180 transition-transform flex-shrink-0 ml-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </summary>
                <div className="px-6 pb-5 text-sm text-slate-500 leading-relaxed border-t border-slate-50 pt-4">
                  {item.a}
                </div>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* CTA finale */}
      <section className="py-28 px-6 bg-slate-50 border-t border-slate-100">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-4xl font-bold text-slate-900 mb-4 tracking-tight">
            Inizia con la tua prima perizia.
          </h2>
          <p className="text-lg text-slate-500 mb-10">
            Nessuna registrazione obbligatoria. Nessuna carta di credito.
            <br />
            Una perizia gratuita per valutare il software.
          </p>
          <Link href="/signup" className="inline-flex items-center gap-2 px-10 py-4 bg-blue-700 text-white text-base font-semibold rounded-xl hover:bg-blue-800 transition-colors">
            Analizza la tua prima perizia
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
          </Link>
          <p className="text-xs text-slate-400 mt-4">Già 500+ investitori professionali lo usano ogni settimana.</p>
        </div>
      </section>
    </div>
  );
}

// ─── Root: redirect to /app if authenticated, else show public landing ─────────

export default function RootPage() {
  const router = useRouter();
  const { status } = useSession();

  if (status === 'authenticated') {
    router.replace('/app');
    return <div className="min-h-screen bg-white" />;
  }

  return <PublicLanding />;
}
