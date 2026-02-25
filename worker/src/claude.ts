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
const MAX_TOKENS = 4096;
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
    priority:  z.enum(['alta', 'media', 'bassa']).default('media'),
  })).default([]),
  sintesi_esito: z.enum(['verde', 'giallo', 'rosso']),
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

const EXTRACTION_SYSTEM = `Sei un analista legale specializzato in perizie immobiliari italiane per aste giudiziarie.
Estrai i dati strutturati dal testo della perizia fornito.

IMPORTANTE — IGNORA COMPLETAMENTE QUESTI WATERMARK/INTESTAZIONI (presenti su ogni pagina, non sono contenuto della perizia):
- "Portale delle Vendite Pubbliche" / "Portale Vendite Pubbliche"
- "Pubblicazione Ufficiale" / "Pubblicazione ufficiale"
- "Ministero della Giustizia"
- "ASTE GIUDIZIARIE" / "Aste Giudiziarie"
- "pvp.giustizia.it"
- "Tribunale Ordinario di ..."
- "Decreto Ministeriale"
- Numeri di pagina isolati (es. "1", "2/15")
- Qualsiasi testo ripetuto identico su più pagine che non sia contenuto della perizia

Concentrati ESCLUSIVAMENTE sul contenuto sostanziale della perizia: descrizione immobile, valori, catasto, difformità, oneri, stato di possesso, ecc.

REGOLA CRITICA: Se il testo contiene ANCHE SOLO UN dato reale della perizia (indirizzo, valore, particella catastale, superficie, stato manutentivo, ecc.), estrai tutto ciò che puoi trovare. NON dichiarare "solo watermark" o "documento non leggibile" se esiste qualsiasi dato reale. Se i dati sono parziali, usa confidence bassa (0.4) e status "found".

Restituisci SOLO JSON valido (nessun markdown, nessuna spiegazione):

{
  "valore_perito": { "status": "found"|"not_found", "value": "€ 250.000,00"|null, "confidence": 0-1 },
  "atti_antecedenti": { "status": "found"|"not_found", "summary": "<testo>"|null, "confidence": 0-1 },
  "costi_oneri": { "status": "found"|"not_found", "summary": "<testo>"|null, "confidence": 0-1 },
  "difformita": { "status": "found"|"not_found", "summary": "<testo>"|null, "confidence": 0-1 },
  "riassunto": { "paragrafo1": "...", "paragrafo2": "...", "paragrafo3": "..." }
}

Regole:
- confidence: 1.0=chiaro, 0.7=parziale, 0.4=incerto/dedotto
- se not_found → value/summary=null
- valore_perito.value formato: "€ 250.000,00"
- riassunto: 3 paragrafi professionali in italiano — descrivi l'immobile, il valore e i rischi reali trovati nel documento. Se alcune sezioni mancano, indicalo nel riassunto spiegando cosa manca (non il motivo "watermark")
- Non menzionare mai "watermark" o "intestazioni" nel riassunto — quelli sono artefatti tecnici già filtrati`;

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

  const extraction = await parseWithRetry(raw1, ExtractionSchema, repairExtraction) as unknown as ExtractionResult;
  console.log(`[claude] Step 1 done: valore_perito=${extraction.valore_perito.status}`);

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
      priority: c.priority ?? 'media',
    })),
    sintesi_esito:   reasoningRaw.sintesi_esito,
  };
  console.log(`[claude] Step 2 done: risk_score=${reasoning.risk_score} esito=${reasoning.sintesi_esito}`);

  return { extraction, reasoning };
}
