import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const REGION      = process.env.AWS_REGION      ?? 'eu-central-1';
const BUCKET      = process.env.S3_BUCKET        ?? '';
const ACCESS_KEY  = process.env.AWS_ACCESS_KEY_ID ?? '';
const SECRET_KEY  = process.env.AWS_SECRET_ACCESS_KEY ?? '';

let _client: S3Client | null = null;

function getClient(): S3Client {
  if (!_client) {
    _client = new S3Client({
      region: REGION,
      credentials: ACCESS_KEY && SECRET_KEY
        ? { accessKeyId: ACCESS_KEY, secretAccessKey: SECRET_KEY }
        : undefined,
    });
  }
  return _client;
}

/**
 * Upload a Buffer to S3.
 * Returns the S3 key.
 */
export async function uploadToS3(key: string, body: Buffer, contentType = 'application/pdf'): Promise<string> {
  if (!BUCKET) throw new Error('S3_BUCKET env var not set');
  const client = getClient();
  await client.send(new PutObjectCommand({
    Bucket:      BUCKET,
    Key:         key,
    Body:        body,
    ContentType: contentType,
  }));
  return key;
}

/**
 * Get a pre-signed URL to download an object from S3 (1 hour expiry).
 */
export async function getS3SignedUrl(key: string, expiresIn = 3600): Promise<string> {
  if (!BUCKET) throw new Error('S3_BUCKET env var not set');
  const client = getClient();
  const cmd = new GetObjectCommand({ Bucket: BUCKET, Key: key });
  return getSignedUrl(client, cmd, { expiresIn });
}

/**
 * Download an object from S3 and return it as a Buffer.
 */
export async function downloadFromS3(key: string): Promise<Buffer> {
  if (!BUCKET) throw new Error('S3_BUCKET env var not set');
  const client = getClient();
  const resp = await client.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
  if (!resp.Body) throw new Error('S3 empty body');
  const chunks: Uint8Array[] = [];
  // @ts-expect-error: resp.Body is ReadableStream in Node.js
  for await (const chunk of resp.Body) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
