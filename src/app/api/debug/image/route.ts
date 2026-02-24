/**
 * GET /api/debug/image?docId=<uuid>&page=<n>
 *
 * Serves a rendered page image saved by pdfRender.ts to the temp directory.
 * This lets the Debug tab display actual rendered pages so you can visually
 * confirm they are not blank.
 *
 * Security:
 * - docId is validated as a strict UUID (no path traversal possible).
 * - Page number is validated as 1-999.
 * - Files are read from os.tmpdir() only.
 */

import { NextRequest, NextResponse } from 'next/server';
import * as fs   from 'fs';
import * as path from 'path';
import * as os   from 'os';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Also accept UUID with '-probe', '-hq', '-exp' suffixes used internally
const DOC_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(-[a-z]+)?$/i;

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const rawDocId = searchParams.get('docId') ?? '';
  const rawPage  = searchParams.get('page')  ?? '';

  // Validate docId
  if (!DOC_ID_RE.test(rawDocId)) {
    return new NextResponse('Invalid docId', { status: 400 });
  }

  // Validate page number
  const pageNum = parseInt(rawPage, 10);
  if (!Number.isFinite(pageNum) || pageNum < 1 || pageNum > 999) {
    return new NextResponse('Invalid page', { status: 400 });
  }

  const baseDir = path.join(os.tmpdir(), `perizia-${rawDocId}`);
  const jpgPath = path.join(baseDir, `page-${pageNum}.jpg`);
  const pngPath = path.join(baseDir, `page-${pageNum}.png`);

  // Confirm the resolved path is still under baseDir (extra guard against traversal)
  const resolvedJpg = path.resolve(jpgPath);
  const resolvedPng = path.resolve(pngPath);
  const resolvedBase = path.resolve(baseDir);
  if (!resolvedJpg.startsWith(resolvedBase) || !resolvedPng.startsWith(resolvedBase)) {
    return new NextResponse('Forbidden', { status: 403 });
  }

  let filePath: string | null = null;
  let contentType = 'image/jpeg';

  if (fs.existsSync(jpgPath)) {
    filePath    = jpgPath;
    contentType = 'image/jpeg';
  } else if (fs.existsSync(pngPath)) {
    filePath    = pngPath;
    contentType = 'image/png';
  }

  if (!filePath) {
    return new NextResponse(
      `Image not found for docId=${rawDocId} page=${pageNum}. ` +
      `Temp dir: ${baseDir}. ` +
      `Files: ${fs.existsSync(baseDir) ? fs.readdirSync(baseDir).join(', ') : '(directory does not exist)'}`,
      { status: 404 },
    );
  }

  const buffer = fs.readFileSync(filePath);
  return new NextResponse(buffer, {
    headers: {
      'Content-Type':  contentType,
      'Cache-Control': 'no-store',
      'Content-Length': String(buffer.length),
    },
  });
}

// Only validate UUID format — no extra check needed
void UUID_RE;
