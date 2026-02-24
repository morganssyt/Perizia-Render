/**
 * Perizia Analyzer — BullMQ Worker v2
 *
 * Pipeline (triple-via extraction):
 *  1. Download PDF from S3
 *  2a. Try PDF text-layer extraction via pdf-parse (fast, free)
 *  2b. If text-layer insufficient → run AWS Textract async
 *  3. Score both sources with "real content" heuristics → pick best
 *  4. Anti-watermark filter (frequency-based, >70% threshold — FIX from 35%)
 *  5. Log diagnostic: top repeated lines, pre/post filter sample, content score
 *  6. Claude Haiku 2-step (extraction + reasoning)
 *  7. Save result to DB (Job + Document)
 */

import 'dotenv/config';
import { Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { PrismaClient } from '@prisma/client';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { runTextract } from './textract';
import { removeWatermarkLines } from './watermark';
import { analyzeWithClaude } from './claude';

// ── Config ──────────────────────────────────────────────────────────────────

const REDIS_URL   = process.env.REDIS_URL ?? '';
const BUCKET      = process.env.S3_BUCKET ?? '';
const REGION      = process.env.AWS_REGION ?? 'eu-central-1';
const ACCESS_KEY  = process.env.AWS_ACCESS_KEY_ID ?? '';
const SECRET_KEY  = process.env.AWS_SECRET_ACCESS_KEY ?? '';
const QUEUE_NAME  = 'perizia-analysis';

// Minimum real-content score to trust pdf-parse and skip Textract
const PDF_PARSE_MIN_SCORE = 5;

if (!REDIS_URL)  { console.error('FATAL: REDIS_URL not set'); process.exit(1); }
if (!BUCKET)     { console.error('FATAL: S3_BUCKET not set'); process.exit(1); }
if (!ACCESS_KEY) { console.error('FATAL: AWS_ACCESS_KEY_ID not set'); process.exit(1); }

const prisma = new PrismaClient();

const connection = new IORedis(REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck:     false,
});

const s3 = new S3Client({
  region: REGION,
  credentials: { accessKeyId: ACCESS_KEY, secretAccessKey: SECRET_KEY },
});

// ── S3 download ───────────────────────────────────────────────────────────────

async function downloadFromS3(key: string): Promise<Buffer> {
  const resp = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
  if (!resp.Body) throw new Error('S3 empty body');
  const chunks: Uint8Array[] = [];
  // @ts-expect-error NodeJS stream
  for await (const chunk of resp.Body) chunks.push(chunk);
  return Buffer.concat(chunks);
}

// ── Real-content scoring ──────────────────────────────────────────────────────
// Counts entity hits in the text. Higher score = more real perizia content.

const ENTITY_PATTERNS: RegExp[] = [
  /\bfoglio\b/i,
  /\bparticella\b/i,
  /\bsubalterno\b/i,
  /\bcatasto\b/i,
  /\bmappale\b/i,
  /€\s*[\d.,]+/,               // monetary values
  /\d+[.,]\d+\s*m[q²2]/i,     // surface area
  /\bstima\b/i,
  /\bvalore\b/i,
  /\bperito\b|\bctu\b/i,
  /\bsuperficie\b/i,
  /\bdescriz/i,
  /\bpremessa\b/i,
  /\boccupaz/i,
  /\bregolarità\s+urbanistica\b|\bregolarità\s+edilizia\b/i,
  /\bvinc[oh]/i,
  /\bcomune\s+di\b/i,
  /\bprovinc/i,
  /\bvia\s+\w+\s+\d+/i,       // street address
  /\bprocedura\s+esecutiva\b/i,
  /\bpignoramento\b/i,
  /\boneri\b/i,
  /\bcondomin/i,
];

interface ContentScore {
  score: number;
  hits:  string[];
  totalChars: number;
  numericDensity: number;
}

function scoreRealContent(pages: string[]): ContentScore {
  const fullText     = pages.join('\n');
  const totalChars   = fullText.length;
  const hits: string[] = [];

  for (const re of ENTITY_PATTERNS) {
    if (re.test(fullText)) {
      hits.push(re.source.slice(0, 40));
    }
  }

  const digits         = (fullText.match(/\d/g) ?? []).length;
  const numericDensity = totalChars > 0 ? digits / totalChars : 0;

  // Bonus points for high numeric density (addresses, values, cadastral codes)
  const score = hits.length + (numericDensity > 0.04 ? 2 : 0) + (numericDensity > 0.08 ? 2 : 0);

  return { score, hits, totalChars, numericDensity };
}

// ── PDF text-layer extraction (attempt 1 of triple-via) ──────────────────────

async function tryPdfParse(buffer: Buffer): Promise<string[]> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
    const raw = require('pdf-parse');
    const fn  = raw.default ?? raw;
    const data = await fn(buffer);

    if (!data.text || data.text.length < 200) {
      console.log(`[pdf-parse] text too short (${data.text?.length ?? 0} chars) — skipping`);
      return [];
    }

    // Split by form-feed (\f) to get per-page text
    const chunks: string[] = data.text
      .split('\f')
      .map((c: string) => c.trim())
      .filter((c: string) => c.length > 20);

    const pages = chunks.length > 0 ? chunks : [data.text];
    console.log(`[pdf-parse] OK pages=${pages.length} totalChars=${data.text.length}`);
    return pages;
  } catch (e) {
    console.warn(`[pdf-parse] failed: ${e instanceof Error ? e.message : String(e)}`);
    return [];
  }
}

// ── Job processor ─────────────────────────────────────────────────────────────

interface JobData {
  jobId:      string;
  documentId: string;
  s3Key:      string;
  filename:   string;
}

async function processJob(job: Job<JobData>): Promise<void> {
  const { jobId, documentId, s3Key, filename } = job.data;
  const t0 = Date.now();
  console.log(`[worker] START jobId=${jobId} docId=${documentId} file="${filename}"`);

  // ── Mark as processing ────────────────────────────────────────────────────
  await prisma.job.update({
    where: { id: jobId },
    data:  { status: 'processing', progress: 5 },
  });
  await prisma.document.update({
    where: { id: documentId },
    data:  { status: 'processing' },
  });

  // ── Download PDF ──────────────────────────────────────────────────────────
  console.log(`[worker] Downloading s3Key=${s3Key}`);
  const pdfBuffer = await downloadFromS3(s3Key);
  console.log(`[worker] Downloaded ${pdfBuffer.length} bytes (+${Date.now() - t0}ms)`);

  await prisma.job.update({ where: { id: jobId }, data: { progress: 15 } });

  // ── TRIPLE-VIA: Attempt 1 — PDF text layer (pdf-parse) ───────────────────
  console.log(`[worker] Triple-via: attempt 1 — pdf-parse text layer`);
  const pdfParsePages = await tryPdfParse(pdfBuffer);
  let pdfParseScore: ContentScore | null = null;

  if (pdfParsePages.length > 0) {
    pdfParseScore = scoreRealContent(pdfParsePages);
    console.log(
      `[worker] pdf-parse content score=${pdfParseScore.score} ` +
      `hits=[${pdfParseScore.hits.slice(0, 8).join(', ')}] ` +
      `chars=${pdfParseScore.totalChars} numDensity=${pdfParseScore.numericDensity.toFixed(3)}`,
    );
  }

  // ── TRIPLE-VIA: Attempt 2 — Textract (if pdf-parse insufficient) ─────────
  let rawPages:   string[];
  let pagesCount: number;
  let extractionSource: string;

  const pdfParseGood = pdfParseScore !== null && pdfParseScore.score >= PDF_PARSE_MIN_SCORE;

  if (pdfParseGood) {
    console.log(`[worker] Triple-via: pdf-parse sufficient (score=${pdfParseScore!.score} >= ${PDF_PARSE_MIN_SCORE}) — skipping Textract`);
    rawPages        = pdfParsePages;
    pagesCount      = pdfParsePages.length;
    extractionSource = 'pdf_parse';
  } else {
    console.log(`[worker] Triple-via: attempt 2 — Textract (pdf-parse score=${pdfParseScore?.score ?? 0} < ${PDF_PARSE_MIN_SCORE})`);
    await prisma.job.update({ where: { id: jobId }, data: { progress: 20 } });

    const textractPages = await runTextract(s3Key);
    pagesCount = textractPages.length;

    if (pagesCount === 0) {
      throw new Error('Textract returned 0 pages — PDF may be empty or image-only');
    }

    await prisma.job.update({ where: { id: jobId }, data: { progress: 45, pagesCount } });

    const textractTexts   = textractPages.map((p) => p.text);
    const textractScore   = scoreRealContent(textractTexts);
    console.log(
      `[worker] Textract content score=${textractScore.score} ` +
      `hits=[${textractScore.hits.slice(0, 8).join(', ')}] ` +
      `chars=${textractScore.totalChars}`,
    );

    // TRIPLE-VIA: choose best source (Attempt 3 = pick better of the two)
    if (
      pdfParseScore !== null &&
      pdfParseScore.score > textractScore.score &&
      pdfParseScore.totalChars > 500
    ) {
      console.log(
        `[worker] Triple-via: prefer pdf-parse ` +
        `(score ${pdfParseScore.score} > Textract ${textractScore.score})`,
      );
      rawPages        = pdfParsePages;
      pagesCount      = pdfParsePages.length;
      extractionSource = 'pdf_parse_preferred';
    } else {
      rawPages        = textractTexts;
      extractionSource = 'textract';
    }
  }

  console.log(
    `[worker] Extraction done source=${extractionSource} ` +
    `pagesCount=${pagesCount} (+${Date.now() - t0}ms)`,
  );

  // ── Diagnostic: raw text sample ──────────────────────────────────────────
  const rawSample = rawPages.slice(0, 3).join('\n').slice(0, 1500);
  console.log(`[worker] RAW TEXT SAMPLE (first 1500 chars):\n${rawSample}`);

  // ── Anti-watermark filter ─────────────────────────────────────────────────
  const { cleanedPages, textLen, watermarkFilteredCount, fallbackPages } =
    removeWatermarkLines(rawPages);

  await prisma.job.update({
    where: { id: jobId },
    data:  { progress: 60, pagesCount, textLen, watermarkFilteredCount },
  });

  // ── Diagnostic: filtered text sample ─────────────────────────────────────
  const cleanedSample = cleanedPages.slice(0, 3).join('\n').slice(0, 1500);
  console.log(`[worker] CLEANED TEXT SAMPLE (first 1500 chars):\n${cleanedSample}`);

  // ── Content score after filtering ────────────────────────────────────────
  const finalScore = scoreRealContent(cleanedPages);
  console.log(
    `[worker] Final content score=${finalScore.score} ` +
    `hits=[${finalScore.hits.join(', ')}] ` +
    `textLen=${textLen} fallbackPages=${fallbackPages} ` +
    `watermarkFiltered=${watermarkFilteredCount}`,
  );

  if (textLen < 800) {
    console.warn(
      `[worker] LOW CONTENT WARNING: textLen=${textLen} < 800 chars after filtering. ` +
      `Content may be truly absent or watermark filter was too aggressive. ` +
      `fallbackPages=${fallbackPages} finalScore=${finalScore.score}`,
    );
  }

  if (finalScore.score === 0 && textLen < 2000) {
    console.error(
      `[worker] ZERO REAL CONTENT: score=0, textLen=${textLen}. ` +
      `No perizia entities found. Result will likely be "not_found" for all fields.`,
    );
  }

  // ── Claude 2-step ─────────────────────────────────────────────────────────
  await prisma.job.update({ where: { id: jobId }, data: { progress: 65 } });
  const { extraction, reasoning } = await analyzeWithClaude(cleanedPages);
  await prisma.job.update({ where: { id: jobId }, data: { progress: 90 } });

  console.log(
    `[worker] Claude done ` +
    `valore_perito=${extraction.valore_perito.status} ` +
    `risk=${reasoning.risk_score} esito=${reasoning.sintesi_esito}`,
  );

  // ── Save result ───────────────────────────────────────────────────────────
  const resultPayload = {
    ...extraction,
    reasoning,
    meta: {
      analysis_mode:          extractionSource,
      total_pages:            pagesCount,
      pages_analyzed:         pagesCount,
      textLen,
      watermarkFilteredCount,
      fallbackPages,
      finalContentScore:      finalScore.score,
      finalContentHits:       finalScore.hits,
      model:                  'claude-haiku-4-5-20251001',
      durationMs:             Date.now() - t0,
    },
  };

  await prisma.job.update({
    where: { id: jobId },
    data:  {
      status:                 'succeeded',
      progress:               100,
      result:                 JSON.stringify(resultPayload),
      pagesCount,
      textLen,
      watermarkFilteredCount,
    },
  });

  await prisma.document.update({
    where: { id: documentId },
    data:  { status: 'completed', pages: pagesCount },
  });

  console.log(
    `[worker] DONE jobId=${jobId} durationMs=${Date.now() - t0} ` +
    `source=${extractionSource} pagesCount=${pagesCount} ` +
    `textLen=${textLen} watermarkFilteredCount=${watermarkFilteredCount} ` +
    `contentScore=${finalScore.score}`,
  );
}

// ── Worker ────────────────────────────────────────────────────────────────────

const worker = new Worker<JobData>(
  QUEUE_NAME,
  async (job) => {
    const { jobId, documentId } = job.data;
    try {
      await processJob(job);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[worker] FAILED jobId=${jobId}`, e);
      try {
        await prisma.job.update({
          where: { id: jobId },
          data:  { status: 'failed', errorMessage: msg },
        });
        await prisma.document.update({
          where: { id: documentId },
          data:  { status: 'error', errorMessage: msg },
        });
      } catch (dbErr) {
        console.error('[worker] DB update error after failure', dbErr);
      }
      throw e;
    }
  },
  {
    connection,
    concurrency: 2,
  },
);

worker.on('completed', (job) => {
  console.log(`[worker] completed bullmqId=${job.id}`);
});

worker.on('failed', (job, err) => {
  console.error(`[worker] failed bullmqId=${job?.id}`, err.message);
});

worker.on('error', (err) => {
  console.error('[worker] error', err);
});

console.log(`[worker] Perizia Analyzer Worker v2 started. Queue="${QUEUE_NAME}" concurrency=2`);
