/**
 * Perizia Analyzer — BullMQ Worker
 *
 * Processes PDF analysis jobs:
 *  1. Download PDF from S3
 *  2. Run AWS Textract async (StartDocumentTextDetection → polling)
 *  3. Reconstruct text per page (ordered by bounding box top)
 *  4. Anti-watermark filter (frequency-based, >35% threshold)
 *  5. Claude Haiku 2-step (extraction + reasoning)
 *  6. Save result to DB (Job + Document)
 *  7. Update job status
 *
 * Deploy this on Render as an always-on worker service.
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

// ── S3 download ──────────────────────────────────────────────────────────────

async function downloadFromS3(key: string): Promise<Buffer> {
  const resp = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
  if (!resp.Body) throw new Error('S3 empty body');
  const chunks: Uint8Array[] = [];
  // @ts-expect-error NodeJS stream
  for await (const chunk of resp.Body) chunks.push(chunk);
  return Buffer.concat(chunks);
}

// ── Job processor ────────────────────────────────────────────────────────────

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

  // ── Mark as processing ──────────────────────────────────────────────────
  await prisma.job.update({
    where: { id: jobId },
    data:  { status: 'processing', progress: 5 },
  });
  await prisma.document.update({
    where: { id: documentId },
    data:  { status: 'processing' },
  });

  // ── Step 1: Textract ────────────────────────────────────────────────────
  console.log(`[worker] Textract start s3Key=${s3Key}`);
  const textractPages = await runTextract(s3Key);
  const pagesCount = textractPages.length;

  await prisma.job.update({
    where: { id: jobId },
    data:  { progress: 40, pagesCount },
  });

  console.log(`[worker] Textract done pagesCount=${pagesCount}`);

  if (pagesCount === 0) {
    throw new Error('Textract returned 0 pages — PDF may be empty or image-only');
  }

  // ── Step 2: Anti-watermark ──────────────────────────────────────────────
  const rawTexts = textractPages.map((p) => p.text);
  const { cleanedPages, textLen, watermarkFilteredCount } = removeWatermarkLines(rawTexts);

  await prisma.job.update({
    where: { id: jobId },
    data:  { progress: 55, textLen, watermarkFilteredCount },
  });

  if (textLen < 800) {
    console.warn(`[worker] textLen=${textLen} < 800 threshold — content may be sparse`);
  }

  console.log(
    `[worker] Anti-watermark done textLen=${textLen} watermarkFilteredCount=${watermarkFilteredCount}`,
  );

  // ── Step 3: Claude 2-step ───────────────────────────────────────────────
  await prisma.job.update({ where: { id: jobId }, data: { progress: 60 } });
  const { extraction, reasoning } = await analyzeWithClaude(cleanedPages);
  await prisma.job.update({ where: { id: jobId }, data: { progress: 90 } });

  console.log(`[worker] Claude done risk=${reasoning.risk_score} esito=${reasoning.sintesi_esito}`);

  // ── Step 4: Save result ─────────────────────────────────────────────────
  const resultPayload = {
    ...extraction,
    reasoning,
    meta: {
      analysis_mode:          'textract_claude',
      total_pages:            pagesCount,
      pages_analyzed:         pagesCount,
      textLen,
      watermarkFilteredCount,
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
    `pagesCount=${pagesCount} textLen=${textLen} watermarkFilteredCount=${watermarkFilteredCount}`,
  );
}

// ── Worker ───────────────────────────────────────────────────────────────────

const worker = new Worker<JobData>(
  QUEUE_NAME,
  async (job) => {
    const { jobId, documentId } = job.data;
    try {
      await processJob(job);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[worker] FAILED jobId=${jobId}`, e);
      // Update DB with error
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
      throw e; // re-throw so BullMQ knows the job failed
    }
  },
  {
    connection,
    concurrency: 2, // process up to 2 jobs in parallel
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

console.log(`[worker] Perizia Analyzer Worker started. Queue="${QUEUE_NAME}" concurrency=2`);
