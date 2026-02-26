/**
 * Claude Haiku 2-step extraction for perizia immobiliare.
 *
 * Step 1: Extraction JSON (valore perito, difformità, costi/oneri, atti precedenti, sintesi esito)
 * Step 2: Reasoning JSON (risk score, max bid scenari, checklist)
 *
 * Zod validation + retry repair max 2.
 */

import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';

const MODEL    = 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 8192;
const MAX_TEXT_CHARS = 80_000;

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY env var not set');
    _client = new Anthropic({ apiKey: apiKey.trim(), timeout: 90_000 });
  }
  return _client;
}

// ── Zod schemas ──────────────────────────────────────────────────────────────

const ResocontoFieldZW = z.object({
  trovato:             z.boolean().default(false),
  valore:              z.string().nullable().default(null),
  cosa_dice:           z.string().nullable().default(null),
  cosa_significa:      z.string().nullable().default(null),
  estratto:            z.string().nullable().default(null),
  pagina_rif:          z.string().nullable().default(null),
  confidenza:          z.enum(['Alta', 'Media', 'Bassa']).default('Media'),
  azioni_consigliate:  z.string().nullable().optional(),
});

const ExtractionSchema = z.object({
  valore_perito: z.object({
    status:     z.enum(['found', 'not_found']),
    value:      z.string().nullable(),
    confidence: z.number().min(0).max(1).optional().transform(v => v ?? 0.5),
  }),
  atti_antecedenti: z.object({
    status:     z.enum(['found', 'not_found']),
    summary:    z.string().nullable(),
    confidence: z.number().min(0).max(1).optional().transform(v => v ?? 0.5),
  }),
  costi_oneri: z.object({
    status:     z.enum(['found', 'not_found']),
    summary:    z.string().nullable(),
    confidence: z.number().min(0).max(1).optional().transform(v => v ?? 0.5),
  }),
  difformita: z.object({
    status:     z.enum(['found', 'not_found']),
    summary:    z.string().nullable(),
    confidence: z.number().min(0).max(1).optional().transform(v => v ?? 0.5),
  }),
  riassunto: z.object({
    paragrafo1: z.string(),
    paragrafo2: z.string(),
    paragrafo3: z.string(),
  }),
  resoconto: z.object({
    identificazione:   ResocontoFieldZW,
    dati_catastali:    ResocontoFieldZW,
    superfici:         ResocontoFieldZW,
    titolarita:        ResocontoFieldZW,
    vincoli_ipoteche:  ResocontoFieldZW,
    stato_occupativo:  ResocontoFieldZW,
    conformita:        ResocontoFieldZW,
    stato_manutentivo: ResocontoFieldZW,
    spese_condominio:  ResocontoFieldZW,
    valutazione:       ResocontoFieldZW,
    rischi: z.array(z.object({
      descrizione:         z.string(),
      severita:            z.enum(['Alta', 'Media', 'Bassa']),
      cosa_significa:      z.string(),
      dimensione_impatto:  z.array(z.string()).optional().default([]),
      perche:              z.string().nullable().optional(),
      cosa_fare:           z.string().nullable().optional(),
    })).default([]),
    checklist:          z.array(z.string()).default([]),
    vincoli_dettaglio:  z.array(z.object({
      tipo:           z.string(),
      importo:        z.string().nullable().optional(),
      soggetto:       z.string().nullable().optional(),
      data:           z.string().nullable().optional(),
      severita:       z.enum(['Alta', 'Media', 'Bassa']).nullable().optional(),
      note_operative: z.string().nullable().optional(),
    })).optional().default([]),
  }).optional(),
});

const ReasoningSchema = z.object({
  risk_score: z.number().min(0).max(10),
  max_bid_scenari: z.object({
    conservativo: z.string(),
    base:         z.string(),
    aggressivo:   z.string(),
  }),
  checklist: z.array(z.object({
    item:      z.string(),
    done:      z.boolean().default(false),
    priority:  z.string().transform(v => {
      const l = (v ?? '').toLowerCase();
      if (l === 'alta' || l === 'alta' || l === 'high' || l === 'critica' || l === 'critical') return 'alta';
      if (l === 'bassa' || l === 'low') return 'bassa';
      return 'media';
    }),
  })).default([]),
  sintesi_esito: z.string().transform(v => {
    const l = (v ?? '').toLowerCase();
    if (l === 'rosso' || l === 'red') return 'rosso';
    if (l === 'verde' || l === 'green') return 'verde';
    return 'giallo';
  }),
});

// Normalize reasoning object before Zod validation.
// Claude sometimes returns objects instead of strings for max_bid_scenari fields.
function normalizeReasoning(obj: unknown): unknown {
  if (!obj || typeof obj !== 'object') return obj;
  const o = { ...(obj as Record<string, unknown>) };

  if (o.max_bid_scenari && typeof o.max_bid_scenari === 'object') {
    const s = o.max_bid_scenari as Record<string, unknown>;
    const toStr = (v: unknown) => typeof v === 'string' ? v : v != null ? JSON.stringify(v) : '';
    o.max_bid_scenari = {
      conservativo: toStr(s.conservativo),
      base:         toStr(s.base),
      aggressivo:   toStr(s.aggressivo),
    };
  }

  if (!Array.isArray(o.checklist)) o.checklist = [];

  return o;
}

export interface ExtractionResult {
  valore_perito:    { status: 'found' | 'not_found'; value: string | null; confidence: number };
  atti_antecedenti: { status: 'found' | 'not_found'; summary: string | null; confidence: number };
  costi_oneri:      { status: 'found' | 'not_found'; summary: string | null; confidence: number };
  difformita:       { status: 'found' | 'not_found'; summary: string | null; confidence: number };
  riassunto:        { paragrafo1: string; paragrafo2: string; paragrafo3: string };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  resoconto?:       Record<string, any>;
}
export interface ReasoningResult {
  risk_score:       number;
  max_bid_scenari:  { conservativo: string; base: string; aggressivo: string };
  checklist:        { item: string; done: boolean; priority: 'alta' | 'media' | 'bassa' }[];
  sintesi_esito:    'verde' | 'giallo' | 'rosso';
}

export interface FullAnalysis {
  extraction: ExtractionResult;
  reasoning:  ReasoningResult;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function stripFences(text: string): string {
  return text.trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '');
}

async function callClaude(system: string, user: string): Promise<string> {
  const client = getClient();
  const resp = await client.messages.create({
    model:       MODEL,
    max_tokens:  MAX_TOKENS,
    temperature: 0,
    system,
    messages:    [{ role: 'user', content: user }],
  });
  return resp.content[0]?.type === 'text' ? resp.content[0].text : '';
}

async function parseWithRetry<T>(
  raw: string,
  schema: z.ZodType<T>,
  repairFn: (bad: string) => Promise<string>,
  maxRetries = 2,
  normalize?: (obj: unknown) => unknown,
): Promise<T> {
  let text = stripFences(raw);
  for (let i = 0; i <= maxRetries; i++) {
    try {
      const parsed = JSON.parse(text);
      const obj = normalize ? normalize(parsed) : parsed;
      const result = schema.safeParse(obj);
      if (result.success) return result.data;
      // Zod failed — try repair
      if (i < maxRetries) {
        console.warn(`[claude] Zod validation failed attempt ${i + 1}, repairing...`);
        text = stripFences(await repairFn(text));
        continue;
      }
      throw new Error(`Zod validation failed: ${JSON.stringify(result.error.issues)}`);
    } catch (e) {
      if (i < maxRetries && e instanceof SyntaxError) {
        console.warn(`[claude] JSON parse error attempt ${i + 1}, repairing...`);
        text = stripFences(await repairFn(text));
        continue;
      }
      throw e;
    }
  }
  throw new Error('parseWithRetry: exhausted retries');
}

// ── Step 1: Extraction ────────────────────────────────────────────────────────

const EXTRACTION_SYSTEM = `Sei un analista senior specializzato in perizie immobiliari italiane per aste giudiziarie.
Estrai i dati strutturati dal testo della perizia fornito.

IGNORA WATERMARK: "Portale delle Vendite Pubbliche", "Pubblicazione Ufficiale", "Ministero della Giustizia", "ASTE GIUDIZIARIE", "pvp.giustizia.it", numeri di pagina isolati, testi ripetuti identici su ogni pagina.

REGOLA CRITICA: Se esiste QUALSIASI dato reale (indirizzo, valore, particella, superficie, ecc.) estrai tutto. Usa confidence bassa (0.4) se parziale.

Restituisci SOLO JSON valido (nessun markdown):

{
  "valore_perito": {"status":"found|not_found","value":"€ 250.000,00|null","confidence":0-1},
  "atti_antecedenti": {"status":"found|not_found","summary":"testo|null","confidence":0-1},
  "costi_oneri": {"status":"found|not_found","summary":"testo|null","confidence":0-1},
  "difformita": {"status":"found|not_found","summary":"testo|null","confidence":0-1},
  "riassunto": {"paragrafo1":"immobile e valore","paragrafo2":"rischi e costi","paragrafo3":"atti e azioni"},
  "resoconto": {
    "identificazione":   {"trovato":true|false,"valore":"tipo, indirizzo, comune","cosa_dice":"max 2 frasi","cosa_significa":"max 1 frase","estratto":"max 25 parole verbatim","pagina_rif":"Pagina X","confidenza":"Alta|Media|Bassa","azioni_consigliate":"1 frase pratica"},
    "dati_catastali":    {"trovato":true|false,"valore":"foglio/particella/sub/cat/rendita","cosa_dice":null,"cosa_significa":null,"estratto":"max 25 parole verbatim","pagina_rif":"Pagina X","confidenza":"Alta|Media|Bassa","azioni_consigliate":null},
    "superfici":         {"trovato":true|false,"valore":"comm/catastale/utile mq","cosa_dice":null,"cosa_significa":"discordanze se presenti|null","estratto":null,"pagina_rif":null,"confidenza":"Alta|Media|Bassa","azioni_consigliate":null},
    "titolarita":        {"trovato":true|false,"valore":"intestatario e quota","cosa_dice":"max 1 frase","cosa_significa":"max 1 frase","estratto":null,"pagina_rif":null,"confidenza":"Alta|Media|Bassa","azioni_consigliate":"verifica da fare"},
    "vincoli_ipoteche":  {"trovato":true|false,"valore":"tipo e importo totale vincoli","cosa_dice":"max 2 frasi","cosa_significa":"impatto compratore","estratto":null,"pagina_rif":null,"confidenza":"Alta|Media|Bassa","azioni_consigliate":"azione pre-offerta"},
    "stato_occupativo":  {"trovato":true|false,"valore":"libero/occupato/contratto","cosa_dice":"max 1 frase","cosa_significa":"impatto tempi/costi","estratto":null,"pagina_rif":null,"confidenza":"Alta|Media|Bassa","azioni_consigliate":"contatta custode"},
    "conformita":        {"trovato":true|false,"valore":"conforme/difformità/abusi","cosa_dice":"max 2 frasi","cosa_significa":"rischio pratico","estratto":null,"pagina_rif":null,"confidenza":"Alta|Media|Bassa","azioni_consigliate":"richiedi titoli in Comune"},
    "stato_manutentivo": {"trovato":true|false,"valore":"condizioni/impianti/APE","cosa_dice":"max 1 frase","cosa_significa":"stima costi lavori","estratto":null,"pagina_rif":null,"confidenza":"Alta|Media|Bassa","azioni_consigliate":"sopralluogo con tecnico"},
    "spese_condominio":  {"trovato":true|false,"valore":"spese annue/arretrati importi","cosa_dice":"max 1 frase","cosa_significa":"onere acquirente","estratto":null,"pagina_rif":null,"confidenza":"Alta|Media|Bassa","azioni_consigliate":"richiedi estratto conto"},
    "valutazione":       {"trovato":true|false,"valore":"valore stima/base asta","cosa_dice":"max 2 frasi metodo","cosa_significa":"convenienza","estratto":"max 25 parole verbatim","pagina_rif":"Pagina X","confidenza":"Alta|Media|Bassa","azioni_consigliate":null},
    "rischi": [
      {"descrizione":"rischio breve","severita":"Alta|Media|Bassa","dimensione_impatto":["Legale","Economico","Tecnico","Tempo"],"perche":"1-2 frasi","cosa_fare":"azione concreta","cosa_significa":"1 frase semplice"}
    ],
    "checklist": ["verifica specifica 1","verifica specifica 2"],
    "vincoli_dettaglio": [
      {"tipo":"Ipoteca|Pignoramento|Servitù|Vincolo","importo":"€ 150.000|null","soggetto":"soggetto|null","data":"2015|null","severita":"Alta|Media|Bassa","note_operative":"cosa succede in asta"}
    ]
  }
}

Regole:
- confidence: 1.0=chiaro, 0.7=parziale, 0.4=incerto
- se not_found → value/summary=null; se sezione non trovata → trovato=false, campi null
- rischi: max 6, sorted Alta→Bassa; perche/cosa_fare obbligatori e specifici
- checklist: 8-12 verifiche SPECIFICHE per questa perizia
- vincoli_dettaglio: array vuoto [] se nessun vincolo trovato
- Non menzionare mai "watermark" nei testi`;

// ── Step 2: Reasoning ─────────────────────────────────────────────────────────

const REASONING_SYSTEM = `Sei un consulente immobiliare esperto in aste giudiziarie italiane.
Sulla base dell'analisi estratta, fornisci un ragionamento operativo.

Restituisci SOLO JSON valido:

{
  "risk_score": 0-10,
  "max_bid_scenari": {
    "conservativo": "€ 180.000 (sconto 40%)",
    "base": "€ 200.000 (sconto 37%)",
    "aggressivo": "€ 220.000 (sconto 31%)"
  },
  "checklist": [
    { "item": "Verifica catastale", "done": false, "priority": "alta" },
    ...
  ],
  "sintesi_esito": "verde"|"giallo"|"rosso"
}

risk_score: 0=nessun rischio, 10=rischio massimo
sintesi_esito: verde=procedi, giallo=verifica, rosso=attenzione massima
checklist: 5-8 voci specifiche per questa perizia`;

// ── Main export ───────────────────────────────────────────────────────────────

export async function analyzeWithClaude(pageTexts: string[]): Promise<FullAnalysis> {
  // Build anchored text (--- PAGE N ---)
  let anchoredText = pageTexts
    .map((t, i) => `--- PAGE ${i + 1} ---\n${t}`)
    .join('\n\n');

  if (anchoredText.length > MAX_TEXT_CHARS) {
    anchoredText = anchoredText.slice(0, MAX_TEXT_CHARS);
    console.warn(`[claude] Text truncated to ${MAX_TEXT_CHARS} chars`);
  }

  const userMsg1 = `Analizza questa perizia immobiliare (testo estratto per pagina):\n\n${anchoredText}`;

  // Diagnostic: log a sample of exactly what Claude will receive
  console.log(`[claude] TEXT SENT TO CLAUDE (first 2000 chars):\n${anchoredText.slice(0, 2000)}`);
  console.log(`[claude] TEXT SENT TO CLAUDE (last 1000 chars):\n${anchoredText.slice(-1000)}`);

  // ── Step 1: Extraction ────────────────────────────────────────────────────
  console.log(`[claude] Step 1: extraction promptLen=${userMsg1.length}`);
  const raw1 = await callClaude(EXTRACTION_SYSTEM, userMsg1);

  const repairExtraction = async (bad: string) => {
    const repairPrompt = `Il seguente JSON non è valido. Correggilo e restituisci SOLO il JSON corretto:\n\n${bad}`;
    return callClaude('Sei un assistente JSON. Restituisci SOLO JSON valido.', repairPrompt);
  };

  const extractionRaw = await parseWithRetry(raw1, ExtractionSchema, repairExtraction);
  const extraction: ExtractionResult = {
    valore_perito:    extractionRaw.valore_perito,
    atti_antecedenti: extractionRaw.atti_antecedenti,
    costi_oneri:      extractionRaw.costi_oneri,
    difformita:       extractionRaw.difformita,
    riassunto:        extractionRaw.riassunto,
    resoconto:        extractionRaw.resoconto,
  };
  console.log(`[claude] Step 1 done: valore_perito=${extraction.valore_perito.status} resoconto=${extraction.resoconto ? 'yes' : 'no'}`);

  // ── Step 2: Reasoning ─────────────────────────────────────────────────────
  const userMsg2 = `Sulla base di questa analisi estratta, fornisci ragionamento e scenari:\n\n${JSON.stringify(extraction, null, 2)}`;
  console.log(`[claude] Step 2: reasoning`);
  const raw2 = await callClaude(REASONING_SYSTEM, userMsg2);

  const repairReasoning = async (bad: string) => {
    const repairPrompt = `Il seguente JSON non è valido. Correggilo e restituisci SOLO il JSON corretto:\n\n${bad}`;
    return callClaude('Sei un assistente JSON. Restituisci SOLO JSON valido.', repairPrompt);
  };

  const reasoningRaw = await parseWithRetry(raw2, ReasoningSchema, repairReasoning, 2, normalizeReasoning);
  const reasoning: ReasoningResult = {
    risk_score:      reasoningRaw.risk_score,
    max_bid_scenari: reasoningRaw.max_bid_scenari,
    checklist:       (reasoningRaw.checklist ?? []).map(c => ({
      item:     c.item,
      done:     c.done     ?? false,
      priority: (c.priority ?? 'media') as 'alta' | 'media' | 'bassa',
    })),
    sintesi_esito:   reasoningRaw.sintesi_esito as 'verde' | 'giallo' | 'rosso',
  };
  console.log(`[claude] Step 2 done: risk_score=${reasoning.risk_score} esito=${reasoning.sintesi_esito}`);

  return { extraction, reasoning };
}
