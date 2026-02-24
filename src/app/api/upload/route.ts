/**
 * POST /api/upload
 *
 * Accepts a multipart/form-data with field "file" (PDF).
 * Flow:
 *  1. Validate file
 *  2. Upload to S3 (key: uploads/{uuid}/{filename})
 *  3. Create Document row in DB
 *  4. Create Job row in DB (status=pending)
 *  5. Enqueue BullMQ job
 *  6. Return { jobId, documentId }
 *
 * If REDIS_URL is not set, the job is still created in DB
 * but not enqueued (worker won't pick it up automatically).
 */

export const maxDuration = 30;
export const dynamic     = 'force-dynamic';
export const runtime     = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { uploadToS3 } from '@/lib/s3';
import { enqueueAnalysis } from '@/lib/queue';
import { v4 as uuidv4 } from 'uuid';

const MAX_BYTES = (parseInt(process.env.MAX_PDF_MB ?? '15', 10) || 15) * 1024 * 1024;

export async function POST(req: NextRequest) {
  try {
    // ── Auth (optional — works for both authed and anon in dev) ──────────────
    const session = await getServerSession(authOptions);
    const userId  = (session?.user as { id?: string })?.id ?? null;

    // ── Parse FormData ───────────────────────────────────────────────────────
    let formData: FormData;
    try { formData = await req.formData(); }
    catch { return NextResponse.json({ error: 'Impossibile leggere il form.' }, { status: 400 }); }

    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'Nessun file nel form.' }, { status: 400 });
    if (file.size > MAX_BYTES) {
      return NextResponse.json({
        error: `File troppo grande: ${(file.size / 1024 / 1024).toFixed(1)} MB (max ${MAX_BYTES / 1024 / 1024} MB).`,
      }, { status: 413 });
    }

    const magic = Buffer.from(await file.slice(0, 5).arrayBuffer()).toString('ascii');
    if (!magic.startsWith('%PDF')) {
      return NextResponse.json({ error: 'Il file non è un PDF valido.' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // ── S3 upload ────────────────────────────────────────────────────────────
    const docId  = uuidv4();
    const s3Key  = `uploads/${docId}/${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;

    let s3Uploaded = false;
    try {
      await uploadToS3(s3Key, buffer, 'application/pdf');
      s3Uploaded = true;
    } catch (e) {
      console.warn('[upload] S3 upload failed (S3_BUCKET not configured?)', String(e));
      // Continue — will be stored only in DB metadata; worker will fail unless S3 works
    }

    // ── DB: Document ─────────────────────────────────────────────────────────
    const document = await prisma.document.create({
      data: {
        id:       docId,
        userId,
        filename: file.name,
        s3Key:    s3Uploaded ? s3Key : '',
        status:   'pending',
        pages:    0,
      },
    });

    // ── DB: Job ──────────────────────────────────────────────────────────────
    const jobId = uuidv4();
    const job = await prisma.job.create({
      data: {
        id:         jobId,
        userId,
        documentId: document.id,
        status:     'pending',
        progress:   0,
      },
    });

    // ── BullMQ enqueue ───────────────────────────────────────────────────────
    const bullId = await enqueueAnalysis({
      jobId,
      documentId: document.id,
      s3Key:      s3Uploaded ? s3Key : '',
      filename:   file.name,
    });

    if (bullId) {
      await prisma.job.update({
        where: { id: jobId },
        data:  { bullmqId: bullId },
      });
    }

    console.log(
      `[upload] docId=${document.id} jobId=${jobId} s3=${s3Uploaded} bullmqId=${bullId ?? 'n/a'} ` +
      `size=${file.size} user=${userId ?? 'anon'}`,
    );

    return NextResponse.json({ jobId, documentId: document.id, s3Uploaded }, { status: 201 });
  } catch (e) {
    console.error('[upload] error', e);
    return NextResponse.json({ error: 'Errore interno del server.' }, { status: 500 });
  }
}
