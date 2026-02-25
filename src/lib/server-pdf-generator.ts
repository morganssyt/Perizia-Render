/**
 * server-pdf-generator.ts
 * Server-only (Node.js). Generates a binary PDF from a perizia analysis result.
 * Uses pdfkit — no browser APIs, no window.print.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const PDFDocument = require('pdfkit');

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PdfField {
  status: string;
  value?: string | null;
  summary?: string | null;
  confidence: number;
}

export interface PdfRiassunto {
  paragrafo1: string;
  paragrafo2: string;
  paragrafo3: string;
}

export interface PdfResocontoField {
  trovato: boolean;
  valore?: string | null;
  cosa_dice?: string | null;
  cosa_significa?: string | null;
  estratto?: string | null;
  pagina_rif?: string | null;
  confidenza?: string;
}

export interface PdfResocontoCompleto {
  identificazione?: PdfResocontoField;
  dati_catastali?: PdfResocontoField;
  superfici?: PdfResocontoField;
  titolarita?: PdfResocontoField;
  vincoli_ipoteche?: PdfResocontoField;
  stato_occupativo?: PdfResocontoField;
  conformita?: PdfResocontoField;
  stato_manutentivo?: PdfResocontoField;
  spese_condominio?: PdfResocontoField;
  valutazione?: PdfResocontoField;
  rischi?: { descrizione: string; severita: string; cosa_significa?: string }[];
  checklist?: string[];
}

export interface PdfReasoning {
  risk_score: number;
  max_bid_scenari: { conservativo: string; base: string; aggressivo: string };
  checklist: { item: string; done: boolean; priority: string }[];
  sintesi_esito: string;
}

export interface PdfPayload {
  fileName: string;
  result: {
    valore_perito:    PdfField;
    atti_antecedenti: PdfField;
    costi_oneri:      PdfField;
    difformita:       PdfField;
    riassunto:        PdfRiassunto;
    resoconto_completo?: PdfResocontoCompleto;
  };
  reasoning?: PdfReasoning;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const C_BLUE_DARK  = '#1e3a5f';
const C_BLUE       = '#2563eb';
const C_GRAY_DARK  = '#1e293b';
const C_GRAY_MED   = '#475569';
const C_GRAY_LIGHT = '#94a3b8';
const C_RED        = '#dc2626';
const C_ORANGE     = '#d97706';
const C_GREEN      = '#059669';
const C_WHITE      = '#ffffff';

const PAGE_W   = 595.28;
const PAGE_H   = 841.89;
const MARGIN   = 50;
const CONTENT_W = PAGE_W - MARGIN * 2;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function safe(s: string | null | undefined, maxLen = 2000): string {
  if (!s) return '';
  return s.slice(0, maxLen);
}

function riskColor(score: number): string {
  return score >= 7 ? C_RED : score >= 4 ? C_ORANGE : C_GREEN;
}

function severitaColor(s: string): string {
  return s === 'Alta' ? C_RED : s === 'Media' ? C_ORANGE : C_BLUE;
}

function esitoLabel(esito: string): string {
  return esito === 'verde' ? 'Procedi con fiducia' :
         esito === 'rosso' ? 'Attenzione massima' : 'Verifica approfondita';
}

function esitoColor(esito: string): string {
  return esito === 'verde' ? C_GREEN : esito === 'rosso' ? C_RED : C_ORANGE;
}

// Draw a section chapter header (dark bar + title)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function chapterHeader(doc: any, title: string): void {
  if (doc.y > PAGE_H - 100) doc.addPage();
  const y = doc.y;
  doc.rect(MARGIN, y, CONTENT_W, 22).fill(C_BLUE_DARK);
  doc.fillColor(C_WHITE).fontSize(11).font('Helvetica-Bold');
  doc.text(title, MARGIN + 10, y + 6, { width: CONTENT_W - 20 });
  doc.y = y + 30;
}

// Draw a text row with left-color bar. Returns new y after the row.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function infoRow(doc: any, label: string, value: string, accent: string): void {
  if (doc.y > PAGE_H - 60) doc.addPage();
  const y = doc.y;
  const valH = Math.max(32, doc.heightOfString(safe(value, 600), { width: CONTENT_W - 120 }) + 18);
  const labelH = Math.max(32, valH);

  doc.rect(MARGIN, y, CONTENT_W, labelH).fill('#f8fafc');
  doc.rect(MARGIN, y, CONTENT_W, labelH).stroke('#e2e8f0');
  doc.rect(MARGIN, y, 4, labelH).fill(accent);

  doc.fillColor(C_GRAY_DARK).fontSize(9).font('Helvetica-Bold');
  doc.text(label, MARGIN + 12, y + 9, { width: 110 });

  doc.fillColor(C_GRAY_MED).fontSize(9).font('Helvetica');
  doc.text(safe(value, 600) || '—', MARGIN + 130, y + 9, { width: CONTENT_W - 140 });

  doc.y = y + labelH + 5;
}

// ─── Main generator ───────────────────────────────────────────────────────────

export async function generateAnalysisPdf(payload: PdfPayload): Promise<Buffer> {
  const { result, reasoning, fileName } = payload;
  const now = new Date().toLocaleString('it-IT');
  const rc  = result.resoconto_completo;

  return new Promise<Buffer>((resolve, reject) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const doc: any = new PDFDocument({
      size:        'A4',
      bufferPages: true, // needed for footer page numbers
      margins:     { top: MARGIN, left: MARGIN, right: MARGIN, bottom: MARGIN + 20 },
      info: {
        Title:   `Resoconto Perizia - ${fileName}`,
        Author:  'Perizia Analyzer',
        Subject: 'Analisi perizia immobiliare per asta giudiziaria',
      },
    });

    const chunks: Buffer[] = [];
    doc.on('data',  (c: Buffer) => chunks.push(c));
    doc.on('end',   () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // ═══════════════════════════════════════════════════════════════════════════
    // PAGE 1 — COVER
    // ═══════════════════════════════════════════════════════════════════════════

    // Top accent bar
    doc.rect(0, 0, PAGE_W, 6).fill(C_BLUE_DARK);

    // Badge
    doc.y = MARGIN + 20;
    doc.rect(MARGIN, doc.y, 220, 18).fill(C_BLUE_DARK);
    doc.fillColor(C_WHITE).fontSize(8).font('Helvetica-Bold');
    doc.text('PERIZIA ANALYZER — REPORT PROFESSIONALE', MARGIN + 8, doc.y + 5, { width: 210 });
    doc.y += 26;

    // Title
    doc.fillColor(C_GRAY_DARK).fontSize(30).font('Helvetica-Bold');
    doc.text('Resoconto Perizia', MARGIN, doc.y, { width: CONTENT_W });
    doc.moveDown(0.4);

    // Filename
    const fnDisplay = fileName.replace(/\.pdf$/i, '').slice(0, 70);
    doc.fillColor(C_GRAY_MED).fontSize(14).font('Helvetica');
    doc.text(fnDisplay, MARGIN, doc.y, { width: CONTENT_W });
    doc.moveDown(2);

    // ── Stats boxes ──────────────────────────────────────────────────────────
    const bY  = doc.y;
    const bW  = (CONTENT_W - 20) / 3;
    const bH  = 60;

    // Box 1 — Date
    doc.rect(MARGIN, bY, bW, bH).fill('#f8fafc').stroke('#e2e8f0');
    doc.fillColor(C_GRAY_LIGHT).fontSize(7).font('Helvetica');
    doc.text('DATA ANALISI', MARGIN + 8, bY + 10, { width: bW - 16 });
    doc.fillColor(C_GRAY_DARK).fontSize(10).font('Helvetica-Bold');
    doc.text(now, MARGIN + 8, bY + 22, { width: bW - 16 });

    // Box 2 — Esito
    const ec = reasoning ? esitoColor(reasoning.sintesi_esito) : C_GRAY_LIGHT;
    const el = reasoning ? esitoLabel(reasoning.sintesi_esito).toUpperCase() : 'N/D';
    doc.rect(MARGIN + bW + 10, bY, bW, bH).fill('#f8fafc').stroke('#e2e8f0');
    doc.rect(MARGIN + bW + 10, bY, bW, 4).fill(ec);
    doc.fillColor(C_GRAY_LIGHT).fontSize(7).font('Helvetica');
    doc.text('ESITO GENERALE', MARGIN + bW + 18, bY + 12, { width: bW - 16 });
    doc.fillColor(ec).fontSize(9).font('Helvetica-Bold');
    doc.text(el, MARGIN + bW + 18, bY + 26, { width: bW - 16 });

    // Box 3 — Risk Score
    const rs     = reasoning?.risk_score ?? null;
    const rsCol  = rs !== null ? riskColor(rs) : C_GRAY_LIGHT;
    const rsText = rs !== null ? `${rs}/10` : 'N/D';
    doc.rect(MARGIN + (bW + 10) * 2, bY, bW, bH).fill('#f8fafc').stroke('#e2e8f0');
    doc.rect(MARGIN + (bW + 10) * 2, bY, bW, 4).fill(rsCol);
    doc.fillColor(C_GRAY_LIGHT).fontSize(7).font('Helvetica');
    doc.text('RISK SCORE', MARGIN + (bW + 10) * 2 + 8, bY + 12, { width: bW - 16 });
    doc.fillColor(rsCol).fontSize(22).font('Helvetica-Bold');
    doc.text(rsText, MARGIN + (bW + 10) * 2 + 8, bY + 24, { width: bW - 16 });

    doc.y = bY + bH + 30;

    // ── Cover disclaimer box ─────────────────────────────────────────────────
    const disH = 36;
    const disY = doc.y;
    doc.rect(MARGIN, disY, CONTENT_W, disH).fill('#f0f9ff').stroke('#bae6fd');
    doc.fillColor(C_BLUE).fontSize(8).font('Helvetica');
    doc.text(
      'Documento generato da Perizia Analyzer — Uso interno riservato — ' +
      'non sostituisce la consulenza legale professionale.',
      MARGIN + 10, disY + 10, { width: CONTENT_W - 20 },
    );
    doc.y = disY + disH + 20;

    // ── Indice / TOC ─────────────────────────────────────────────────────────
    doc.fillColor(C_BLUE_DARK).fontSize(12).font('Helvetica-Bold');
    doc.text('Indice', MARGIN, doc.y, { width: CONTENT_W });
    doc.moveDown(0.5);
    doc.rect(MARGIN, doc.y, CONTENT_W, 1).fill(C_BLUE_DARK);
    doc.moveDown(0.6);

    const tocItems = [
      '1. Riassunto operativo',
      '2. Dati chiave estratti',
      reasoning ? '3. Analisi del rischio e scenari offerta' : null,
      reasoning?.checklist?.length ? '4. Checklist operativa' : null,
      rc ? '5. Resoconto dettagliato (10 sezioni)' : null,
      rc?.rischi?.length ? '6. Rischi rilevati' : null,
      rc?.checklist?.length ? '7. Checklist documenti' : null,
    ].filter(Boolean) as string[];

    doc.fillColor(C_GRAY_MED).fontSize(10).font('Helvetica');
    tocItems.forEach((item) => {
      doc.text(item, MARGIN + 8, doc.y, { width: CONTENT_W - 16 });
      doc.moveDown(0.35);
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // PAGE 2 — RIASSUNTO + DATI CHIAVE
    // ═══════════════════════════════════════════════════════════════════════════

    doc.addPage();
    chapterHeader(doc, '1. Riassunto Operativo');

    const r = result.riassunto;
    const summaryItems = [
      { label: 'Immobile e valore', text: r.paragrafo1 },
      { label: 'Rischi e costi',    text: r.paragrafo2 },
      { label: 'Atti e azioni',     text: r.paragrafo3 },
    ];

    for (const si of summaryItems) {
      if (!si.text) continue;
      if (doc.y > PAGE_H - 80) doc.addPage();

      const sY = doc.y;
      const txtH = doc.heightOfString(safe(si.text, 1000), { width: CONTENT_W - 20 });
      const boxH = txtH + 28;

      doc.rect(MARGIN, sY, CONTENT_W, boxH).fill('#f0f9ff').stroke('#bae6fd');
      doc.rect(MARGIN, sY, 4, boxH).fill(C_BLUE);

      doc.fillColor(C_BLUE).fontSize(8).font('Helvetica-Bold');
      doc.text(si.label.toUpperCase(), MARGIN + 12, sY + 8, { width: CONTENT_W - 20 });
      doc.fillColor(C_GRAY_DARK).fontSize(10).font('Helvetica');
      doc.text(safe(si.text, 1000), MARGIN + 12, sY + 20, { width: CONTENT_W - 20 });

      doc.y = sY + boxH + 8;
    }

    doc.moveDown(1);
    chapterHeader(doc, '2. Dati Chiave Estratti');

    const fields: { label: string; field: PdfField }[] = [
      { label: 'Valore del Perito',  field: result.valore_perito },
      { label: 'Atti Antecedenti',   field: result.atti_antecedenti },
      { label: 'Costi e Oneri',      field: result.costi_oneri },
      { label: 'Difformità e Abusi', field: result.difformita },
    ];

    for (const { label, field } of fields) {
      if (doc.y > PAGE_H - 80) doc.addPage();

      const found  = field.status === 'found';
      const text   = found ? (field.value ?? field.summary ?? '') : '';
      const accent = found ? C_GREEN : C_GRAY_LIGHT;
      const pct    = Math.round(field.confidence * 100);

      const sY  = doc.y;
      const tH  = text ? doc.heightOfString(safe(text, 500), { width: CONTENT_W - 90 }) : 14;
      const bH  = Math.max(36, tH + 22);

      doc.rect(MARGIN, sY, CONTENT_W, bH).fill(found ? '#f0fdf4' : '#f8fafc').stroke(found ? '#86efac' : '#e2e8f0');
      doc.rect(MARGIN, sY, 4, bH).fill(accent);

      doc.fillColor(C_GRAY_DARK).fontSize(10).font('Helvetica-Bold');
      doc.text(label, MARGIN + 12, sY + 10, { width: CONTENT_W - 100 });

      // Status + confidence badges (top right)
      doc.fillColor(accent).fontSize(8).font('Helvetica-Bold');
      doc.text(found ? 'TROVATO' : 'NON TROVATO', PAGE_W - MARGIN - 80, sY + 8, { width: 75, align: 'right' });
      doc.fillColor(C_GRAY_LIGHT).fontSize(7.5).font('Helvetica');
      doc.text(`conf. ${pct}%`, PAGE_W - MARGIN - 80, sY + 20, { width: 75, align: 'right' });

      if (text) {
        doc.fillColor(C_GRAY_MED).fontSize(9.5).font('Helvetica');
        doc.text(safe(text, 500), MARGIN + 12, sY + 24, { width: CONTENT_W - 95 });
      } else {
        doc.fillColor(C_GRAY_LIGHT).fontSize(9).font('Helvetica');
        doc.text('Non rilevato nel documento.', MARGIN + 12, sY + 24, { width: CONTENT_W - 95 });
      }

      doc.y = sY + bH + 6;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PAGE 3 — RISK + SCENARI + CHECKLIST (if reasoning present)
    // ═══════════════════════════════════════════════════════════════════════════

    if (reasoning) {
      doc.addPage();
      chapterHeader(doc, '3. Analisi del Rischio');

      // Risk score bar
      const score   = reasoning.risk_score;
      const scoreC  = riskColor(score);
      const rY      = doc.y;
      const rBoxH   = 64;

      doc.rect(MARGIN, rY, CONTENT_W, rBoxH).fill('#f8fafc').stroke('#e2e8f0');
      doc.rect(MARGIN, rY, 4, rBoxH).fill(scoreC);

      doc.fillColor(C_GRAY_LIGHT).fontSize(8).font('Helvetica');
      doc.text('INDICE DI RISCHIO', MARGIN + 12, rY + 10, { width: 120 });
      doc.fillColor(scoreC).fontSize(30).font('Helvetica-Bold');
      doc.text(`${score}/10`, MARGIN + 12, rY + 20, { width: 80 });

      const esLabel = esitoLabel(reasoning.sintesi_esito);
      const esColor = esitoColor(reasoning.sintesi_esito);
      doc.fillColor(esColor).fontSize(13).font('Helvetica-Bold');
      doc.text(esLabel, MARGIN + 110, rY + 22, { width: CONTENT_W - 120 });

      // Esito description
      const esitoDesc = reasoning.sintesi_esito === 'verde'
        ? 'Nessuna criticità rilevante. Puoi procedere con l\'offerta.'
        : reasoning.sintesi_esito === 'rosso'
          ? 'Rischi significativi. Approfondisci prima di procedere.'
          : 'Alcuni elementi da verificare prima dell\'offerta.';
      doc.fillColor(C_GRAY_MED).fontSize(9).font('Helvetica');
      doc.text(esitoDesc, MARGIN + 110, rY + 40, { width: CONTENT_W - 120 });

      doc.y = rY + rBoxH + 20;

      // ── Scenari Offerta Massima ──────────────────────────────────────────
      chapterHeader(doc, 'Scenari Offerta Massima');

      const scenari = [
        { label: 'Conservativo', value: reasoning.max_bid_scenari.conservativo, color: C_GREEN },
        { label: 'Base',         value: reasoning.max_bid_scenari.base,         color: C_BLUE },
        { label: 'Aggressivo',   value: reasoning.max_bid_scenari.aggressivo,   color: C_ORANGE },
      ];
      const sW  = (CONTENT_W - 16) / 3;
      const sY2 = doc.y;
      const sH  = 56;

      scenari.forEach((s, i) => {
        const sx = MARGIN + (sW + 8) * i;
        doc.rect(sx, sY2, sW, sH).fill('#f8fafc').stroke('#e2e8f0');
        doc.rect(sx, sY2, sW, 4).fill(s.color);
        doc.fillColor(C_GRAY_LIGHT).fontSize(7).font('Helvetica');
        doc.text(s.label.toUpperCase(), sx + 8, sY2 + 12, { width: sW - 16 });
        doc.fillColor(s.color).fontSize(13).font('Helvetica-Bold');
        doc.text(safe(s.value) || 'N/D', sx + 8, sY2 + 26, { width: sW - 16 });
      });

      doc.y = sY2 + sH + 20;

      // ── Checklist ────────────────────────────────────────────────────────
      if (reasoning.checklist && reasoning.checklist.length > 0) {
        chapterHeader(doc, '4. Checklist Operativa');

        const priorityColors: Record<string, string> = { alta: C_RED, media: C_ORANGE, bassa: C_BLUE };

        reasoning.checklist.forEach((item, idx) => {
          if (doc.y > PAGE_H - 60) doc.addPage();
          const cY  = doc.y;
          const cTH = doc.heightOfString(safe(item.item, 200), { width: CONTENT_W - 90 });
          const cH  = Math.max(28, cTH + 16);
          const pc  = priorityColors[item.priority] ?? C_GRAY_LIGHT;

          doc.rect(MARGIN, cY, CONTENT_W, cH).fill(idx % 2 === 0 ? '#f8fafc' : '#ffffff');
          doc.rect(MARGIN, cY, 3, cH).fill(pc);

          // Checkbox
          doc.rect(MARGIN + 10, cY + (cH - 12) / 2, 12, 12).stroke(C_GRAY_LIGHT);
          if (item.done) {
            doc.fillColor(C_GREEN).fontSize(8).font('Helvetica-Bold');
            doc.text('✓', MARGIN + 13, cY + (cH - 10) / 2);
          }

          doc.fillColor(C_GRAY_DARK).fontSize(9.5).font('Helvetica');
          doc.text(safe(item.item, 200), MARGIN + 30, cY + 8, { width: CONTENT_W - 90 });

          doc.fillColor(pc).fontSize(7).font('Helvetica-Bold');
          doc.text(item.priority.toUpperCase(), PAGE_W - MARGIN - 45, cY + (cH - 9) / 2, { width: 40, align: 'right' });

          doc.y = cY + cH + 3;
        });
      }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PAGES N+ — RESOCONTO DETTAGLIATO (if present)
    // ═══════════════════════════════════════════════════════════════════════════

    if (rc) {
      doc.addPage();
      chapterHeader(doc, '5. Resoconto Dettagliato');

      const SECTIONS = [
        { key: 'identificazione'   as const, num: '1',  title: 'Identificazione immobile' },
        { key: 'dati_catastali'    as const, num: '2',  title: 'Dati catastali' },
        { key: 'superfici'         as const, num: '3',  title: 'Superfici' },
        { key: 'titolarita'        as const, num: '4',  title: 'Titolarità e quota' },
        { key: 'vincoli_ipoteche'  as const, num: '5',  title: 'Vincoli, ipoteche, servitù' },
        { key: 'stato_occupativo'  as const, num: '6',  title: 'Stato occupativo' },
        { key: 'conformita'        as const, num: '7',  title: 'Conformità urbanistica/edilizia' },
        { key: 'stato_manutentivo' as const, num: '8',  title: 'Stato manutentivo e impianti' },
        { key: 'spese_condominio'  as const, num: '9',  title: 'Spese condominiali e oneri' },
        { key: 'valutazione'       as const, num: '10', title: 'Valutazione e base d\'asta' },
      ];

      for (const sec of SECTIONS) {
        const field = rc[sec.key];
        if (!field) {
          // Section key missing in legacy data → show placeholder
          if (doc.y > PAGE_H - 60) doc.addPage();
          infoRow(doc, `${sec.num}. ${sec.title}`, 'Non disponibile in questa analisi.', C_GRAY_LIGHT);
          continue;
        }

        if (doc.y > PAGE_H - 120) doc.addPage();
        const found  = field.trovato;
        const accent = found ? C_GREEN : C_GRAY_LIGHT;

        // Section header row
        const shY = doc.y;
        doc.rect(MARGIN, shY, CONTENT_W, 22).fill(found ? '#f0fdf4' : '#f8fafc').stroke(found ? '#86efac' : '#e2e8f0');
        doc.rect(MARGIN, shY, 3, 22).fill(accent);

        doc.fillColor(C_GRAY_LIGHT).fontSize(8).font('Helvetica');
        doc.text(`${sec.num}.`, MARGIN + 8, shY + 7, { width: 18 });
        doc.fillColor(C_GRAY_DARK).fontSize(10).font('Helvetica-Bold');
        doc.text(sec.title, MARGIN + 26, shY + 7, { width: CONTENT_W - 100 });
        doc.fillColor(accent).fontSize(8).font('Helvetica-Bold');
        doc.text(found ? '✓ TROVATO' : '— NON RILEVATO', PAGE_W - MARGIN - 80, shY + 7, { width: 75, align: 'right' });
        doc.y = shY + 26;

        if (!found) {
          doc.fillColor(C_GRAY_LIGHT).fontSize(9).font('Helvetica');
          doc.text('Informazione non presente nel testo della perizia.', MARGIN + 8, doc.y, { width: CONTENT_W - 16 });
          doc.moveDown(0.8);
          continue;
        }

        // Value (main highlight)
        if (field.valore) {
          doc.fillColor(C_GRAY_DARK).fontSize(11).font('Helvetica-Bold');
          doc.text(safe(field.valore, 300), MARGIN + 8, doc.y, { width: CONTENT_W - 16 });
          doc.moveDown(0.3);
        }

        // cosa_dice
        if (field.cosa_dice) {
          doc.fillColor(C_GRAY_LIGHT).fontSize(7.5).font('Helvetica-Bold');
          doc.text('COSA DICE LA PERIZIA', MARGIN + 8, doc.y, { width: CONTENT_W - 16 });
          doc.fillColor(C_GRAY_MED).fontSize(9).font('Helvetica');
          doc.text(safe(field.cosa_dice, 600), MARGIN + 8, doc.y + 1, { width: CONTENT_W - 16 });
          doc.moveDown(0.5);
        }

        // cosa_significa (highlighted box)
        if (field.cosa_significa) {
          if (doc.y > PAGE_H - 80) doc.addPage();
          const msText = safe(field.cosa_significa, 400);
          const msH    = doc.heightOfString(msText, { width: CONTENT_W - 32 }) + 24;
          const msY    = doc.y;

          doc.rect(MARGIN + 8, msY, CONTENT_W - 16, msH).fill('#eff6ff').stroke('#bfdbfe');
          doc.fillColor(C_BLUE).fontSize(7.5).font('Helvetica-Bold');
          doc.text('COSA SIGNIFICA PER TE:', MARGIN + 16, msY + 8, { width: CONTENT_W - 32 });
          doc.fillColor('#1d4ed8').fontSize(9.5).font('Helvetica');
          doc.text(msText, MARGIN + 16, msY + 18, { width: CONTENT_W - 32 });
          doc.y = msY + msH + 4;
        }

        // Source line
        if (field.pagina_rif || field.estratto || field.confidenza) {
          doc.fillColor(C_GRAY_LIGHT).fontSize(7.5).font('Helvetica');
          const parts: string[] = [];
          if (field.pagina_rif) parts.push(`Pag. ${field.pagina_rif}`);
          if (field.estratto) parts.push(`"${safe(field.estratto, 100)}"`);
          if (field.confidenza) parts.push(`Confidenza: ${field.confidenza}`);
          doc.text(parts.join('  ·  '), MARGIN + 8, doc.y, { width: CONTENT_W - 16 });
          doc.moveDown(0.4);
        }

        doc.moveDown(0.6);
        // thin divider
        doc.rect(MARGIN, doc.y, CONTENT_W, 0.5).fill('#e2e8f0');
        doc.moveDown(0.6);
      }

      // ── Rischi ──────────────────────────────────────────────────────────────
      if (rc.rischi && rc.rischi.length > 0) {
        if (doc.y > PAGE_H - 160) doc.addPage();
        chapterHeader(doc, '6. Rischi Rilevati');

        const sorted = [...rc.rischi].sort((a, b) => {
          const o: Record<string, number> = { Alta: 0, Media: 1, Bassa: 2 };
          return (o[a.severita] ?? 2) - (o[b.severita] ?? 2);
        });

        sorted.forEach((rk) => {
          if (doc.y > PAGE_H - 80) doc.addPage();
          const rkC   = severitaColor(rk.severita);
          const descH = doc.heightOfString(safe(rk.descrizione, 300), { width: CONTENT_W - 80 });
          const sigH  = rk.cosa_significa ? doc.heightOfString(safe(rk.cosa_significa, 300), { width: CONTENT_W - 80 }) : 0;
          const rkH   = Math.max(40, descH + sigH + 24);
          const rkY   = doc.y;

          doc.rect(MARGIN, rkY, CONTENT_W, rkH).fill('#fff7ed').stroke('#fed7aa');
          doc.rect(MARGIN, rkY, 4, rkH).fill(rkC);

          doc.fillColor(rkC).fontSize(7.5).font('Helvetica-Bold');
          doc.text(rk.severita.toUpperCase(), MARGIN + 10, rkY + 10, { width: 55 });

          doc.fillColor(C_GRAY_DARK).fontSize(10).font('Helvetica-Bold');
          doc.text(safe(rk.descrizione, 300), MARGIN + 72, rkY + 10, { width: CONTENT_W - 82 });

          if (rk.cosa_significa) {
            doc.fillColor(C_GRAY_MED).fontSize(9).font('Helvetica');
            doc.text(safe(rk.cosa_significa, 300), MARGIN + 72, rkY + 26, { width: CONTENT_W - 82 });
          }

          doc.y = rkY + rkH + 6;
        });
      }

      // ── Checklist documenti ──────────────────────────────────────────────────
      if (rc.checklist && rc.checklist.length > 0) {
        if (doc.y > PAGE_H - 120) doc.addPage();
        chapterHeader(doc, '7. Checklist — Documenti da verificare');

        rc.checklist.forEach((item, idx) => {
          if (doc.y > PAGE_H - 50) doc.addPage();
          const cY  = doc.y;
          const cTH = doc.heightOfString(safe(item, 200), { width: CONTENT_W - 40 });
          const cH  = Math.max(24, cTH + 14);

          doc.rect(MARGIN, cY, CONTENT_W, cH).fill(idx % 2 === 0 ? '#f8fafc' : '#ffffff');
          doc.rect(MARGIN + 10, cY + (cH - 12) / 2, 12, 12).stroke(C_GRAY_LIGHT);

          doc.fillColor(C_GRAY_DARK).fontSize(9.5).font('Helvetica');
          doc.text(`${idx + 1}. ${safe(item, 200)}`, MARGIN + 30, cY + 7, { width: CONTENT_W - 40 });

          doc.y = cY + cH + 2;
        });
      }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // FOOTER — page numbers on all pages
    // ═══════════════════════════════════════════════════════════════════════════

    const range = doc.bufferedPageRange();
    const total = range.count;

    for (let i = 0; i < total; i++) {
      doc.switchToPage(range.start + i);
      // Bottom accent line
      doc.rect(0, PAGE_H - 28, PAGE_W, 2).fill(C_BLUE_DARK);
      // Footer text
      doc.fillColor(C_GRAY_LIGHT).fontSize(7.5).font('Helvetica');
      doc.text(
        `Perizia Analyzer  ·  ${now}  ·  Pagina ${i + 1} di ${total}`,
        MARGIN, PAGE_H - 22,
        { width: CONTENT_W, align: 'center' },
      );
    }

    doc.end();
  });
}
