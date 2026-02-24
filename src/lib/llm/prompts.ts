/**
 * Prompt templates for LLM normalization and summary generation.
 */

export const NORMALIZE_PROMPT = `Sei un esperto di perizie immobiliari italiane. Ti viene fornito un estratto grezzo di testo da una perizia.
Devi normalizzare e strutturare le informazioni estratte per il campo "{fieldType}".

Regole:
- Rispondi SOLO con JSON valido, senza spiegazioni aggiuntive.
- Mantieni i termini tecnici italiani.
- Se un'informazione non è chiara, indica "Non chiaramente indicato".
- Estrai tutti gli elementi rilevanti dal testo.

Testo estratto:
{rawText}

Rispondi con un JSON strutturato secondo il tipo di campo richiesto.`;

export const SUMMARY_PROMPT = `Sei un consulente esperto di aste immobiliari. Genera 3 paragrafi di riassunto operativo basandoti sui dati estratti dalla perizia.

DATI ESTRATTI:
{fieldsJson}

TESTO COMPLETO (primi 5000 caratteri):
{fullTextPreview}

Genera ESATTAMENTE 3 paragrafi in italiano, separati da "---":

1) "Quadro del bene & stima" — Descrivi il bene (cosa è, dove si trova, stato di occupazione se emerge), e il valore del perito con eventuali note. Sii conciso ma completo.

2) "Rischi / difformità & costi" — Elenca le difformità principali e i costi/oneri rilevanti. Evidenzia in particolare arretrati e riferimenti agli "ultimi 2 anni" se presenti. Indica la gravità.

3) "Atti antecedenti & azioni consigliate" — Cosa controllare subito (atti, vincoli, iscrizioni pregiudizievoli) e checklist operativa per chi vuole partecipare all'asta.

Rispondi SOLO con i 3 paragrafi separati da "---". Ogni paragrafo deve essere 3-5 frasi, chiaro e operativo.`;

export function buildNormalizePrompt(fieldType: string, rawText: string): string {
  return NORMALIZE_PROMPT
    .replace('{fieldType}', fieldType)
    .replace('{rawText}', rawText.slice(0, 4000));
}

export function buildSummaryPrompt(fieldsJson: string, fullText: string): string {
  return SUMMARY_PROMPT
    .replace('{fieldsJson}', fieldsJson.slice(0, 6000))
    .replace('{fullTextPreview}', fullText.slice(0, 5000));
}
