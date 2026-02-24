import { ExtractionFields, OperativeSummary } from '@/types';

/**
 * Generate a deterministic 3-paragraph operative summary from extracted fields.
 * No LLM required — uses only the structured data.
 */
export function generateDeterministicSummary(fields: ExtractionFields): OperativeSummary {
  const fmt = (v?: number) => {
    if (!v) return null;
    return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(v);
  };

  // ── 1. Quadro del bene & stima ──
  const assetParts: string[] = [];

  if (fields.expertValue.confidence > 0 && fields.expertValue.valore) {
    assetParts.push(
      `Il valore stimato dal perito è ${fmt(fields.expertValue.valore)} (${fields.expertValue.tipo}).`
    );
    if (fields.expertValue.range) {
      assetParts.push(
        `Range di valori individuato: da ${fmt(fields.expertValue.range.min)} a ${fmt(fields.expertValue.range.max)}.`
      );
    }
    if (fields.expertValue.dataContesto) {
      assetParts.push(`Data di riferimento: ${fields.expertValue.dataContesto}.`);
    }
    if (fields.expertValue.citations[0]) {
      assetParts.push(`(Rif. pag. ${fields.expertValue.citations[0].page})`);
    }
  } else {
    assetParts.push(
      'Valore del perito: NON RILEVATO. Verificare manualmente nel PDF i capitoli relativi alla determinazione del valore, stima, o prezzo base.'
    );
  }

  // ── 2. Rischi, difformità & costi ──
  const riskParts: string[] = [];

  // Irregularities
  const foundIrr = fields.irregularities.filter(i => i.confidence > 0);
  if (foundIrr.length > 0) {
    const highSeverity = foundIrr.filter(i => i.gravita === 'alta');
    const medSeverity = foundIrr.filter(i => i.gravita === 'media');

    if (highSeverity.length > 0) {
      riskParts.push(
        `ATTENZIONE: ${highSeverity.length} difformità di gravità ALTA rilevate: ${highSeverity.map(i => i.categoria).join(', ')}.`
      );
    }
    if (medSeverity.length > 0) {
      riskParts.push(
        `${medSeverity.length} difformità di gravità media: ${medSeverity.map(i => i.categoria).join(', ')}.`
      );
    }

    for (const irr of foundIrr.slice(0, 3)) {
      const desc = irr.descrizione.slice(0, 150).trim();
      riskParts.push(`- ${irr.categoria}: ${desc}${irr.costiRaw ? ` (costi stimati: ${irr.costiRaw})` : ''}`);
    }
  } else {
    riskParts.push(
      'Difformità/abusi: NON RILEVATI nel testo estratto. Verificare manualmente i capitoli: conformità urbanistica, catastale, stato legittimo, agibilità.'
    );
  }

  // Legal costs
  const foundCosts = fields.legalCosts.filter(c => c.confidence > 0);
  if (foundCosts.length > 0) {
    const totalAmounts = foundCosts.filter(c => c.importo).map(c => c.importo!);
    if (totalAmounts.length > 0) {
      riskParts.push(
        `\nOneri/costi rilevati: ${foundCosts.length} voci per un totale indicativo di ${fmt(totalAmounts.reduce((a, b) => a + b, 0))}.`
      );
    } else {
      riskParts.push(`\nOneri/costi: ${foundCosts.length} voci rilevate (importi da verificare).`);
    }
    const ultimi2 = foundCosts.filter(c => c.ultimiDueAnni);
    if (ultimi2.length > 0) {
      riskParts.push('Presente riferimento a "ultimi 2 anni" (spese condominiali arretrate).');
    }
  } else {
    riskParts.push(
      '\nCosti/oneri: NON RILEVATI. Verificare i capitoli: oneri a carico, spese condominiali, arretrati.'
    );
  }

  // ── 3. Atti antecedenti & azioni consigliate ──
  const actionParts: string[] = [];

  const foundActs = fields.antecedentActs.filter(a => a.confidence > 0);
  if (foundActs.length > 0) {
    actionParts.push(`Atti antecedenti individuati: ${foundActs.length}.`);
    for (const act of foundActs.slice(0, 3)) {
      actionParts.push(`- ${act.tipoAtto}${act.data ? ` (${act.data})` : ''}`);
    }
  } else {
    actionParts.push(
      'Atti antecedenti: NON RILEVATI. Verificare: provenienza, formalità pregiudizievoli, iscrizioni, trascrizioni.'
    );
  }

  // Checklist operativa
  actionParts.push('\nChecklist operativa:');

  const checks: string[] = [];
  if (fields.expertValue.confidence === 0) {
    checks.push('[ ] Verificare il valore di stima/prezzo base nel PDF');
  } else {
    checks.push('[x] Valore del perito individuato');
  }

  if (foundIrr.length === 0) {
    checks.push('[ ] Controllare conformità urbanistica e catastale');
  } else {
    checks.push(`[x] ${foundIrr.length} difformità individuate — verificare impatto`);
  }

  if (foundCosts.length === 0) {
    checks.push('[ ] Verificare spese condominiali e oneri a carico');
  } else {
    checks.push(`[x] Costi/oneri individuati`);
  }

  if (foundActs.length === 0) {
    checks.push('[ ] Verificare atti di provenienza e formalità pregiudizievoli');
  } else {
    checks.push('[x] Atti antecedenti individuati');
  }

  checks.push('[ ] Confrontare dati estratti con il documento originale');

  actionParts.push(...checks);

  return {
    summaryAsset: assetParts.join(' '),
    summaryRisks: riskParts.join('\n'),
    summaryActions: actionParts.join('\n'),
  };
}
