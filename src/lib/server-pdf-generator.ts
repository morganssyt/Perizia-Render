/**
 * server-pdf-generator.ts — premium rewrite
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
  azioni_consigliate?: string | null;
  estratto?: string | null;
  pagina_rif?: string | null;
  confidenza?: string;
}

export interface PdfVincoloDettaglio {
  tipo: string;
  importo?: string | null;
  soggetto?: string | null;
  data?: string | null;
  severita?: string | null;
  note_operative?: string | null;
}

export interface PdfRisk {
  descrizione: string;
  severita: string;
  cosa_significa?: string;
  dimensione_impatto?: string | null;
  perche?: string | null;
  cosa_fare?: string | null;
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
  atti_antecedenti?: PdfResocontoField;
  difformita?: PdfResocontoField;
  rischi?: PdfRisk[];
  checklist?: string[];
  vincoli_dettaglio?: PdfVincoloDettaglio[];
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

// ─── Colour palette ───────────────────────────────────────────────────────────
const NAVY   = '#0d2240';
const BLUE   = '#1d4ed8';
const BLUE_L = '#dbeafe';
const GD     = '#111827';
const GM     = '#374151';
const G      = '#6b7280';
const GL     = '#9ca3af';
const GXL    = '#e5e7eb';
const GBG    = '#f9fafb';
const RED    = '#dc2626';
const RED_L  = '#fee2e2';
const ORG    = '#d97706';
const ORG_L  = '#fef3c7';
const GRN    = '#059669';
const GRN_L  = '#d1fae5';
const WHITE  = '#ffffff';

// ─── Page geometry ────────────────────────────────────────────────────────────
const PAGE_W      = 595.28;
const PAGE_H      = 841.89;
const MARGIN      = 48;
const CONTENT_W   = PAGE_W - MARGIN * 2;
const FOOTER_H    = 28;
const CONTENT_BTM = PAGE_H - FOOTER_H - 18;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function safe(s: string | null | undefined, maxLen = 2000): string {
  if (!s) return '';
  return s.slice(0, maxLen);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function needsPage(doc: any, neededH: number): void {
  if (doc.y + neededH > CONTENT_BTM) doc.addPage();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function chapterBar(doc: any, num: string, title: string): void {
  if (doc.y + 24 > CONTENT_BTM) doc.addPage();
  const y = doc.y;
  doc.rect(MARGIN, y, CONTENT_W, 24).fill(NAVY);
  doc.fillColor(WHITE).fontSize(10.5).font('Helvetica-Bold');
  doc.text(`${num}  ${title}`, MARGIN + 12, y + 7, { width: CONTENT_W - 20 });
  doc.y = y + 32;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function sectionTitle(doc: any, title: string): void {
  needsPage(doc, 20);
  doc.fillColor(BLUE).fontSize(8.5).font('Helvetica-Bold');
  doc.text(title.toUpperCase(), MARGIN, doc.y, { width: CONTENT_W });
  doc.moveDown(0.25);
  doc.rect(MARGIN, doc.y, CONTENT_W, 0.5).fill(BLUE_L);
  doc.moveDown(0.5);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function infoRow(doc: any, label: string, value: string, accent = BLUE): void {
  doc.font('Helvetica').fontSize(9);
  const valH = doc.heightOfString(safe(value, 600), { width: CONTENT_W - 136 });
  const rowH = Math.max(30, valH + 18);
  needsPage(doc, rowH + 4);
  const y = doc.y;
  doc.rect(MARGIN, y, CONTENT_W, rowH).fill(GBG).stroke(GXL);
  doc.rect(MARGIN, y, 3, rowH).fill(accent);
  doc.fillColor(GM).fontSize(8.5).font('Helvetica-Bold');
  doc.text(label, MARGIN + 10, y + 9, { width: 116 });
  doc.fillColor(GM).fontSize(9).font('Helvetica');
  doc.text(safe(value, 600) || '—', MARGIN + 132, y + 9, { width: CONTENT_W - 142 });
  doc.y = y + rowH + 4;
}

type CalloutType = 'info' | 'warning' | 'action' | 'critical' | 'note';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function callout(doc: any, type: CalloutType, title: string, text: string): void {
  const cfg: Record<CalloutType, { bg: string; border: string; accent: string; tc: string }> = {
    info:     { bg: '#eff6ff', border: '#bfdbfe', accent: BLUE, tc: BLUE },
    warning:  { bg: ORG_L,    border: '#fcd34d', accent: ORG,  tc: ORG  },
    action:   { bg: GRN_L,    border: '#6ee7b7', accent: GRN,  tc: GRN  },
    critical: { bg: RED_L,    border: '#fca5a5', accent: RED,  tc: RED  },
    note:     { bg: GBG,      border: GXL,       accent: GL,   tc: G    },
  };
  const { bg, border, accent, tc } = cfg[type];
  doc.font('Helvetica').fontSize(9);
  const txtH = doc.heightOfString(safe(text, 800), { width: CONTENT_W - 28 });
  const boxH = (title ? 16 : 0) + txtH + 22;
  needsPage(doc, boxH + 6);
  const y = doc.y;
  doc.rect(MARGIN, y, CONTENT_W, boxH).fill(bg).stroke(border);
  doc.rect(MARGIN, y, 3, boxH).fill(accent);
  if (title) {
    doc.fillColor(tc).fontSize(7.5).font('Helvetica-Bold');
    doc.text(title.toUpperCase(), MARGIN + 10, y + 8, { width: CONTENT_W - 16 });
  }
  doc.fillColor(GM).fontSize(9).font('Helvetica');
  doc.text(safe(text, 800), MARGIN + 10, y + (title ? 20 : 10), { width: CONTENT_W - 20 });
  doc.y = y + boxH + 6;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function drawTable(doc: any, headers: string[], widths: number[], rows: string[][]): void {
  const PAD     = 6;
  const ROW_MIN = 22;
  // Header
  needsPage(doc, ROW_MIN + 4);
  const hY = doc.y;
  let hX = MARGIN;
  doc.rect(MARGIN, hY, CONTENT_W, ROW_MIN).fill(NAVY);
  headers.forEach((h, i) => {
    doc.fillColor(WHITE).fontSize(7.5).font('Helvetica-Bold');
    doc.text(h, hX + PAD, hY + 7, { width: widths[i] - PAD * 2, lineBreak: false });
    hX += widths[i];
  });
  doc.y = hY + ROW_MIN;

  rows.forEach((row, ri) => {
    // Compute row height
    let rowH = ROW_MIN;
    row.forEach((cell, ci) => {
      doc.font('Helvetica').fontSize(8.5);
      const h = doc.heightOfString(safe(cell, 200), { width: widths[ci] - PAD * 2 });
      rowH = Math.max(rowH, h + 14);
    });
    needsPage(doc, rowH + 2);
    const ry = doc.y;
    let rx = MARGIN;
    doc.rect(MARGIN, ry, CONTENT_W, rowH).fill(ri % 2 === 0 ? WHITE : GBG).stroke(GXL);
    row.forEach((cell, ci) => {
      doc.fillColor(GM).fontSize(8.5).font('Helvetica');
      doc.text(safe(cell, 200), rx + PAD, ry + 7, { width: widths[ci] - PAD * 2 });
      rx += widths[ci];
    });
    doc.y = ry + rowH;
  });
  doc.moveDown(0.5);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function renderSection(doc: any, num: string, title: string, field: PdfResocontoField | undefined): void {
  needsPage(doc, 60);
  const accent = field?.trovato ? GRN : GL;
  const badge  = field?.trovato ? '✓ TROVATO' : '— NON RILEVATO';
  const badgeC = field?.trovato ? GRN : GL;
  const shY = doc.y;
  doc.rect(MARGIN, shY, CONTENT_W, 22).fill(field?.trovato ? '#f0fdf4' : GBG).stroke(GXL);
  doc.rect(MARGIN, shY, 3, 22).fill(accent);
  doc.fillColor(GL).fontSize(8).font('Helvetica');
  doc.text(num + '.', MARGIN + 8, shY + 7, { width: 18 });
  doc.fillColor(GD).fontSize(9.5).font('Helvetica-Bold');
  doc.text(title, MARGIN + 26, shY + 7, { width: CONTENT_W - 110 });
  doc.fillColor(badgeC).fontSize(7.5).font('Helvetica-Bold');
  doc.text(badge, PAGE_W - MARGIN - 82, shY + 8, { width: 78, align: 'right' });
  doc.y = shY + 26;

  if (!field || !field.trovato) {
    doc.fillColor(GL).fontSize(9).font('Helvetica');
    doc.text('Informazione non rilevata nella perizia.', MARGIN + 8, doc.y, { width: CONTENT_W - 16 });
    doc.moveDown(0.8);
    return;
  }

  if (field.valore) {
    needsPage(doc, 18);
    doc.fillColor(GD).fontSize(11).font('Helvetica-Bold');
    doc.text(safe(field.valore, 300), MARGIN + 8, doc.y, { width: CONTENT_W - 16 });
    doc.moveDown(0.4);
  }

  if (field.cosa_dice) {
    needsPage(doc, 30);
    doc.fillColor(GL).fontSize(7).font('Helvetica-Bold');
    doc.text('COSA DICE LA PERIZIA', MARGIN + 8, doc.y, { width: CONTENT_W - 16 });
    doc.moveDown(0.1);
    doc.fillColor(GM).fontSize(9).font('Helvetica');
    doc.text(safe(field.cosa_dice, 600), MARGIN + 8, doc.y, { width: CONTENT_W - 16 });
    doc.moveDown(0.5);
  }

  if (field.cosa_significa) {
    callout(doc, 'info', 'Cosa significa per te', safe(field.cosa_significa, 500));
  }

  if (field.azioni_consigliate) {
    callout(doc, 'action', 'Azioni consigliate', safe(field.azioni_consigliate, 500));
  }

  if (field.pagina_rif || field.estratto || field.confidenza) {
    needsPage(doc, 14);
    const parts: string[] = [];
    if (field.pagina_rif) parts.push(`Pag. ${field.pagina_rif}`);
    if (field.estratto) parts.push(`"${safe(field.estratto, 100)}"`);
    if (field.confidenza) parts.push(`Confidenza: ${field.confidenza}`);
    doc.fillColor(GL).fontSize(7.5).font('Helvetica');
    doc.text(parts.join('  ·  '), MARGIN + 8, doc.y, { width: CONTENT_W - 16 });
    doc.moveDown(0.4);
  }

  doc.moveDown(0.4);
  doc.rect(MARGIN, doc.y, CONTENT_W, 0.5).fill(GXL);
  doc.moveDown(0.5);
}

// ─── Main generator ───────────────────────────────────────────────────────────

export async function generateAnalysisPdf(payload: PdfPayload): Promise<Buffer> {
  const { result, reasoning, fileName } = payload;
  const now = new Date().toLocaleString('it-IT');
  const rc  = result.resoconto_completo;
  const risks: PdfRisk[] = rc?.rischi ?? [];

  const riskCrit = risks.filter(r => r.severita === 'Critica').length;
  const riskAlta = risks.filter(r => r.severita === 'Alta').length;
  const riskMed  = risks.filter(r => r.severita === 'Media').length;
  const riskBass = risks.filter(r => r.severita === 'Bassa').length;

  const goNogo: 'GO' | 'NO-GO' | 'DA VERIFICARE' =
    riskCrit > 0 || riskAlta > 1 ? 'NO-GO' :
    riskAlta > 0 || riskMed  > 2 ? 'DA VERIFICARE' : 'GO';
  const goColor = goNogo === 'GO' ? GRN : goNogo === 'NO-GO' ? RED : ORG;

  return new Promise<Buffer>((resolve, reject) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const doc: any = new PDFDocument({
      size:        'A4',
      bufferPages: true,
      margins:     { top: 56, left: MARGIN, right: MARGIN, bottom: FOOTER_H + 24 },
      info: {
        Title:   `Resoconto Perizia — ${fileName}`,
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

    // Top accent (cover — footer loop will repaint this on all pages)
    doc.rect(0, 0, PAGE_W, 6).fill(NAVY);

    doc.y = 70;
    doc.rect(MARGIN, doc.y, 250, 18).fill(NAVY);
    doc.fillColor(WHITE).fontSize(7.5).font('Helvetica-Bold');
    doc.text('PERIZIA ANALYZER — REPORT PROFESSIONALE', MARGIN + 8, doc.y + 5, { width: 240 });
    doc.y += 26;

    doc.fillColor(GD).fontSize(28).font('Helvetica-Bold');
    doc.text('Resoconto Perizia', MARGIN, doc.y, { width: CONTENT_W });
    doc.moveDown(0.3);

    const fnDisplay = fileName.replace(/\.pdf$/i, '').slice(0, 70);
    doc.fillColor(GM).fontSize(13).font('Helvetica');
    doc.text(fnDisplay, MARGIN, doc.y, { width: CONTENT_W });
    doc.moveDown(2);

    // ── Three stats boxes ──────────────────────────────────────────────────
    const bY = doc.y;
    const bW = (CONTENT_W - 16) / 3;
    const bH = 62;

    // Box 1 — Data
    doc.rect(MARGIN, bY, bW, bH).fill(GBG).stroke(GXL);
    doc.fillColor(GL).fontSize(7).font('Helvetica');
    doc.text('DATA ANALISI', MARGIN + 8, bY + 10, { width: bW - 16 });
    doc.fillColor(GD).fontSize(9.5).font('Helvetica-Bold');
    doc.text(now, MARGIN + 8, bY + 22, { width: bW - 16 });

    // Box 2 — GO/NO-GO
    const gx = MARGIN + bW + 8;
    doc.rect(gx, bY, bW, bH).fill(GBG).stroke(GXL);
    doc.rect(gx, bY, bW, 4).fill(goColor);
    doc.fillColor(GL).fontSize(7).font('Helvetica');
    doc.text('VERDETTO', gx + 8, bY + 12, { width: bW - 16 });
    doc.fillColor(goColor).fontSize(18).font('Helvetica-Bold');
    doc.text(goNogo, gx + 8, bY + 24, { width: bW - 16 });

    // Box 3 — Risk score
    const rx2 = MARGIN + (bW + 8) * 2;
    const rs    = reasoning?.risk_score ?? null;
    const rsCol = rs !== null ? (rs >= 7 ? RED : rs >= 4 ? ORG : GRN) : GL;
    doc.rect(rx2, bY, bW, bH).fill(GBG).stroke(GXL);
    doc.rect(rx2, bY, bW, 4).fill(rsCol);
    doc.fillColor(GL).fontSize(7).font('Helvetica');
    doc.text('RISK SCORE', rx2 + 8, bY + 12, { width: bW - 16 });
    doc.fillColor(rsCol).fontSize(22).font('Helvetica-Bold');
    doc.text(rs !== null ? `${rs}/10` : 'N/D', rx2 + 8, bY + 24, { width: bW - 16 });

    doc.y = bY + bH + 16;

    // Disclaimer
    callout(doc, 'note', '', 'Documento generato da Perizia Analyzer — Uso interno riservato. Non sostituisce la consulenza legale professionale.');

    // Indice
    doc.moveDown(0.6);
    doc.fillColor(NAVY).fontSize(11.5).font('Helvetica-Bold');
    doc.text('Indice', MARGIN, doc.y, { width: CONTENT_W });
    doc.moveDown(0.3);
    doc.rect(MARGIN, doc.y, CONTENT_W, 1).fill(NAVY);
    doc.moveDown(0.5);

    const tocItems = [
      '1. Executive Summary',
      '2. Profilo immobile',
      '3. Dati catastali',
      '4. Titolarità',
      '5. Vincoli e gravami',
      '6. Conformità urbanistica',
      '7. Stato occupativo e spese',
      '8. Valutazione economica',
      risks.length > 0 ? '9. Matrice dei rischi' : null,
      `${risks.length > 0 ? '10' : '9'}. Checklist due diligence`,
    ].filter(Boolean) as string[];

    doc.fillColor(GM).fontSize(10).font('Helvetica');
    tocItems.forEach((item) => {
      doc.text(item, MARGIN + 8, doc.y, { width: CONTENT_W - 16 });
      doc.moveDown(0.32);
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // PAGE 2 — EXECUTIVE SUMMARY
    // ═══════════════════════════════════════════════════════════════════════════
    doc.addPage();
    chapterBar(doc, '1.', 'Executive Summary');

    // GO/NO-GO indicator box
    const ggY = doc.y;
    const ggH = 50;
    doc.rect(MARGIN, ggY, CONTENT_W, ggH)
      .fill(goNogo === 'GO' ? GRN_L : goNogo === 'NO-GO' ? RED_L : ORG_L)
      .stroke(goColor);
    doc.rect(MARGIN, ggY, 4, ggH).fill(goColor);
    doc.fillColor(goColor).fontSize(22).font('Helvetica-Bold');
    doc.text(goNogo, MARGIN + 16, ggY + 12, { width: 110 });
    const ggDesc =
      goNogo === 'GO'     ? 'Nessuna criticità rilevante. Puoi procedere con l\'offerta in modo informato.' :
      goNogo === 'NO-GO'  ? 'Rischi significativi rilevati. Approfondisci prima di procedere.' :
                            'Alcuni elementi richiedono verifica. Valuta con attenzione.';
    doc.fillColor(GM).fontSize(10).font('Helvetica');
    doc.text(ggDesc, MARGIN + 130, ggY + 16, { width: CONTENT_W - 140 });
    doc.y = ggY + ggH + 14;

    // Top 5 risks
    const top5 = [...risks].sort((a, b) => {
      const o: Record<string, number> = { Critica: 0, Alta: 1, Media: 2, Bassa: 3 };
      return (o[a.severita] ?? 3) - (o[b.severita] ?? 3);
    }).slice(0, 5);

    if (top5.length > 0) {
      sectionTitle(doc, 'Top rischi rilevati');
      top5.forEach((rk) => {
        const rkC  = rk.severita === 'Critica' ? RED : rk.severita === 'Alta' ? ORG : rk.severita === 'Media' ? '#ca8a04' : GL;
        const rkBg = rk.severita === 'Critica' ? RED_L : rk.severita === 'Alta' ? ORG_L : GBG;
        doc.font('Helvetica').fontSize(9);
        const descH = doc.heightOfString(safe(rk.descrizione, 200), { width: CONTENT_W - 80 });
        const rowH  = Math.max(26, descH + 14);
        needsPage(doc, rowH + 4);
        const ry = doc.y;
        doc.rect(MARGIN, ry, CONTENT_W, rowH).fill(rkBg).stroke(GXL);
        doc.rect(MARGIN, ry, 3, rowH).fill(rkC);
        doc.fillColor(rkC).fontSize(7.5).font('Helvetica-Bold');
        doc.text(rk.severita.toUpperCase(), MARGIN + 8, ry + 9, { width: 60 });
        doc.fillColor(GD).fontSize(9).font('Helvetica-Bold');
        doc.text(safe(rk.descrizione, 200), MARGIN + 72, ry + 9, { width: CONTENT_W - 82 });
        doc.y = ry + rowH + 3;
      });
      doc.moveDown(0.5);
    }

    // Quick fields summary table
    sectionTitle(doc, 'Dati chiave estratti');
    const qRows = [
      ['Valore del perito',  result.valore_perito.status    === 'found' ? safe(result.valore_perito.value    ?? result.valore_perito.summary    ?? '', 120) : 'Non rilevato', result.valore_perito.status    === 'found' ? 'SI' : 'NO'],
      ['Atti antecedenti',   result.atti_antecedenti.status === 'found' ? safe(result.atti_antecedenti.value ?? result.atti_antecedenti.summary ?? '', 120) : 'Non rilevato', result.atti_antecedenti.status === 'found' ? 'SI' : 'NO'],
      ['Costi e oneri',      result.costi_oneri.status      === 'found' ? safe(result.costi_oneri.value      ?? result.costi_oneri.summary      ?? '', 120) : 'Non rilevato', result.costi_oneri.status      === 'found' ? 'SI' : 'NO'],
      ['Difformità',         result.difformita.status       === 'found' ? safe(result.difformita.value       ?? result.difformita.summary       ?? '', 120) : 'Non rilevato', result.difformita.status       === 'found' ? 'SI' : 'NO'],
    ];
    drawTable(doc, ['Campo', 'Estratto dalla perizia', 'Trovato'], [140, CONTENT_W - 185, 45], qRows);

    // 3 riassunto boxes
    if (result.riassunto) {
      sectionTitle(doc, 'Sintesi narrativa');
      const rItems = [
        { label: 'Immobile e valore', text: result.riassunto.paragrafo1 },
        { label: 'Rischi e costi',    text: result.riassunto.paragrafo2 },
        { label: 'Atti e azioni',     text: result.riassunto.paragrafo3 },
      ];
      for (const si of rItems) {
        if (!si.text) continue;
        doc.font('Helvetica').fontSize(9);
        const txtH = doc.heightOfString(safe(si.text, 1000), { width: CONTENT_W - 20 });
        const boxH = txtH + 28;
        needsPage(doc, boxH + 8);
        const sY = doc.y;
        doc.rect(MARGIN, sY, CONTENT_W, boxH).fill(BLUE_L).stroke('#bfdbfe');
        doc.rect(MARGIN, sY, 3, boxH).fill(BLUE);
        doc.fillColor(BLUE).fontSize(7.5).font('Helvetica-Bold');
        doc.text(si.label.toUpperCase(), MARGIN + 10, sY + 8, { width: CONTENT_W - 20 });
        doc.fillColor(GD).fontSize(9.5).font('Helvetica');
        doc.text(safe(si.text, 1000), MARGIN + 10, sY + 20, { width: CONTENT_W - 20 });
        doc.y = sY + boxH + 8;
      }
    }

    // Scenari offerta (if reasoning)
    if (reasoning) {
      sectionTitle(doc, 'Scenari offerta massima');
      const scenari = [
        { label: 'Conservativo', value: reasoning.max_bid_scenari.conservativo, color: GRN },
        { label: 'Base',         value: reasoning.max_bid_scenari.base,         color: BLUE },
        { label: 'Aggressivo',   value: reasoning.max_bid_scenari.aggressivo,   color: ORG },
      ];
      const sW = (CONTENT_W - 16) / 3;
      const scH = 56;
      needsPage(doc, scH + 14);
      const scY = doc.y;
      scenari.forEach((s, i) => {
        const sx = MARGIN + (sW + 8) * i;
        doc.rect(sx, scY, sW, scH).fill(GBG).stroke(GXL);
        doc.rect(sx, scY, sW, 4).fill(s.color);
        doc.fillColor(GL).fontSize(7).font('Helvetica');
        doc.text(s.label.toUpperCase(), sx + 8, scY + 12, { width: sW - 16 });
        doc.fillColor(s.color).fontSize(14).font('Helvetica-Bold');
        doc.text(safe(s.value) || 'N/D', sx + 8, scY + 26, { width: sW - 16 });
      });
      doc.y = scY + scH + 16;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // RESOCONTO SECTIONS (if rc present)
    // ═══════════════════════════════════════════════════════════════════════════

    if (rc) {
      // ─── 2. Profilo immobile ────────────────────────────────────────────────
      doc.addPage();
      chapterBar(doc, '2.', 'Profilo Immobile');
      renderSection(doc, '1', 'Identificazione e localizzazione', rc.identificazione);
      renderSection(doc, '2', 'Stato manutentivo e impianti',     rc.stato_manutentivo);

      // ─── 3. Dati catastali ──────────────────────────────────────────────────
      doc.addPage();
      chapterBar(doc, '3.', 'Dati Catastali');
      renderSection(doc, '1', 'Identificazione catastale', rc.dati_catastali);
      renderSection(doc, '2', 'Superfici',                 rc.superfici);

      // ─── 4. Titolarità ──────────────────────────────────────────────────────
      doc.addPage();
      chapterBar(doc, '4.', 'Titolarità');
      renderSection(doc, '1', 'Proprietà e quote', rc.titolarita);
      if (rc.atti_antecedenti) {
        renderSection(doc, '2', 'Atti antecedenti e storia', rc.atti_antecedenti);
      } else {
        const af = result.atti_antecedenti;
        infoRow(doc, 'Atti antecedenti (estratto)', af.status === 'found' ? (safe(af.value ?? af.summary ?? '')) : 'Non rilevato', af.status === 'found' ? GRN : GL);
      }

      // ─── 5. Vincoli e gravami ───────────────────────────────────────────────
      doc.addPage();
      chapterBar(doc, '5.', 'Vincoli e Gravami');
      renderSection(doc, '1', 'Ipoteche, pignoramenti, servitù', rc.vincoli_ipoteche);

      if (rc.vincoli_dettaglio && rc.vincoli_dettaglio.length > 0) {
        sectionTitle(doc, 'Dettaglio vincoli');
        const vRows = rc.vincoli_dettaglio.map(v => [
          safe(v.tipo, 80),
          safe(v.importo ?? '', 60),
          safe(v.soggetto ?? '', 100),
          safe(v.severita ?? '', 40),
        ]);
        drawTable(doc, ['Tipo', 'Importo', 'Soggetto', 'Severità'], [140, 90, 160, 109], vRows);
      }

      callout(doc, 'info', 'Cosa succede in asta con i vincoli',
        'Le ipoteche iscritte vengono di norma estinte con il ricavato dell\'asta. ' +
        'Servitù e vincoli urbanistici restano invece sull\'immobile. ' +
        'Verifica il piano di riparto con il professionista delegato.');

      // ─── 6. Conformità ──────────────────────────────────────────────────────
      doc.addPage();
      chapterBar(doc, '6.', 'Conformità Urbanistica e Edilizia');
      renderSection(doc, '1', 'Conformità urbanistica', rc.conformita);
      if (rc.difformita) {
        renderSection(doc, '2', 'Difformità e abusi edilizi', rc.difformita);
      } else {
        const df = result.difformita;
        if (df.status === 'found' && (df.value || df.summary)) {
          callout(doc, 'warning', 'Difformità rilevate (estratto)', safe(df.value ?? df.summary ?? ''));
        }
      }

      // ─── 7. Stato occupativo + Spese ────────────────────────────────────────
      doc.addPage();
      chapterBar(doc, '7.', 'Stato Occupativo e Spese');
      renderSection(doc, '1', 'Stato occupativo',         rc.stato_occupativo);
      renderSection(doc, '2', 'Spese condominiali e oneri', rc.spese_condominio);
      const co = result.costi_oneri;
      if (co.status === 'found' && (co.value || co.summary)) {
        infoRow(doc, 'Costi e oneri (estratto)', safe(co.value ?? co.summary ?? ''), ORG);
      }

      // ─── 8. Valutazione economica ────────────────────────────────────────────
      doc.addPage();
      chapterBar(doc, '8.', 'Valutazione Economica');
      renderSection(doc, '1', 'Valutazione e base d\'asta', rc.valutazione);

      if (reasoning) {
        sectionTitle(doc, 'Scenari offerta — dettaglio');
        const scDet = [
          { label: 'Conservativo', value: reasoning.max_bid_scenari.conservativo, color: GRN, note: 'Offerta sicura con margine di ribasso conservativo rispetto al valore stimato.' },
          { label: 'Base',         value: reasoning.max_bid_scenari.base,         color: BLUE, note: 'Offerta allineata al valore di mercato con sconto tipico da asta.' },
          { label: 'Aggressivo',   value: reasoning.max_bid_scenari.aggressivo,   color: ORG,  note: 'Offerta massimizzante — verifica attentamente i rischi prima di usare questo scenario.' },
        ];
        for (const s of scDet) {
          doc.font('Helvetica').fontSize(9);
          const noteH = doc.heightOfString(safe(s.note, 300), { width: CONTENT_W - 20 });
          const bH2   = noteH + 42;
          needsPage(doc, bH2 + 8);
          const sY2 = doc.y;
          doc.rect(MARGIN, sY2, CONTENT_W, bH2).fill(GBG).stroke(GXL);
          doc.rect(MARGIN, sY2, 4, bH2).fill(s.color);
          doc.fillColor(GL).fontSize(7).font('Helvetica');
          doc.text(s.label.toUpperCase(), MARGIN + 12, sY2 + 8, { width: CONTENT_W - 24 });
          doc.fillColor(s.color).fontSize(16).font('Helvetica-Bold');
          doc.text(safe(s.value) || 'N/D', MARGIN + 12, sY2 + 18, { width: CONTENT_W - 24 });
          doc.fillColor(GM).fontSize(9).font('Helvetica');
          doc.text(safe(s.note, 300), MARGIN + 12, sY2 + 34, { width: CONTENT_W - 24 });
          doc.y = sY2 + bH2 + 8;
        }
      }
    } else {
      // No resoconto — show minimal extracted data
      doc.addPage();
      chapterBar(doc, '2.', 'Dati Estratti');
      const flds: { label: string; field: PdfField }[] = [
        { label: 'Valore del Perito',  field: result.valore_perito },
        { label: 'Atti Antecedenti',   field: result.atti_antecedenti },
        { label: 'Costi e Oneri',      field: result.costi_oneri },
        { label: 'Difformità e Abusi', field: result.difformita },
      ];
      for (const { label, field } of flds) {
        const found = field.status === 'found';
        infoRow(doc, label, found ? safe(field.value ?? field.summary ?? '') : 'Non rilevato', found ? GRN : GL);
      }
    }

    // ─── 9. Matrice dei rischi ────────────────────────────────────────────────
    if (risks.length > 0) {
      doc.addPage();
      chapterBar(doc, '9.', 'Matrice dei Rischi');

      // Counter boxes
      const cntW = (CONTENT_W - 12) / 4;
      const cntH = 44;
      const cntY = doc.y;
      const cnts = [
        { label: 'Critica', count: riskCrit, color: RED },
        { label: 'Alta',    count: riskAlta, color: ORG },
        { label: 'Media',   count: riskMed,  color: '#ca8a04' },
        { label: 'Bassa',   count: riskBass, color: GRN },
      ];
      cnts.forEach((c, i) => {
        const cx = MARGIN + (cntW + 4) * i;
        doc.rect(cx, cntY, cntW, cntH).fill(GBG).stroke(GXL);
        doc.rect(cx, cntY, cntW, 4).fill(c.color);
        doc.fillColor(GL).fontSize(7).font('Helvetica');
        doc.text(c.label.toUpperCase(), cx + 8, cntY + 12, { width: cntW - 16 });
        doc.fillColor(c.color).fontSize(18).font('Helvetica-Bold');
        doc.text(String(c.count), cx + 8, cntY + 22, { width: cntW - 16 });
      });
      doc.y = cntY + cntH + 14;

      // Full risk table
      const sorted = [...risks].sort((a, b) => {
        const o: Record<string, number> = { Critica: 0, Alta: 1, Media: 2, Bassa: 3 };
        return (o[a.severita] ?? 3) - (o[b.severita] ?? 3);
      });
      drawTable(
        doc,
        ['Severità', 'Dimensione', 'Descrizione rischio', 'Perché importa'],
        [68, 70, 200, CONTENT_W - 338],
        sorted.map(r => [
          r.severita,
          safe(r.dimensione_impatto ?? '', 30),
          safe(r.descrizione, 150),
          safe(r.perche ?? r.cosa_significa ?? '', 120),
        ]),
      );

      // Detail cards for Alta/Critica risks with cosa_fare
      const detailRisks = sorted.filter(r =>
        (r.severita === 'Alta' || r.severita === 'Critica') && r.cosa_fare,
      );
      if (detailRisks.length > 0) {
        sectionTitle(doc, 'Azioni richieste — rischi critici e alti');
        for (const rk of detailRisks) {
          const rkC  = rk.severita === 'Critica' ? RED : ORG;
          const rkBg = rk.severita === 'Critica' ? RED_L : ORG_L;
          doc.font('Helvetica').fontSize(9);
          const descH = doc.heightOfString(safe(rk.descrizione, 200), { width: CONTENT_W - 24 });
          const fareH = doc.heightOfString(safe(rk.cosa_fare ?? '', 400), { width: CONTENT_W - 24 });
          const rkH   = descH + fareH + 46;
          needsPage(doc, rkH + 8);
          const rkY = doc.y;
          doc.rect(MARGIN, rkY, CONTENT_W, rkH).fill(rkBg).stroke(rkC);
          doc.rect(MARGIN, rkY, 4, rkH).fill(rkC);
          doc.fillColor(rkC).fontSize(7.5).font('Helvetica-Bold');
          const tag = `${rk.severita.toUpperCase()}${rk.dimensione_impatto ? ` — ${rk.dimensione_impatto}` : ''}`;
          doc.text(tag, MARGIN + 12, rkY + 8, { width: CONTENT_W - 24 });
          doc.fillColor(GD).fontSize(10).font('Helvetica-Bold');
          doc.text(safe(rk.descrizione, 200), MARGIN + 12, rkY + 20, { width: CONTENT_W - 24 });
          if (rk.cosa_fare) {
            doc.fillColor(GL).fontSize(7).font('Helvetica-Bold');
            doc.text('COSA FARE', MARGIN + 12, rkY + descH + 26, { width: CONTENT_W - 24 });
            doc.fillColor(GM).fontSize(9).font('Helvetica');
            doc.text(safe(rk.cosa_fare, 400), MARGIN + 12, rkY + descH + 35, { width: CONTENT_W - 24 });
          }
          doc.y = rkY + rkH + 8;
        }
      }
    }

    // ─── 10. Checklist due diligence ──────────────────────────────────────────
    {
      doc.addPage();
      const chNum = risks.length > 0 ? '10.' : '9.';
      chapterBar(doc, chNum, 'Checklist Due Diligence');

      if (reasoning?.checklist && reasoning.checklist.length > 0) {
        sectionTitle(doc, 'Checklist operativa');
        const pc: Record<string, string> = { alta: RED, media: ORG, bassa: BLUE };
        reasoning.checklist.forEach((item, idx) => {
          doc.font('Helvetica').fontSize(9);
          const cTH = doc.heightOfString(safe(item.item, 200), { width: CONTENT_W - 90 });
          const cH  = Math.max(26, cTH + 14);
          needsPage(doc, cH + 3);
          const cY = doc.y;
          const c  = pc[item.priority?.toLowerCase() ?? ''] ?? GL;
          doc.rect(MARGIN, cY, CONTENT_W, cH).fill(idx % 2 === 0 ? GBG : WHITE).stroke(GXL);
          doc.rect(MARGIN, cY, 3, cH).fill(c);
          doc.rect(MARGIN + 8, cY + (cH - 11) / 2, 11, 11).stroke(GL);
          if (item.done) {
            doc.fillColor(GRN).fontSize(8).font('Helvetica-Bold');
            doc.text('✓', MARGIN + 11, cY + (cH - 9) / 2);
          }
          doc.fillColor(GD).fontSize(9).font('Helvetica');
          doc.text(safe(item.item, 200), MARGIN + 28, cY + 8, { width: CONTENT_W - 90 });
          doc.fillColor(c).fontSize(7).font('Helvetica-Bold');
          doc.text((item.priority ?? '').toUpperCase(), PAGE_W - MARGIN - 45, cY + (cH - 8) / 2, { width: 40, align: 'right' });
          doc.y = cY + cH + 2;
        });
        doc.moveDown(0.8);
      }

      if (rc?.checklist && rc.checklist.length > 0) {
        sectionTitle(doc, 'Documenti da richiedere / verificare');
        rc.checklist.forEach((item, idx) => {
          doc.font('Helvetica').fontSize(9);
          const cTH = doc.heightOfString(safe(item, 200), { width: CONTENT_W - 40 });
          const cH  = Math.max(24, cTH + 12);
          needsPage(doc, cH + 2);
          const cY = doc.y;
          doc.rect(MARGIN, cY, CONTENT_W, cH).fill(idx % 2 === 0 ? GBG : WHITE).stroke(GXL);
          doc.rect(MARGIN + 8, cY + (cH - 11) / 2, 11, 11).stroke(GL);
          doc.fillColor(GD).fontSize(9).font('Helvetica');
          doc.text(`${idx + 1}. ${safe(item, 200)}`, MARGIN + 28, cY + 7, { width: CONTENT_W - 40 });
          doc.y = cY + cH + 2;
        });
      }

      if ((!reasoning?.checklist || reasoning.checklist.length === 0) &&
          (!rc?.checklist || rc.checklist.length === 0)) {
        callout(doc, 'note', '', 'Nessuna checklist disponibile per questa analisi.');
      }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // FOOTER — 3px top accent + page numbers on ALL pages (including overflow)
    // ═══════════════════════════════════════════════════════════════════════════

    const range = doc.bufferedPageRange();
    const total = range.count;

    for (let i = 0; i < total; i++) {
      doc.switchToPage(range.start + i);
      // 3px NAVY top accent
      doc.rect(0, 0, PAGE_W, 3).fill(NAVY);
      // Bottom line
      doc.rect(0, PAGE_H - FOOTER_H, PAGE_W, 1).fill(NAVY);
      // Footer text
      doc.fillColor(GL).fontSize(7.5).font('Helvetica');
      doc.text(
        `Perizia Analyzer  ·  ${now}  ·  Pagina ${i + 1} di ${total}`,
        MARGIN, PAGE_H - FOOTER_H + 8,
        { width: CONTENT_W, align: 'center' },
      );
    }

    doc.end();
  });
}
