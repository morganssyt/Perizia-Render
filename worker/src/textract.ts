/**
 * AWS Textract async interface.
 *
 * Starts a document text detection job on an S3 PDF and polls until it
 * succeeds or fails. Returns text reconstructed per-page, ordered by
 * bounding-box top position within each page.
 */

import {
  TextractClient,
  StartDocumentTextDetectionCommand,
  GetDocumentTextDetectionCommand,
  type Block,
  type GetDocumentTextDetectionCommandOutput,
} from '@aws-sdk/client-textract';

const REGION     = process.env.AWS_REGION           ?? 'eu-central-1';
const BUCKET     = process.env.S3_BUCKET            ?? '';
const ACCESS_KEY = process.env.AWS_ACCESS_KEY_ID    ?? '';
const SECRET_KEY = process.env.AWS_SECRET_ACCESS_KEY ?? '';

const client = new TextractClient({
  region: REGION,
  credentials: ACCESS_KEY && SECRET_KEY
    ? { accessKeyId: ACCESS_KEY, secretAccessKey: SECRET_KEY }
    : undefined,
});

/** Start async Textract job. Returns the Textract JobId. */
export async function startTextract(s3Key: string): Promise<string> {
  if (!BUCKET) throw new Error('S3_BUCKET env var not set');
  const resp = await client.send(new StartDocumentTextDetectionCommand({
    DocumentLocation: { S3Object: { Bucket: BUCKET, Name: s3Key } },
  }));
  if (!resp.JobId) throw new Error('Textract did not return a JobId');
  console.log(`[textract] Start JobId=${resp.JobId} s3Key=${s3Key}`);
  return resp.JobId;
}

/** Poll GetDocumentTextDetection until SUCCEEDED or FAILED. */
async function pollUntilDone(
  jobId: string,
  intervalMs = 4000,
  maxAttempts = 90, // up to 6 minutes
): Promise<Block[]> {
  let attempts = 0;
  let allBlocks: Block[] = [];
  let nextToken: string | undefined;

  while (attempts < maxAttempts) {
    await new Promise((r) => setTimeout(r, attempts === 0 ? 0 : intervalMs));
    attempts++;

    const resp = await client.send(new GetDocumentTextDetectionCommand({
      JobId:     jobId,
      NextToken: nextToken,
    }));

    const status = resp.JobStatus;
    console.log(`[textract] Poll attempt=${attempts} status=${status} blocks=${resp.Blocks?.length ?? 0}`);

    if (status === 'FAILED') {
      throw new Error(`Textract FAILED: ${resp.StatusMessage ?? 'unknown'}`);
    }

    allBlocks = allBlocks.concat(resp.Blocks ?? []);
    nextToken = resp.NextToken;

    if (status === 'SUCCEEDED') {
      // If there are more pages of results, continue fetching
      if (nextToken) {
        // Loop back to fetch next page of blocks (status is already SUCCEEDED)
        while (nextToken) {
          const more: GetDocumentTextDetectionCommandOutput = await client.send(new GetDocumentTextDetectionCommand({
            JobId:     jobId,
            NextToken: nextToken,
          }));
          allBlocks = allBlocks.concat(more.Blocks ?? []);
          nextToken = more.NextToken;
          console.log(`[textract] Pagination blocks=${more.Blocks?.length ?? 0} hasMore=${!!more.NextToken}`);
        }
      }
      console.log(`[textract] SUCCEEDED totalBlocks=${allBlocks.length} after ${attempts} polls`);
      return allBlocks;
    }
    // IN_PROGRESS: keep polling
  }

  throw new Error(`Textract timed out after ${attempts} attempts`);
}

export interface TextractPage {
  page:  number;
  text:  string;
}

/**
 * Full pipeline: start Textract → poll → reconstruct per-page text.
 * Returns pages sorted by page number.
 */
export async function runTextract(s3Key: string): Promise<TextractPage[]> {
  const jobId  = await startTextract(s3Key);
  const blocks = await pollUntilDone(jobId);

  // ── Reconstruct text per page ──────────────────────────────────────────
  // Keep only LINE blocks (contains the merged text of a single line)
  const lineBlocks = blocks.filter((b) => b.BlockType === 'LINE' && b.Page);

  // Group lines by page
  const pageMap = new Map<number, Block[]>();
  for (const block of lineBlocks) {
    const pg = block.Page!;
    if (!pageMap.has(pg)) pageMap.set(pg, []);
    pageMap.get(pg)!.push(block);
  }

  // Sort lines within each page by bounding-box top (vertical position)
  const pages: TextractPage[] = [];
  for (const [pg, lines] of pageMap.entries()) {
    lines.sort((a, b) => {
      const topA = a.Geometry?.BoundingBox?.Top ?? 0;
      const topB = b.Geometry?.BoundingBox?.Top ?? 0;
      return topA - topB;
    });
    const text = lines.map((l) => l.Text ?? '').join('\n');
    pages.push({ page: pg, text });
  }

  pages.sort((a, b) => a.page - b.page);
  console.log(`[textract] Reconstructed ${pages.length} pages`);
  return pages;
}
