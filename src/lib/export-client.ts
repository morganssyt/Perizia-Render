import type { AnalysisResult } from '@/app/api/analyze/route';

export interface ExportOptions {
  result: AnalysisResult;
  fileName: string;
  notes: Record<string, string>;
  verified: Record<string, boolean>;
  analyzedAt: string;
}

const FIELD_LABELS: Record<string, string> = {
  valore_perito: 'Valore del Perito',
  atti_antecedenti: 'Atti Antecedenti',
  costi_oneri: 'Costi e Oneri',
  difformita: 'Difformità e Abusi',
};

const FIELD_KEYS = ['valore_perito', 'atti_antecedenti', 'costi_oneri', 'difformita'] as const;

type FieldKey = (typeof FIELD_KEYS)[number];

function getField(result: AnalysisResult, key: FieldKey) {
  return result[key] as {
    status: string;
    value?: string | null;
    summary?: string | null;
    confidence: number;
  };
}

function getFieldText(result: AnalysisResult, key: FieldKey): string {
  const f = getField(result, key);
  return f?.value ?? f?.summary ?? '—';
}

function getFieldStatus(result: AnalysisResult, key: FieldKey): string {
  const f = getField(result, key);
  if (f?.status === 'found') return 'Trovato';
  if (f?.status === 'scan_detected') return 'Scansione';
  return 'Non trovato';
}

function getFieldConfidence(result: AnalysisResult, key: FieldKey): string {
  const f = getField(result, key);
  return `${Math.round((f?.confidence ?? 0) * 100)}%`;
}

// ── JSON export ──────────────────────────────────────────────────────────────

export function exportAsJSON(opts: ExportOptions): void {
  const payload = {
    fileName: opts.fileName,
    analyzedAt: opts.analyzedAt,
    result: opts.result,
    userNotes: opts.notes,
    userVerified: opts.verified,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json',
  });
  downloadBlob(blob, `perizia_${sanitizeFileName(opts.fileName)}.json`);
}

// ── CSV export ───────────────────────────────────────────────────────────────

export function exportAsCSV(opts: ExportOptions): void {
  const headers = [
    'Campo',
    'Stato',
    'Confidenza',
    'Valore/Riassunto',
    'Note utente',
    'Verificato',
  ];

  const rows = FIELD_KEYS.map((key) => [
    FIELD_LABELS[key] ?? key,
    getFieldStatus(opts.result, key),
    getFieldConfidence(opts.result, key),
    csvEscape(getFieldText(opts.result, key)),
    csvEscape(opts.notes[key] ?? ''),
    opts.verified[key] ? 'Sì' : 'No',
  ]);

  // Add summary rows
  rows.push(['Riassunto - Par. 1', '', '', csvEscape(opts.result.riassunto.paragrafo1), '', '']);
  rows.push(['Riassunto - Par. 2', '', '', csvEscape(opts.result.riassunto.paragrafo2), '', '']);
  rows.push(['Riassunto - Par. 3', '', '', csvEscape(opts.result.riassunto.paragrafo3), '', '']);

  const csv = [
    `# Perizia Analyzer — ${opts.fileName} — ${opts.analyzedAt}`,
    headers.join(';'),
    ...rows.map((r) => r.join(';')),
  ].join('\n');

  // BOM for Excel UTF-8 compatibility
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  downloadBlob(blob, `perizia_${sanitizeFileName(opts.fileName)}.csv`);
}

// ── Plain text (for copy / WhatsApp / email) ─────────────────────────────────

export function exportAsText(opts: ExportOptions): string {
  const lines: string[] = [
    `PERIZIA ANALYZER`,
    `File: ${opts.fileName}`,
    `Analisi del: ${opts.analyzedAt}`,
    `${'─'.repeat(50)}`,
    '',
  ];

  for (const key of FIELD_KEYS) {
    const label = FIELD_LABELS[key];
    const status = getFieldStatus(opts.result, key);
    const conf = getFieldConfidence(opts.result, key);
    const text = getFieldText(opts.result, key);
    const note = opts.notes[key];
    const verified = opts.verified[key];

    lines.push(`▸ ${label.toUpperCase()}`);
    lines.push(`  Stato: ${status}  |  Confidenza: ${conf}${verified ? '  ✅ Verificato' : ''}`);
    if (text && text !== '—') {
      lines.push(`  ${text}`);
    }
    if (note) {
      lines.push(`  📝 Note: ${note}`);
    }
    lines.push('');
  }

  lines.push(`${'─'.repeat(50)}`);
  lines.push('RIASSUNTO OPERATIVO');
  lines.push('');
  lines.push(`1. ${opts.result.riassunto.paragrafo1}`);
  lines.push('');
  lines.push(`2. ${opts.result.riassunto.paragrafo2}`);
  lines.push('');
  lines.push(`3. ${opts.result.riassunto.paragrafo3}`);

  return lines.join('\n');
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function csvEscape(value: string): string {
  if (value.includes(';') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function sanitizeFileName(name: string): string {
  return name.replace(/\.pdf$/i, '').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 60);
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
