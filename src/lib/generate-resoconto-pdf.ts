/**
 * generate-resoconto-pdf.ts
 * Client-side: generates a professional HTML string for the perizia resoconto,
 * opens it in a new window, and triggers window.print() for PDF export.
 * Zero server-side dependencies — pure browser API.
 */

import type { AnalysisResult, ResocontoCompleto, ResocontoField } from '@/app/api/analyze/route';

// ─────────────────────────────────────────────────────────────────────────────
// Section definitions (same order as ResocontoSection.tsx)
// ─────────────────────────────────────────────────────────────────────────────

interface SectionDef {
  key: keyof Omit<ResocontoCompleto, 'rischi' | 'checklist' | 'vincoli_dettaglio'>;
  num: string;
  title: string;
}

const SECTIONS: SectionDef[] = [
  { key: 'identificazione',   num: '1',  title: 'Identificazione immobile' },
  { key: 'dati_catastali',    num: '2',  title: 'Dati catastali' },
  { key: 'superfici',         num: '3',  title: 'Superfici' },
  { key: 'titolarita',        num: '4',  title: 'Titolarità e quota' },
  { key: 'vincoli_ipoteche',  num: '5',  title: 'Vincoli, ipoteche, servitù' },
  { key: 'stato_occupativo',  num: '6',  title: 'Stato occupativo' },
  { key: 'conformita',        num: '7',  title: 'Conformità urbanistica/edilizia' },
  { key: 'stato_manutentivo', num: '8',  title: 'Stato manutentivo e impianti' },
  { key: 'spese_condominio',  num: '9',  title: 'Spese condominiali e oneri' },
  { key: 'valutazione',       num: '10', title: 'Valutazione e base d\'asta' },
];

// ─────────────────────────────────────────────────────────────────────────────
// HTML helpers
// ─────────────────────────────────────────────────────────────────────────────

function esc(s: string | null | undefined): string {
  if (!s) return '';
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function severitaColor(s: 'Alta' | 'Media' | 'Bassa'): string {
  return s === 'Alta' ? '#dc2626' : s === 'Media' ? '#d97706' : '#2563eb';
}

function confidenzaColor(c: 'Alta' | 'Media' | 'Bassa'): string {
  return c === 'Alta' ? '#059669' : c === 'Media' ? '#d97706' : '#dc2626';
}

function renderSection(s: SectionDef, field: ResocontoField): string {
  const statusColor = field.trovato ? '#059669' : '#94a3b8';
  const statusLabel = field.trovato ? '✓ Trovato' : '— Non rilevato';

  return `
  <div class="section">
    <div class="section-header">
      <span class="section-num">${esc(s.num)}.</span>
      <span class="section-title">${esc(s.title)}</span>
      <span class="section-status" style="color:${statusColor}">${statusLabel}</span>
    </div>
    ${field.trovato ? `
      ${field.valore ? `<div class="field-value">${esc(field.valore)}</div>` : ''}
      ${field.cosa_dice ? `
        <div class="field-block">
          <div class="field-label">Cosa dice la perizia</div>
          <div class="field-text">${esc(field.cosa_dice)}</div>
        </div>` : ''}
      ${field.cosa_significa ? `
        <div class="field-block meaning">
          <div class="field-label">Cosa significa per te</div>
          <div class="field-text">${esc(field.cosa_significa)}</div>
        </div>` : ''}
      ${(field.estratto || field.pagina_rif) ? `
        <div class="field-source">
          ${field.pagina_rif ? `<span class="source-page">📄 ${esc(field.pagina_rif)}</span>` : ''}
          ${field.estratto ? `<span class="source-excerpt">"${esc(field.estratto)}"</span>` : ''}
          <span class="confidence-badge" style="color:${confidenzaColor(field.confidenza)}">Confidenza: ${esc(field.confidenza)}</span>
        </div>` : ''}
    ` : `<div class="not-found">Informazione non presente nel testo della perizia.</div>`}
  </div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main generator
// ─────────────────────────────────────────────────────────────────────────────

export function generateResocontoHtml(
  result: AnalysisResult,
  fileName: string,
): string {
  const r = result.resoconto_completo;
  const now = new Date().toLocaleString('it-IT');
  const qScore = result.debug.data_quality_score ?? 0;
  const pagesAnalyzed = result.meta.pages_analyzed ?? 0;
  const totalPages = result.meta.total_pages ?? 0;
  const requestId = '';

  const topRischi = r ? [...(r.rischi ?? [])].sort((a, b) => {
    const o = { Alta: 0, Media: 1, Bassa: 2 };
    return o[a.severita] - o[b.severita];
  }).slice(0, 5) : [];

  const sectionsHtml = r
    ? SECTIONS.map(s => renderSection(s, r[s.key])).join('\n')
    : '<p style="color:#94a3b8">Resoconto non disponibile.</p>';

  const rischHtml = topRischi.length > 0
    ? topRischi.map(rk => `
      <div class="risk-row">
        <span class="risk-badge" style="color:${severitaColor(rk.severita)};border-color:${severitaColor(rk.severita)}">${esc(rk.severita)}</span>
        <div>
          <div class="risk-desc">${esc(rk.descrizione)}</div>
          <div class="risk-means">${esc(rk.cosa_significa)}</div>
        </div>
      </div>`).join('\n')
    : '<p style="color:#94a3b8">Nessun rischio rilevato.</p>';

  const checklistHtml = r && r.checklist.length > 0
    ? `<ol class="checklist">${r.checklist.map(item => `<li>${esc(item)}</li>`).join('')}</ol>`
    : '<p style="color:#94a3b8">Checklist non disponibile.</p>';

  // Appendice: estratti e fonti
  const appendiceHtml = r
    ? SECTIONS
        .map(s => {
          const f = r[s.key];
          if (!f.trovato || (!f.estratto && !f.pagina_rif)) return '';
          return `<tr>
            <td>${esc(s.num)}. ${esc(s.title)}</td>
            <td>${esc(f.pagina_rif ?? '—')}</td>
            <td class="excerpt">${f.estratto ? `"${esc(f.estratto)}"` : '—'}</td>
            <td>${esc(f.confidenza)}</td>
          </tr>`;
        })
        .filter(Boolean)
        .join('\n')
    : '';

  return `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="utf-8" />
  <title>Resoconto Perizia — ${esc(fileName)}</title>
  <style>
    @page { size: A4; margin: 2cm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 11pt; color: #1e293b; line-height: 1.55; }

    /* Cover */
    .cover { min-height: 100vh; display: flex; flex-direction: column; justify-content: center; padding: 3cm; border-bottom: 3px solid #1e3a5f; page-break-after: always; }
    .cover-badge { display: inline-block; background: #1e3a5f; color: white; font-size: 9pt; padding: 4px 12px; border-radius: 4px; margin-bottom: 16px; }
    .cover h1 { font-size: 26pt; font-weight: 800; color: #0f172a; margin-bottom: 8px; }
    .cover h2 { font-size: 14pt; font-weight: 400; color: #475569; margin-bottom: 24px; }
    .cover-meta { font-size: 9pt; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 12px; }
    .cover-meta p { margin-bottom: 4px; }
    .cover-stats { display: flex; gap: 24px; margin-top: 20px; }
    .stat-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 16px; }
    .stat-label { font-size: 8pt; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; }
    .stat-value { font-size: 16pt; font-weight: 700; color: #0f172a; }

    /* TOC */
    .toc { page-break-after: always; padding-bottom: 24px; }
    .toc h2 { font-size: 14pt; font-weight: 700; color: #1e3a5f; border-bottom: 2px solid #1e3a5f; padding-bottom: 6px; margin-bottom: 16px; }
    .toc-item { display: flex; align-items: baseline; gap: 8px; padding: 4px 0; border-bottom: 1px dotted #e2e8f0; font-size: 10pt; }
    .toc-num { color: #64748b; min-width: 20px; }

    /* Riassunto */
    .summary-box { background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 8px; padding: 16px; margin-bottom: 24px; page-break-inside: avoid; }
    .summary-box h3 { font-size: 11pt; font-weight: 700; color: #0369a1; margin-bottom: 10px; }
    .summary-box p { font-size: 10pt; color: #075985; margin-bottom: 6px; }

    /* Rischi */
    .risks-box { background: #fff7ed; border: 2px solid #fed7aa; border-radius: 8px; padding: 16px; margin-bottom: 24px; page-break-inside: avoid; }
    .risks-box h3 { font-size: 11pt; font-weight: 700; color: #c2410c; margin-bottom: 12px; }
    .risk-row { display: flex; gap: 10px; align-items: flex-start; margin-bottom: 10px; padding-bottom: 10px; border-bottom: 1px solid #fed7aa; }
    .risk-row:last-child { border-bottom: none; margin-bottom: 0; padding-bottom: 0; }
    .risk-badge { font-size: 8pt; font-weight: 700; border: 1.5px solid; border-radius: 4px; padding: 2px 6px; white-space: nowrap; flex-shrink: 0; margin-top: 2px; }
    .risk-desc { font-size: 10pt; font-weight: 600; color: #0f172a; }
    .risk-means { font-size: 9.5pt; color: #475569; margin-top: 2px; }

    /* Sections */
    .section { border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 16px; margin-bottom: 12px; page-break-inside: avoid; }
    .section-header { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
    .section-num { font-size: 9pt; color: #94a3b8; font-weight: 600; }
    .section-title { font-size: 12pt; font-weight: 700; color: #0f172a; flex: 1; }
    .section-status { font-size: 9pt; font-weight: 600; }
    .field-value { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px 12px; font-size: 10pt; color: #0f172a; margin-bottom: 10px; }
    .field-block { margin-bottom: 10px; }
    .field-block.meaning { background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 6px; padding: 10px 12px; }
    .field-label { font-size: 8pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #64748b; margin-bottom: 4px; }
    .field-block.meaning .field-label { color: #2563eb; }
    .field-text { font-size: 10pt; color: #1e293b; }
    .field-block.meaning .field-text { color: #1d4ed8; }
    .field-source { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px 12px; font-size: 9pt; display: flex; flex-wrap: wrap; gap: 8px; align-items: baseline; margin-top: 6px; }
    .source-page { font-weight: 600; color: #475569; }
    .source-excerpt { color: #64748b; font-style: italic; flex: 1; }
    .confidence-badge { font-weight: 600; font-size: 8.5pt; }
    .not-found { font-size: 9.5pt; color: #94a3b8; font-style: italic; }

    /* Checklist */
    .checklist { margin-left: 16px; }
    .checklist li { font-size: 10pt; color: #1e293b; margin-bottom: 6px; padding-left: 4px; }

    /* Appendice */
    .appendice-table { width: 100%; border-collapse: collapse; font-size: 9pt; }
    .appendice-table th { background: #1e3a5f; color: white; padding: 6px 10px; text-align: left; font-weight: 600; }
    .appendice-table td { padding: 6px 10px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
    .appendice-table tr:nth-child(even) td { background: #f8fafc; }
    .excerpt { font-style: italic; color: #475569; }

    /* Section headers */
    .chapter { font-size: 14pt; font-weight: 700; color: #1e3a5f; border-bottom: 2px solid #1e3a5f; padding-bottom: 6px; margin: 28px 0 16px; page-break-after: avoid; }

    @media print {
      .cover { min-height: auto; height: 100vh; }
    }
  </style>
</head>
<body>

  <!-- COVER PAGE -->
  <div class="cover">
    <div class="cover-badge">Perizia Analyzer — Resoconto Professionale</div>
    <h1>Resoconto Perizia</h1>
    <h2>${esc(fileName)}</h2>
    <div class="cover-stats">
      <div class="stat-box">
        <div class="stat-label">Data analisi</div>
        <div class="stat-value" style="font-size:11pt">${esc(now)}</div>
      </div>
      <div class="stat-box">
        <div class="stat-label">Pagine analizzate</div>
        <div class="stat-value">${pagesAnalyzed}/${totalPages}</div>
      </div>
      <div class="stat-box">
        <div class="stat-label">Qualità dati</div>
        <div class="stat-value" style="color:${qScore >= 70 ? '#059669' : qScore >= 40 ? '#d97706' : '#dc2626'}">${qScore}/100</div>
      </div>
    </div>
    <div class="cover-meta">
      <p>Documento generato da <strong>Perizia Analyzer</strong></p>
      ${requestId ? `<p>Request ID: <code>${esc(requestId)}</code></p>` : ''}
      <p>Uso interno riservato — non sostituisce la consulenza legale professionale</p>
    </div>
  </div>

  <!-- INDICE -->
  <div class="toc">
    <h2>Indice</h2>
    <div class="toc-item"><span class="toc-num">—</span> Riassunto operativo</div>
    <div class="toc-item"><span class="toc-num">—</span> Rischi principali</div>
    ${SECTIONS.map(s => `<div class="toc-item"><span class="toc-num">${esc(s.num)}.</span> ${esc(s.title)}</div>`).join('\n')}
    <div class="toc-item"><span class="toc-num">11.</span> Rischi rilevanti</div>
    <div class="toc-item"><span class="toc-num">12.</span> Checklist documenti</div>
    <div class="toc-item"><span class="toc-num">—</span> Appendice: estratti e fonti</div>
  </div>

  <!-- RIASSUNTO OPERATIVO -->
  <div class="chapter">Riassunto operativo</div>
  <div class="summary-box">
    <h3>Sintesi della perizia</h3>
    <p><strong>Immobile e valore:</strong> ${esc(result.riassunto.paragrafo1)}</p>
    <p><strong>Rischi e costi:</strong> ${esc(result.riassunto.paragrafo2)}</p>
    <p><strong>Atti e azioni:</strong> ${esc(result.riassunto.paragrafo3)}</p>
  </div>

  <!-- RISCHI PRINCIPALI -->
  <div class="chapter">Rischi principali</div>
  <div class="risks-box">
    <h3>⚠ Top rischi (ordinati per severità)</h3>
    ${rischHtml}
  </div>

  <!-- SEZIONI DETTAGLIO -->
  <div class="chapter">Analisi dettagliata</div>
  ${sectionsHtml}

  <!-- CHECKLIST -->
  <div class="chapter">12. Checklist — da verificare prima di offrire</div>
  ${checklistHtml}

  <!-- APPENDICE -->
  ${appendiceHtml ? `
  <div class="chapter">Appendice — Estratti e fonti</div>
  <table class="appendice-table">
    <thead>
      <tr>
        <th>Sezione</th>
        <th>Pagina</th>
        <th>Estratto</th>
        <th>Confidenza</th>
      </tr>
    </thead>
    <tbody>
      ${appendiceHtml}
    </tbody>
  </table>` : ''}

</body>
</html>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Open-in-new-window + print trigger
// ─────────────────────────────────────────────────────────────────────────────

export function openAndPrintResoconto(result: AnalysisResult, fileName: string): void {
  const html = generateResocontoHtml(result, fileName);
  const win = window.open('', '_blank', 'width=900,height=1000,scrollbars=yes');
  if (!win) {
    alert('Pop-up bloccato. Consenti i pop-up per questo sito e riprova.');
    return;
  }
  win.document.write(html);
  win.document.close();
  win.focus();
  // Give browser time to render before opening print dialog
  setTimeout(() => { win.print(); }, 600);
}
