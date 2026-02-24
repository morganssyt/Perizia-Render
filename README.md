# Perizia Analyzer

Analizzatore automatico di perizie immobiliari italiane (PVP / Aste giudiziarie).
Carica un PDF e ottieni: estrazione delle 4 voci chiave, riassunto operativo, checklist di verifica, export.

## Le 4 Voci Estratte

| Voce | Cosa cerca |
|------|-----------|
| **Atti Antecedenti** | Provenienza, trascrizioni, iscrizioni, ipoteche, pignoramenti, servitù |
| **Costi / Oneri** | Spese condominiali, arretrati (ultimi 2 anni), imposte, regolarizzazione |
| **Difformità / Abusi** | Non conformità urbanistiche, catastali, edilizie, impiantistiche |
| **Valore del Perito** | Valore di stima, prezzo base, valore di mercato |

## Funzionalità

- **PDF Viewer integrato** (react-pdf): rendering pagine, zoom, navigazione, go-to-page da citazioni
- **Estrazione automatica** delle 4 voci con confidence scoring e citazioni dal PDF
- **Riassunto operativo** in 3 paragrafi (deterministico, opzionale LLM)
- **Verifica persistente**: toggle verificato, edit valore, switch candidati, badge stato
- **Export**: JSON strutturato, CSV flat, HTML "Scheda Asta" stampabile
- **Scan detection**: riconoscimento PDF scansionati con warning OCR
- **Dashboard documenti**: stato processing/ready/error con progress bar

## Stack Tecnico

| Componente | Scelta | Motivazione |
|-----------|--------|-------------|
| Framework | **Next.js 14 (App Router)** | Monolith: frontend + API in un progetto |
| Linguaggio | **TypeScript** | Tipizzazione forte per i modelli dati |
| Styling | **Tailwind CSS** | Velocità di sviluppo, utility-first |
| PDF Viewer | **react-pdf (pdfjs-dist)** | Rendering client-side, text layer, zoom |
| PDF Parsing | **pdf-parse** | Wrapper pdfjs server-side, mapping per pagina |
| LLM | **OpenAI GPT-4o-mini** (opzionale) | Riassunti. Fallback deterministico senza API key |
| Database | **SQLite + Prisma** | Zero config, ideale per MVP |
| Test | **Vitest** | Veloce, compatibile con TypeScript |

## Setup

```bash
# 1. Installa dipendenze
npm install

# 2. Configura environment
cp .env.example .env
# OPENAI_API_KEY è opzionale — senza, usa riassunto deterministico

# 3. Inizializza database
npx prisma db push

# 4. Avvia in sviluppo
npm run dev

# App disponibile su http://localhost:3000
```

## Comandi

```bash
npm run dev       # Avvia dev server
npm run build     # Build produzione
npm run test      # Esegui test (39 test in 5 file)
npm run db:push   # Aggiorna schema DB
npm run db:studio # Apri Prisma Studio (GUI DB)
```

## Flusso End-to-End

1. **Upload PDF** → drag-drop o click sulla dashboard
2. **Processing** → progress bar in tempo reale
3. **Viewer 2 colonne** → PDF a sinistra, risultati a destra
4. **Estrazione** → 4 voci con confidence, citazioni, candidati alternativi
5. **Riassunto** → 3 paragrafi operativi con checklist
6. **Verifica** → toggle verificato, edit valore, switch candidato, badge stato
7. **Export** → JSON / CSV / HTML "Scheda Asta"

## Struttura Progetto

```
src/
├── app/                    # Next.js App Router
│   ├── page.tsx           # Dashboard principale
│   ├── document/[id]/     # Viewer perizia (2 colonne)
│   └── api/
│       ├── upload/        # POST upload PDF
│       ├── documents/     # GET lista documenti
│       └── documents/[id]/
│           ├── route.ts   # GET dettaglio documento
│           ├── pdf/       # GET streaming PDF
│           ├── review/    # PUT salva revisione
│           └── export/    # GET json/csv/html
├── lib/
│   ├── pdf-parser.ts      # Estrazione testo + scan detection
│   ├── pipeline.ts        # Orchestrazione: parse → extract → summary → save
│   ├── summary.ts         # Riassunto deterministico 3 paragrafi
│   ├── extraction/        # Estrattori heuristics + regex
│   │   ├── keywords.ts    # Dizionario keyword italiano
│   │   ├── section-finder.ts
│   │   ├── amount-extractor.ts
│   │   ├── date-extractor.ts
│   │   ├── field-extractors.ts
│   │   └── confidence.ts
│   ├── llm/               # Provider LLM astratto
│   └── export.ts          # Generazione JSON/CSV/HTML
├── components/            # Componenti React (client)
│   ├── PdfViewer.tsx      # Viewer PDF con react-pdf
│   ├── ExtractionPanel.tsx
│   ├── ReviewChecklist.tsx # Verifica con edit + candidate switch
│   └── ...
└── types/index.ts         # Modelli dati TypeScript
```

## Pipeline di Estrazione

1. **Parsing PDF** → Testo per pagina con ricostruzione spazi/posizioni
2. **Scan detection** → textCoverage, avgCharsPerPage, warning OCR
3. **Heuristics** → Dizionario keyword italiano + regex per sezioni candidate
4. **Estrazione** → Estrattori per voce (importi, date, severità, categorie)
5. **Confidenza** → Scoring: match keyword, contesto titolo, densità, candidati
6. **Riassunto** → Deterministico (sempre) + LLM (se API key presente)
7. **Salvataggio** → Risultati + log in SQLite via Prisma

## Test

```bash
npm test
# ✓ tests/amount-extractor.test.ts  (12 tests)
# ✓ tests/date-extractor.test.ts    (5 tests)
# ✓ tests/extraction.test.ts        (6 tests)
# ✓ tests/field-extractors.test.ts  (14 tests)
# ✓ tests/summary.test.ts           (2 tests)
# Total: 39 passed
```

## Known Limitations

- **OCR non incluso**: PDF scansionati (immagini) vengono rilevati ma non processati. Necessario Tesseract.js o cloud OCR per supporto futuro.
- **Tabelle**: Il parser non ha un estrattore specializzato per tabelle. Costi in tabelle potrebbero non essere catturati.
- **Keyword-based**: L'estrazione è basata su keyword italiane. PDF con terminologia molto diversa potrebbero avere confidence bassa.
- **LLM opzionale**: Senza OPENAI_API_KEY, i riassunti sono deterministici (funzionali ma meno fluidi).
- **Single-user**: Nessuna autenticazione. Pensato per uso locale/dev.
- **Job queue in-memory**: Progress perso al riavvio server. Per produzione: usare Redis + Bull.

## Variabili d'Ambiente

```env
DATABASE_URL=file:./prisma/dev.db    # SQLite (default)
OPENAI_API_KEY=sk-...                # Opzionale per riassunti LLM
MAX_FILE_SIZE_MB=50                  # Limite upload (default 50MB)
UPLOAD_DIR=./uploads                 # Cartella upload
```
