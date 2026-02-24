import { FullExtractionResult, DocumentInfo } from '@/types';

/**
 * Generate JSON export of extraction results.
 */
export function exportJSON(doc: DocumentInfo, result: FullExtractionResult): string {
  return JSON.stringify({
    documento: {
      id: doc.id,
      filename: doc.filename,
      pagine: doc.pages,
      dataCaricamento: doc.uploadedAt,
    },
    estrazione: {
      attiAntecedenti: result.antecedentActs,
      costiOneri: result.legalCosts,
      difformita: result.irregularities,
      valorePerito: result.expertValue,
    },
    riassuntoOperativo: {
      quadroBene: result.summaryAsset,
      rischiCosti: result.summaryRisks,
      azioniConsigliate: result.summaryActions,
    },
  }, null, 2);
}

/**
 * Generate CSV export of extraction results.
 */
export function exportCSV(doc: DocumentInfo, result: FullExtractionResult): string {
  const rows: string[][] = [];
  const headers = ['Categoria', 'Campo', 'Valore', 'Importo', 'Confidenza', 'Pagina', 'Note'];
  rows.push(headers);

  // Atti antecedenti
  for (const act of result.antecedentActs) {
    rows.push([
      'Atti Antecedenti',
      act.tipoAtto,
      act.sintesi.slice(0, 200),
      '',
      String(act.confidence),
      act.citations[0]?.page?.toString() || '',
      act.data || '',
    ]);
  }

  // Costi
  for (const cost of result.legalCosts) {
    rows.push([
      'Costi/Oneri',
      cost.descrizione.slice(0, 200),
      cost.importoRaw || '',
      cost.importo?.toString() || '',
      String(cost.confidence),
      cost.citations[0]?.page?.toString() || '',
      cost.ultimiDueAnni ? 'Ultimi 2 anni' : '',
    ]);
  }

  // Difformità
  for (const irr of result.irregularities) {
    rows.push([
      'Difformità',
      irr.categoria,
      irr.descrizione.slice(0, 200),
      irr.costiRaw || '',
      String(irr.confidence),
      irr.citations[0]?.page?.toString() || '',
      `Gravità: ${irr.gravita}`,
    ]);
  }

  // Valore
  rows.push([
    'Valore Perito',
    result.expertValue.tipo,
    result.expertValue.valoreRaw || '',
    result.expertValue.valore?.toString() || '',
    String(result.expertValue.confidence),
    result.expertValue.citations[0]?.page?.toString() || '',
    '',
  ]);

  // Escape CSV
  return rows.map((row) =>
    row.map((cell) => `"${cell.replace(/"/g, '""')}"`)
      .join(',')
  ).join('\n');
}

/**
 * Generate HTML "Scheda Asta" for printing.
 */
export function exportHTML(doc: DocumentInfo, result: FullExtractionResult): string {
  const confidenceBadge = (c: number) => {
    const color = c >= 0.7 ? '#16a34a' : c >= 0.4 ? '#ca8a04' : '#dc2626';
    const label = c >= 0.7 ? 'Alta' : c >= 0.4 ? 'Media' : 'Bassa';
    return `<span style="background:${color};color:white;padding:2px 8px;border-radius:12px;font-size:12px;">${label} (${Math.round(c * 100)}%)</span>`;
  };

  const formatAmount = (v?: number) => {
    if (!v) return '—';
    return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(v);
  };

  return `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Scheda Asta - ${doc.filename}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', system-ui, sans-serif; color: #1a1a1a; max-width: 800px; margin: 0 auto; padding: 24px; }
    h1 { font-size: 22px; margin-bottom: 4px; color: #1e40af; }
    h2 { font-size: 16px; margin: 20px 0 8px; padding-bottom: 4px; border-bottom: 2px solid #1e40af; color: #1e40af; }
    h3 { font-size: 14px; margin: 12px 0 4px; }
    .meta { color: #666; font-size: 13px; margin-bottom: 16px; }
    .section { margin-bottom: 16px; }
    .item { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; margin-bottom: 8px; }
    .item-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
    .item-title { font-weight: 600; }
    .item-body { font-size: 14px; color: #374151; }
    .amount { font-weight: 700; color: #1e40af; font-size: 18px; }
    .summary { background: #eff6ff; border-left: 4px solid #1e40af; padding: 12px; margin-bottom: 8px; border-radius: 0 8px 8px 0; }
    .summary p { font-size: 14px; line-height: 1.5; }
    .citation { font-size: 12px; color: #6b7280; font-style: italic; margin-top: 4px; }
    .warning { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 8px 12px; border-radius: 0 8px 8px 0; font-size: 13px; }
    .severity-alta { border-left: 4px solid #dc2626; }
    .severity-media { border-left: 4px solid #f59e0b; }
    .severity-bassa { border-left: 4px solid #16a34a; }
    @media print { body { padding: 12px; } .no-print { display: none; } }
    .footer { margin-top: 24px; padding-top: 12px; border-top: 1px solid #e2e8f0; font-size: 11px; color: #9ca3af; }
  </style>
</head>
<body>
  <h1>📋 Scheda Asta</h1>
  <div class="meta">${doc.filename} • ${doc.pages} pagine • Elaborato il ${new Date(doc.uploadedAt).toLocaleDateString('it-IT')}</div>

  <!-- Riassunto Operativo -->
  <h2>Riassunto Operativo</h2>
  <div class="summary"><p><strong>Quadro del bene & stima:</strong> ${result.summaryAsset}</p></div>
  <div class="summary"><p><strong>Rischi / difformità & costi:</strong> ${result.summaryRisks}</p></div>
  <div class="summary"><p><strong>Atti antecedenti & azioni consigliate:</strong> ${result.summaryActions}</p></div>

  <!-- Valore del Perito -->
  <h2>💰 Valore del Perito</h2>
  <div class="item">
    <div class="item-header">
      <span class="amount">${formatAmount(result.expertValue.valore)}</span>
      ${confidenceBadge(result.expertValue.confidence)}
    </div>
    <div class="item-body">
      <p>Tipo: ${result.expertValue.tipo}</p>
      ${result.expertValue.range ? `<p>Range: ${formatAmount(result.expertValue.range.min)} - ${formatAmount(result.expertValue.range.max)}</p>` : ''}
      ${result.expertValue.citations[0] ? `<p class="citation">📄 Pag. ${result.expertValue.citations[0].page}: "${result.expertValue.citations[0].snippet.slice(0, 150)}..."</p>` : ''}
    </div>
  </div>

  <!-- Atti Antecedenti -->
  <h2>📜 Atti Antecedenti</h2>
  ${result.antecedentActs.map((act) => `
  <div class="item">
    <div class="item-header">
      <span class="item-title">${act.tipoAtto}</span>
      ${confidenceBadge(act.confidence)}
    </div>
    <div class="item-body">
      <p>${act.sintesi.slice(0, 300)}</p>
      ${act.data ? `<p><strong>Data:</strong> ${act.data}</p>` : ''}
      ${act.citations[0] ? `<p class="citation">📄 Pag. ${act.citations[0].page}</p>` : ''}
    </div>
  </div>`).join('')}

  <!-- Costi / Oneri -->
  <h2>💸 Costi di Legge / Oneri</h2>
  ${result.legalCosts.map((cost) => `
  <div class="item">
    <div class="item-header">
      <span class="item-title">${cost.importoRaw || 'Importo non specificato'}</span>
      ${confidenceBadge(cost.confidence)}
    </div>
    <div class="item-body">
      <p>${cost.descrizione.slice(0, 300)}</p>
      ${cost.ultimiDueAnni ? '<p class="warning">⚠️ Riferimento "ultimi 2 anni"</p>' : ''}
      ${cost.citations[0] ? `<p class="citation">📄 Pag. ${cost.citations[0].page}</p>` : ''}
    </div>
  </div>`).join('')}

  <!-- Difformità -->
  <h2>⚠️ Difformità / Abusi</h2>
  ${result.irregularities.map((irr) => `
  <div class="item severity-${irr.gravita}">
    <div class="item-header">
      <span class="item-title">${irr.categoria}</span>
      ${confidenceBadge(irr.confidence)}
    </div>
    <div class="item-body">
      <p>${irr.descrizione.slice(0, 300)}</p>
      <p><strong>Gravità:</strong> ${irr.gravita.toUpperCase()} | <strong>Impatto:</strong> ${irr.impatto}</p>
      ${irr.costiRaw ? `<p><strong>Costi stimati:</strong> ${irr.costiRaw}</p>` : ''}
      ${irr.citations[0] ? `<p class="citation">📄 Pag. ${irr.citations[0].page}</p>` : ''}
    </div>
  </div>`).join('')}

  <div class="footer">
    Generato da Perizia Analyzer • ${new Date().toLocaleDateString('it-IT')} • Verifica sempre i dati con la perizia originale
  </div>
</body>
</html>`;
}
