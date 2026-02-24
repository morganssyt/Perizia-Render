/**
 * GET /api/jobs/[id]
 * Poll the status of an analysis job.
 * Returns: { status, progress, result?, error? }
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const jobId = params.id;
  if (!jobId) return NextResponse.json({ error: 'Job ID mancante.' }, { status: 400 });

  try {
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      select: {
        id:                    true,
        status:                true,
        progress:              true,
        errorMessage:          true,
        result:                true,
        pagesCount:            true,
        textLen:               true,
        watermarkFilteredCount: true,
        createdAt:             true,
        updatedAt:             true,
        document:              { select: { id: true, filename: true, pages: true } },
      },
    });

    if (!job) return NextResponse.json({ error: 'Job non trovato.' }, { status: 404 });

    // Parse result JSON if present
    let parsedResult: unknown = null;
    if (job.result) {
      try { parsedResult = JSON.parse(job.result); }
      catch { /* ignore */ }
    }

    return NextResponse.json({
      id:                    job.id,
      status:                job.status,
      progress:              job.progress,
      error:                 job.errorMessage,
      result:                parsedResult,
      pagesCount:            job.pagesCount,
      textLen:               job.textLen,
      watermarkFilteredCount: job.watermarkFilteredCount,
      document:              job.document,
      createdAt:             job.createdAt,
      updatedAt:             job.updatedAt,
    });
  } catch (e) {
    console.error('[jobs/id]', e);
    return NextResponse.json({ error: 'Errore interno.' }, { status: 500 });
  }
}
