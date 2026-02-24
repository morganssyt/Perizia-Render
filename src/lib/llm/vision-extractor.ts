import OpenAI from 'openai';
import {
  AntecedentAct,
  LegalCost,
  Irregularity,
  ExpertValue,
  ExtractionFields,
  OperativeSummary,
} from '@/types';

/**
 * Vision-based extraction for image-only PDFs (scanned or watermarked).
 * Sends PDF pages as images to GPT-4o and extracts all 4 fields + summary
 * in a single structured call.
 */
export async function extractWithVision(
  pageImages: string[], // base64 PNG strings
  filename: string
): Promise<ExtractionFields & OperativeSummary> {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const systemPrompt = `Sei un analista esperto di perizie immobiliari italiane per aste giudiziarie (PVP/SITI Tribunali).
Ricevi le pagine di una perizia come immagini.
Devi estrarre le 4 voci chiave e generare 3 riassunti operativi.
Rispondi SOLO con un oggetto JSON valido, senza testo extra.`;

  const userPrompt = `Analizza questa perizia immobiliare (${filename}) ed estrai:

**Voce A - Atti Antecedenti** (provenienza del bene, titoli di acquisto, ipoteche, iscrizioni, trascrizioni pregiudizievoli):
**Voce B - Costi di Legge / Oneri** (oneri a carico dell'aggiudicatario, arretrati condominiali/tributi, spese liberazione):
**Voce C - Difformità / Abusi** (stato legittimo, difformità urbanistiche/catastali, abusi edilizi, conformità impianti):
**Voce D - Valore del Perito** (valore di stima, prezzo base d'asta, valore di mercato):

Rispondi SOLO con questo JSON (tutte le stringhe in italiano):
{
  "antecedentActs": [
    {
      "tipoAtto": "tipo atto",
      "data": "data opzionale",
      "sintesi": "sintesi dettagliata",
      "pageRef": numero_pagina
    }
  ],
  "legalCosts": [
    {
      "descrizione": "descrizione onere",
      "importoRaw": "es: € 1.234,56 o null",
      "ultimiDueAnni": true/false,
      "pageRef": numero_pagina
    }
  ],
  "irregularities": [
    {
      "categoria": "urbanistica|catastale|edilizia|impiantistica|agibilità",
      "descrizione": "descrizione difformità",
      "gravita": "bassa|media|alta",
      "impatto": "Regolarizzabile/Necessita opere/Non sanabile/Da verificare",
      "costiRaw": "costo eventuale o null",
      "pageRef": numero_pagina
    }
  ],
  "expertValue": {
    "valoreRaw": "es: € 250.000,00",
    "tipo": "valore di stima|prezzo base|base d'asta|valore di mercato",
    "pageRef": numero_pagina
  },
  "summaryAsset": "Paragrafo 1: quadro sintetico del bene (localizzazione, tipologia, stato, stima)",
  "summaryRisks": "Paragrafo 2: rischi principali (difformità, costi, problemi)",
  "summaryActions": "Paragrafo 3: atti antecedenti e azioni consigliate prima dell'acquisto"
}

Se una voce non è presente nel documento, usa array vuoto [] o null per i campi opzionali.`;

  // Build the message with all page images
  const imageContent: OpenAI.Chat.ChatCompletionContentPart[] = pageImages.map(
    (b64, i) => ({
      type: 'image_url' as const,
      image_url: {
        url: `data:image/png;base64,${b64}`,
        detail: 'auto' as const,
      },
    })
  );

  const response = await client.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: [
          { type: 'text', text: userPrompt },
          ...imageContent,
        ],
      },
    ],
    temperature: 0.1,
    max_tokens: 4000,
    response_format: { type: 'json_object' },
  });

  const content = response.choices[0]?.message?.content || '{}';

  let raw: any;
  try {
    raw = JSON.parse(content);
  } catch {
    throw new Error(`Vision API returned invalid JSON: ${content.slice(0, 200)}`);
  }

  // Map vision output to the app's type structure
  const antecedentActs: AntecedentAct[] = (raw.antecedentActs || []).map((a: any) => ({
    tipoAtto: a.tipoAtto || 'Atto generico',
    data: a.data || undefined,
    sintesi: a.sintesi || '',
    confidence: 0.8,
    reason: 'Estratto da visione pagine PDF',
    citations: a.pageRef ? [{ page: a.pageRef, snippet: a.sintesi?.slice(0, 200) || '' }] : [],
    candidates: [],
  }));

  const legalCosts: LegalCost[] = (raw.legalCosts || []).map((c: any) => {
    const importoRaw: string | undefined = c.importoRaw || undefined;
    let importo: number | undefined;
    if (importoRaw) {
      const cleaned = importoRaw.replace(/[€\s]/g, '').replace(/\./g, '').replace(',', '.');
      const parsed = parseFloat(cleaned);
      if (!isNaN(parsed)) importo = parsed;
    }
    return {
      descrizione: c.descrizione || '',
      importo,
      importoRaw,
      ultimiDueAnni: !!c.ultimiDueAnni,
      confidence: 0.8,
      reason: 'Estratto da visione pagine PDF',
      citations: c.pageRef ? [{ page: c.pageRef, snippet: c.descrizione?.slice(0, 200) || '' }] : [],
      candidates: [],
    };
  });

  const irregularities: Irregularity[] = (raw.irregularities || []).map((irr: any) => ({
    categoria: irr.categoria || 'generica',
    descrizione: irr.descrizione || '',
    gravita: ['bassa', 'media', 'alta'].includes(irr.gravita) ? irr.gravita : 'media',
    impatto: irr.impatto || 'Da verificare',
    costiRaw: irr.costiRaw || undefined,
    stimaPresente: !!irr.costiRaw,
    confidence: 0.8,
    reason: 'Estratto da visione pagine PDF',
    citations: irr.pageRef ? [{ page: irr.pageRef, snippet: irr.descrizione?.slice(0, 200) || '' }] : [],
    candidates: [],
  }));

  const evRaw = raw.expertValue || {};
  const valoreRaw: string | undefined = evRaw.valoreRaw || undefined;
  let valore: number | undefined;
  if (valoreRaw) {
    const cleaned = valoreRaw.replace(/[€\s]/g, '').replace(/\./g, '').replace(',', '.');
    const parsed = parseFloat(cleaned);
    if (!isNaN(parsed)) valore = parsed;
  }
  const expertValue: ExpertValue = {
    valore,
    valoreRaw,
    valuta: 'EUR',
    tipo: evRaw.tipo || 'valore di stima',
    confidence: valore ? 0.85 : 0.5,
    reason: 'Estratto da visione pagine PDF',
    citations: evRaw.pageRef ? [{ page: evRaw.pageRef, snippet: valoreRaw || '' }] : [],
    candidates: [],
  };

  return {
    antecedentActs: antecedentActs.length > 0 ? antecedentActs : [{
      tipoAtto: 'Non rilevato',
      sintesi: 'Nessun atto antecedente individuato dalla visione del documento.',
      confidence: 0.3,
      reason: 'Nessun dato estratto dalla visione',
      citations: [],
      candidates: [],
    }],
    legalCosts: legalCosts.length > 0 ? legalCosts : [{
      descrizione: 'Non rilevato',
      ultimiDueAnni: false,
      confidence: 0.3,
      reason: 'Nessun costo/onere individuato dalla visione del documento.',
      citations: [],
      candidates: [],
    }],
    irregularities: irregularities.length > 0 ? irregularities : [{
      categoria: 'Non rilevato',
      descrizione: 'Nessuna difformità individuata dalla visione del documento.',
      gravita: 'media',
      impatto: 'Da verificare',
      stimaPresente: false,
      confidence: 0.3,
      reason: 'Nessun dato estratto dalla visione',
      citations: [],
      candidates: [],
    }],
    expertValue,
    summaryAsset: raw.summaryAsset || 'Riassunto non generato.',
    summaryRisks: raw.summaryRisks || 'Riassunto non generato.',
    summaryActions: raw.summaryActions || 'Riassunto non generato.',
  };
}
