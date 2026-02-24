// ──────────────────────────────────────────────
// Core domain types for Perizia Analyzer
// ──────────────────────────────────────────────

/** Citation pointing to a specific location in the PDF */
export interface Citation {
  page: number;
  snippet: string; // 1-3 sentences from the PDF
  offset?: number; // character offset in page text (legacy)
  startOffset?: number;
  endOffset?: number;
}

/** A candidate extraction with confidence scoring */
export interface Candidate<T = string> {
  value: T;
  normalized?: string;
  confidence: number; // 0–1
  reason: string; // why this was selected (keyword match, pattern, structure)
  citations: Citation[];
}

/** Per-page text content from PDF */
export interface PageText {
  page: number;
  text: string;
}

/** Full parsed PDF result */
export interface ParsedPdf {
  pages: PageText[];
  totalPages: number;
  metadata: Record<string, string>;
}

// ── A) Atti Antecedenti ──

export interface AntecedentAct {
  tipoAtto: string; // tipo atto (compravendita, donazione, successione, ecc.)
  data?: string; // data se presente
  notaRegistro?: string; // nota/registro/trascrizione
  soggetti?: string[]; // soggetti coinvolti
  sintesi: string; // sintesi breve
  confidence: number;
  reason: string;
  citations: Citation[];
  candidates: Candidate[];
}

// ── B) Costi di Legge / Oneri ──

export interface LegalCost {
  descrizione: string;
  importo?: number; // importo numerico
  importoRaw?: string; // stringa originale (es: "€ 12.345,67")
  periodo?: string; // periodo/riferimento
  chiPaga?: string; // chi paga
  note?: string;
  ultimiDueAnni: boolean; // se riferito a "ultimi 2 anni"
  confidence: number;
  reason: string;
  citations: Citation[];
  candidates: Candidate[];
}

// ── C) Difformità / Abusi ──

export type Severity = 'bassa' | 'media' | 'alta';

export interface Irregularity {
  categoria: string; // urbanistica, catastale, edilizia, impiantistica, agibilità
  descrizione: string;
  gravita: Severity;
  impatto: string; // regolarizzabile? necessita opere?
  costiEventuali?: number;
  costiRaw?: string;
  stimaPresente: boolean;
  confidence: number;
  reason: string;
  citations: Citation[];
  candidates: Candidate[];
}

// ── D) Valore del Perito ──

export interface ExpertValue {
  valore?: number;
  valoreRaw?: string;
  valuta: string; // default "EUR"
  range?: { min: number; max: number };
  tipo: string; // "valore di stima" | "base d'asta" | "valore di mercato"
  dataContesto?: string; // data o capitolo
  confidence: number;
  reason: string;
  citations: Citation[];
  candidates: Candidate<number>[];
}

// ── Extraction Result ──

export interface ExtractionFields {
  antecedentActs: AntecedentAct[];
  legalCosts: LegalCost[];
  irregularities: Irregularity[];
  expertValue: ExpertValue;
}

export interface OperativeSummary {
  summaryAsset: string; // "Quadro del bene & stima"
  summaryRisks: string; // "Rischi / difformità & costi"
  summaryActions: string; // "Atti antecedenti & azioni consigliate"
}

export interface FullExtractionResult extends ExtractionFields, OperativeSummary {}

// ── Review State ──

export interface ReviewItem {
  fieldKey: 'antecedentActs' | 'legalCosts' | 'irregularities' | 'expertValue';
  itemIndex: number;
  verified: boolean;
  userEdit?: string;
  notes?: string;
  reviewer?: string;
}

// ── Document ──

export type DocumentStatus = 'pending' | 'processing' | 'completed' | 'error';

export interface DocumentInfo {
  id: string;
  filename: string;
  uploadedAt: string;
  pages: number;
  status: DocumentStatus;
  errorMessage?: string;
}

export interface DocumentWithResults extends DocumentInfo {
  extraction?: FullExtractionResult;
  reviews?: ReviewItem[];
}

// ── API types ──

export interface UploadResponse {
  id: string;
  filename: string;
  status: DocumentStatus;
}

export interface ExportFormat {
  type: 'json' | 'csv' | 'html';
}

// ── Section candidate for extraction pipeline ──

export interface SectionCandidate {
  text: string;
  page: number;
  startOffset: number;
  endOffset: number;
  matchedKeywords: string[];
  isTitle: boolean; // matched in a title/heading
  score: number; // relevance score
}

// ── LLM Provider interface ──

export interface LLMProvider {
  normalize(field: string, rawText: string, fieldType: string): Promise<string>;
  generateSummary(fields: ExtractionFields, fullText: string): Promise<OperativeSummary>;
}

// ── Debug Info (stored in DB, exposed in API) ──

export interface KeywordMatchInfo {
  field: string;
  sectionsFound: number;
  matchedKeywords: string[];
  sampleText: string; // first 300 chars of best section
}

export interface PerPageStat {
  page: number;
  chars: number;
  hasText: boolean;
  firstWords: string; // first 80 chars
}

export interface DebugInfo {
  textCoverage: number;        // 0–1: fraction of pages with text
  avgCharsPerPage: number;
  totalPages: number;
  pagesWithText: number;
  totalChars: number;
  firstWords: string;          // first 500 chars of full extracted text
  isProbablyScan: boolean;
  scanReason: string;
  keywordMatches: KeywordMatchInfo[];
  perPage: PerPageStat[];
  extractionWarnings: string[]; // e.g. "No amounts found in expertValue section"
}
