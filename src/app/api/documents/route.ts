/**
 * GET /api/documents
 * List the current user's recent jobs/analyses.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function GET(_req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const userId  = (session?.user as { id?: string })?.id ?? null;

    if (!userId) {
      return NextResponse.json({ error: 'Non autenticato.' }, { status: 401 });
    }

    const jobs = await prisma.job.findMany({
      where:   { userId },
      orderBy: { createdAt: 'desc' },
      take:    20,
      select: {
        id:        true,
        status:    true,
        progress:  true,
        createdAt: true,
        updatedAt: true,
        result:    true,
        document:  { select: { id: true, filename: true, pages: true } },
      },
    });

    const list = jobs.map((j) => {
      let parsedResult: unknown = null;
      if (j.result) {
        try { parsedResult = JSON.parse(j.result); } catch { /* ignore */ }
      }
      return { ...j, result: parsedResult };
    });

    return NextResponse.json({ jobs: list });
  } catch (e) {
    console.error('[documents]', e);
    return NextResponse.json({ error: 'Errore interno.' }, { status: 500 });
  }
}
