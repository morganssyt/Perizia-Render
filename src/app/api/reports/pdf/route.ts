/**
 * POST /api/reports/pdf
 * Accepts analysis result + optional reasoning JSON, returns a binary PDF.
 * Never produces a blank PDF — gracefully degrades for legacy/incomplete data.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { generateAnalysisPdf, type PdfPayload } from '@/lib/server-pdf-generator';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || !body.result) {
      return NextResponse.json({ error: 'Body mancante o malformato.' }, { status: 400 });
    }

    const payload: PdfPayload = {
      fileName: (typeof body.fileName === 'string' && body.fileName) ? body.fileName : 'perizia.pdf',
      result:   body.result,
      reasoning: body.reasoning ?? undefined,
    };

    const pdfBuffer = await generateAnalysisPdf(payload);

    const safeName = payload.fileName.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/\.pdf$/i, '') + '.pdf';

    return new NextResponse(pdfBuffer as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type':        'application/pdf',
        'Content-Disposition': `inline; filename="${safeName}"`,
        'Content-Length':      String(pdfBuffer.length),
        'Cache-Control':       'no-store',
      },
    });
  } catch (err) {
    console.error('[/api/reports/pdf]', err);
    return NextResponse.json(
      { error: 'Errore durante la generazione del PDF.' },
      { status: 500 },
    );
  }
}
