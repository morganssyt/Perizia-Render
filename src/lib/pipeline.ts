import { parsePdf, isLikelyScanned, getFullText, getTextCoverage } from './pdf-parser';
import {
  extractAntecedentActs,
  extractLegalCosts,
  extractIrregularities,
  extractExpertValue,
} from './extraction/field-extractors';
import { findSectionCandidates } from './extraction/section-finder';
import { generateDeterministicSummary } from './summary';
import { OpenAIProvider } from './llm/openai';
import { PassthroughProvider } from './llm/provider';
import { extractWithVision } from './llm/vision-extractor';
import { pdfToImages } from './pdf-to-images';
import { prisma } from './db';
import { jobQueue } from './job-queue';
import { LLMProvider, DebugInfo, ParsedPdf } from '@/types';
import { KEYWORDS, FIELD_TYPES, FieldType } from './extraction/keywords';
import fs from 'fs/promises';

function getLLMProvider(): LLMProvider {
  if (process.env.OPENAI_API_KEY) {
    return new OpenAIProvider();
  }
  return new PassthroughProvider();
}

/**
 * Build DebugInfo from parsed PDF and extraction results.
 */
function buildDebugInfo(
  parsed: ParsedPdf,
  scanResult: { isScanned: boolean; reason: string; textCoverage: number; avgCharsPerPage: number },
  coverage: { avgCharsPerPage: number; pagesWithText: number; totalChars: number; perPage: { page: number; chars: number; hasText: boolean }[] },
  fields: { antecedentActs: any[]; legalCosts: any[]; irregularities: any[]; expertValue: any },
  warnings: string[]
): DebugInfo {
  const fullText = parsed.pages.map((p) => p.text).join('\n\n');

  // Keyword match analysis per field
  const keywordMatches = FIELD_TYPES.map((field: FieldType) => {
    const sections = findSectionCandidates(parsed.pages, field, 10);
    const matched = sections.flatMap((s) => s.matchedKeywords).filter((v, i, a) => a.indexOf(v) === i);
    return {
      field,
      sectionsFound: sections.length,
      matchedKeywords: matched,
      sampleText: sections[0]?.text.slice(0, 300) ?? '',
    };
  });

  const extractionWarnings = [...warnings];

  if (fields.antecedentActs.length === 1 && fields.antecedentActs[0].confidence === 0) {
    extractionWarnings.push(
      'Atti antecedenti: 0 sezioni trovate. Cerca: ' + (KEYWORDS.antecedentActs as readonly string[]).slice(0, 8).join(', ')
    );
  }
  if (fields.legalCosts.length === 1 && fields.legalCosts[0].confidence === 0) {
    extractionWarnings.push(
      'Costi/oneri: 0 sezioni trovate. Cerca: ' + (KEYWORDS.legalCosts as readonly string[]).slice(0, 8).join(', ')
    );
  }
  if (fields.irregularities.length === 1 && fields.irregularities[0].confidence === 0) {
    extractionWarnings.push(
      'Difformità: 0 sezioni trovate. Cerca: ' + (KEYWORDS.irregularities as readonly string[]).slice(0, 8).join(', ')
    );
  }
  if (fields.expertValue.confidence === 0) {
    extractionWarnings.push(
      'Valore perito: 0 sezioni trovate. Cerca: ' + (KEYWORDS.expertValue as readonly string[]).slice(0, 8).join(', ')
    );
  }

  return {
    textCoverage: scanResult.textCoverage,
    avgCharsPerPage: coverage.avgCharsPerPage,
    totalPages: parsed.totalPages,
    pagesWithText: coverage.pagesWithText,
    totalChars: coverage.totalChars,
    firstWords: fullText.slice(0, 600).trim(),
    isProbablyScan: scanResult.isScanned,
    scanReason: scanResult.reason,
    keywordMatches,
    perPage: coverage.perPage.map((p) => ({
      page: p.page,
      chars: p.chars,
      hasText: p.hasText,
      firstWords: parsed.pages.find((pp) => pp.page === p.page)?.text.slice(0, 80) ?? '',
    })),
    extractionWarnings,
  };
}

/**
 * Full extraction pipeline:
 * 1. Parse PDF → per-page text
 * 2. Scan detection
 * 3. Heuristics: keyword + regex extraction for 4 fields
 * 4. Generate summaries
 * 5. Build debug info
 * 6. Save results + logs to DB
 */
export async function runPipeline(documentId: string, filePath: string): Promise<void> {
  jobQueue.create(documentId);
  const logs: string[] = [];

  const log = (msg: string) => {
    const entry = `[${new Date().toISOString()}] ${msg}`;
    logs.push(entry);
    console.log(`[pipeline:${documentId.slice(0, 8)}] ${msg}`);
  };

  try {
    // Step 1: Parse PDF
    jobQueue.updateProgress(documentId, 10);
    log('Inizio parsing PDF...');
    const buffer = await fs.readFile(filePath);
    const parsed = await parsePdf(buffer);
    log(`PDF parsato: ${parsed.totalPages} pagine totali, ${parsed.pages.length} pagine con testo estratto.`);

    const coverage = getTextCoverage(parsed);
    log(`Copertura: avg ${Math.round(coverage.avgCharsPerPage)} car./pag, ${coverage.pagesWithText}/${parsed.pages.length} pagine con testo, ${coverage.totalChars} caratteri totali.`);

    // Step 2: Scan detection
    const scanResult = isLikelyScanned(parsed);

    await prisma.document.update({
      where: { id: documentId },
      data: { pages: parsed.totalPages, status: 'processing' },
    });

    let fields: { antecedentActs: any[]; legalCosts: any[]; irregularities: any[]; expertValue: any };
    let summary: { summaryAsset: string; summaryRisks: string; summaryActions: string };
    const warnings: string[] = [];

    if (scanResult.isScanned && process.env.OPENAI_API_KEY) {
      // ── Vision path ──
      log(`PDF scansionato/protetto: ${scanResult.reason}`);
      log('Avvio estrazione visione (GPT-4 Vision)...');
      jobQueue.updateProgress(documentId, 20);

      const { images: rawImages } = await pdfToImages(buffer, { maxPages: 20, scale: 1.2 });
      const pageImages = rawImages.map((img) => img.base64);
      log(`${pageImages.length} pagine convertite in immagini.`);
      jobQueue.updateProgress(documentId, 40);

      const filename = filePath.split(/[\\/]/).pop() || 'perizia.pdf';
      const visionResult = await extractWithVision(pageImages, filename);
      log('Estrazione visione completata.');

      fields = {
        antecedentActs: visionResult.antecedentActs,
        legalCosts: visionResult.legalCosts,
        irregularities: visionResult.irregularities,
        expertValue: visionResult.expertValue,
      };
      summary = {
        summaryAsset: visionResult.summaryAsset,
        summaryRisks: visionResult.summaryRisks,
        summaryActions: visionResult.summaryActions,
      };
      jobQueue.updateProgress(documentId, 90);

    } else if (scanResult.isScanned) {
      // ── No API key ──
      log(`Scansione rilevata e nessuna API key: ${scanResult.reason}`);
      await prisma.document.update({
        where: { id: documentId },
        data: { status: 'error', errorMessage: scanResult.reason },
      });
      jobQueue.fail(documentId, scanResult.reason);
      return;

    } else {
      // ── Text path ──
      log(`Text coverage: ${Math.round(scanResult.textCoverage * 100)}%, media ${Math.round(scanResult.avgCharsPerPage)} car./pag.`);
      if (parsed.pages.length > 0) {
        log(`Prime 200 chars pagina 1: "${parsed.pages[0].text.slice(0, 200).replace(/\n/g, '↵')}"`);
      }

      jobQueue.updateProgress(documentId, 30);
      log('Estrazione atti antecedenti...');
      const antecedentActs = extractAntecedentActs(parsed.pages);
      const actsFound = antecedentActs.filter((a) => a.confidence > 0).length;
      log(`Atti antecedenti: ${actsFound} trovati (${antecedentActs.length} totali), max conf=${Math.max(...antecedentActs.map((a) => a.confidence)).toFixed(2)}`);
      if (actsFound === 0) warnings.push('antecedentActs: nessuna sezione trovata');

      jobQueue.updateProgress(documentId, 45);
      log('Estrazione costi/oneri...');
      const legalCosts = extractLegalCosts(parsed.pages);
      const costsFound = legalCosts.filter((c) => c.confidence > 0).length;
      log(`Costi/oneri: ${costsFound} trovati (${legalCosts.length} totali)`);
      if (costsFound === 0) warnings.push('legalCosts: nessuna sezione trovata');

      jobQueue.updateProgress(documentId, 55);
      log('Estrazione difformità...');
      const irregularities = extractIrregularities(parsed.pages);
      const irrFound = irregularities.filter((i) => i.confidence > 0).length;
      log(`Difformità: ${irrFound} trovate (${irregularities.length} totali)`);
      if (irrFound === 0) warnings.push('irregularities: nessuna sezione trovata');

      jobQueue.updateProgress(documentId, 65);
      log('Estrazione valore perito...');
      const expertValue = extractExpertValue(parsed.pages);
      log(`Valore: "${expertValue.valoreRaw || 'N/A'}", tipo="${expertValue.tipo}", conf=${expertValue.confidence.toFixed(2)}`);
      if (expertValue.confidence === 0) warnings.push('expertValue: nessuna sezione trovata');

      fields = { antecedentActs, legalCosts, irregularities, expertValue };

      // If everything is empty, log text sample for diagnosis
      const allEmpty = actsFound === 0 && costsFound === 0 && irrFound === 0 && expertValue.confidence === 0;
      if (allEmpty && coverage.totalChars > 0) {
        const sample = parsed.pages.map((p) => p.text).join('\n').slice(0, 1000);
        log(`ATTENZIONE tutte le voci sono vuote. Campione testo estratto:\n${sample}`);
        warnings.push('TUTTE LE VOCI VUOTE: PDF potrebbe usare terminologia non coperta dai keywords o avere problemi di encoding');
      }

      // Step 4: Summary
      jobQueue.updateProgress(documentId, 75);
      log('Generazione riassunto...');
      const deterministicSummary = generateDeterministicSummary(fields);
      const provider = getLLMProvider();

      if (process.env.OPENAI_API_KEY) {
        try {
          const fullText = getFullText(parsed);
          summary = await provider.generateSummary(fields, fullText);
          log('Riassunto LLM generato.');
        } catch (err) {
          log(`LLM fallito: ${err instanceof Error ? err.message : 'errore'}. Uso riassunto deterministico.`);
          summary = deterministicSummary;
        }
      } else {
        log('Nessuna API key LLM. Uso riassunto deterministico.');
        summary = deterministicSummary;
      }

      jobQueue.updateProgress(documentId, 90);
    }

    // Step 5: Debug info
    log('Costruzione debug info...');
    const debugInfo = buildDebugInfo(parsed, scanResult, coverage, fields, warnings);

    // Step 6: Save
    log('Salvataggio risultati in DB...');
    const logsStr = logs.join('\n');

    await prisma.extractionResult.upsert({
      where: { documentId },
      create: {
        documentId,
        antecedentActs: JSON.stringify(fields.antecedentActs),
        legalCosts: JSON.stringify(fields.legalCosts),
        irregularities: JSON.stringify(fields.irregularities),
        expertValue: JSON.stringify(fields.expertValue),
        summaryAsset: summary.summaryAsset,
        summaryRisks: summary.summaryRisks,
        summaryActions: summary.summaryActions,
        debugInfo: JSON.stringify(debugInfo),
        pipelineLogs: logsStr,
      },
      update: {
        antecedentActs: JSON.stringify(fields.antecedentActs),
        legalCosts: JSON.stringify(fields.legalCosts),
        irregularities: JSON.stringify(fields.irregularities),
        expertValue: JSON.stringify(fields.expertValue),
        summaryAsset: summary.summaryAsset,
        summaryRisks: summary.summaryRisks,
        summaryActions: summary.summaryActions,
        debugInfo: JSON.stringify(debugInfo),
        pipelineLogs: logsStr,
      },
    });

    await prisma.document.update({
      where: { id: documentId },
      data: { status: 'completed' },
    });

    log('Pipeline completata con successo.');
    jobQueue.complete(documentId);

  } catch (error) {
    const message = error instanceof Error ? error.message : 'Errore sconosciuto';
    log(`ERRORE PIPELINE: ${message}`);
    if (error instanceof Error && error.stack) {
      log(error.stack.slice(0, 500));
    }
    console.error(`Pipeline failed for ${documentId}:`, error);

    await prisma.document.update({
      where: { id: documentId },
      data: { status: 'error', errorMessage: message },
    }).catch(() => {});

    // Try to persist logs on failure
    try {
      await prisma.extractionResult.upsert({
        where: { documentId },
        create: {
          documentId,
          pipelineLogs: logs.join('\n'),
          debugInfo: JSON.stringify({ extractionWarnings: [`ERRORE FATALE: ${message}`] }),
        },
        update: {
          pipelineLogs: logs.join('\n'),
        },
      });
    } catch { /* ignore */ }

    jobQueue.fail(documentId, message);
  }
}
