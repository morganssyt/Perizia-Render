/**
 * pdfRender.ts — Renders PDF pages to JPEG images using pdfjs-dist + @napi-rs/canvas.
 *
 * Key capabilities over the raw pdfToImages helper:
 * - Saves each rendered page to disk (os.tmpdir()/perizia-{docId}/) for debug preview
 * - Computes a whiteness score from pixel data to detect blank/white renders
 * - Returns per-page diagnostic stats (bytes, width, height, whiteness, isBlank)
 * - Supports a "probe then escalate" pattern: render at standard quality, if mostly
 *   blank re-render at max quality with different pdfjs settings.
 *
 * Server-only — never import this from client code.
 */

import { pathToFileURL } from 'url';
import { resolve } from 'path';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface PageRenderResult {
  pageNumber: number;
  /** base64-encoded JPEG */
  base64: string;
  mimeType: 'image/jpeg';
  /** Absolute path to the saved image file on disk */
  diskPath: string;
  /** JPEG file size in bytes */
  bytes: number;
  /** Image width in pixels */
  width: number;
  /** Image height in pixels */
  height: number;
  /**
   * Whiteness score (0 = pitch black, 1 = pure white).
   * -1 means we could not compute it (getImageData failed).
   */
  whiteness: number;
  /**
   * True if the page appears blank (whiteness > 0.97 OR bytes < 8 KB).
   * When true, skip Vision OCR for this page (it will just return "BLANK").
   */
  isBlank: boolean;
  /** Set when rendering threw an exception */
  renderError?: string;
}

export interface RenderBatchResult {
  pages: PageRenderResult[];
  totalDocPages: number;
  pagesRequested: number[];
  docId: string;
  renderMethod: 'pdfjs';
  scale: number;
  jpegQuality: number;
}

// ---------------------------------------------------------------------------
// Page selection helpers
// ---------------------------------------------------------------------------

/**
 * Select pages: first (max − 2) + last 2, deduped, sorted.
 * e.g. total=26, max=10 → [1,2,3,4,5,6,7,8,25,26]
 */
export function selectDefaultPages(total: number, max: number): number[] {
  if (total <= max) return Array.from({ length: total }, (_, i) => i + 1);
  const lastCount = Math.min(2, max);
  const firstCount = max - lastCount;
  const out: number[] = [];
  for (let i = 1; i <= firstCount; i++) out.push(i);
  for (let i = Math.max(firstCount + 1, total - lastCount + 1); i <= total; i++) out.push(i);
  // dedupe (shouldn't happen, but be safe)
  return Array.from(new Set(out)).sort((a, b) => a - b);
}

// ---------------------------------------------------------------------------
// Whiteness computation (from @napi-rs/canvas CanvasRenderingContext2D)
// ---------------------------------------------------------------------------

/**
 * Sample every Nth pixel from ImageData and return average brightness (0..1).
 * Returns -1 if getImageData is unavailable.
 */
function computeWhiteness(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: any,
  width: number,
  height: number,
): number {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const imageData: any = ctx.getImageData(0, 0, width, height);
    const data: Uint8ClampedArray = imageData.data;
    // Sample every 50th pixel (4 bytes per pixel: RGBA)
    const stride = 50 * 4;
    let totalBrightness = 0;
    let count = 0;
    for (let i = 0; i < data.length; i += stride) {
      // Average of R, G, B (ignore A)
      totalBrightness += (data[i] + data[i + 1] + data[i + 2]) / 3;
      count++;
    }
    return count > 0 ? totalBrightness / (count * 255) : 1.0;
  } catch {
    return -1; // cannot compute — mark as unknown
  }
}

// ---------------------------------------------------------------------------
// Core render function
// ---------------------------------------------------------------------------

/**
 * Render selected PDF pages to JPEG and save them to disk under
 * {os.tmpdir()}/perizia-{docId}/.
 *
 * @param pdfBuffer  Raw PDF bytes
 * @param docId      Unique ID for this analysis run (used for temp dir naming)
 * @param opts.pageList   Explicit 1-based page numbers (overrides maxPages heuristic)
 * @param opts.maxPages   Max pages (default 10, heuristic: first N-2 + last 2)
 * @param opts.scale      Render scale (default 2.5 — better than 2.0 for OCR)
 * @param opts.quality    JPEG quality 1-100 (default 90)
 * @param opts.allowFontFace  Set disableFontFace=false on second attempt (default true→false)
 */
export async function renderPdfPages(
  pdfBuffer: Buffer,
  docId: string,
  opts: {
    pageList?: number[];
    maxPages?: number;
    scale?: number;
    quality?: number;
    disableFontFace?: boolean;
  } = {},
): Promise<RenderBatchResult> {
  const scale       = opts.scale          ?? 2.5;
  const quality     = opts.quality        ?? 90;
  const maxPages    = opts.maxPages       ?? 10;
  const disableFontFace = opts.disableFontFace ?? false; // false = allow font loading

  // Create temp directory
  const tempDir = path.join(os.tmpdir(), `perizia-${docId}`);
  fs.mkdirSync(tempDir, { recursive: true });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfjsLib: any = await import('pdfjs-dist/legacy/build/pdf.mjs' as any);
  const { createCanvas } = await import('@napi-rs/canvas');

  const workerPath = resolve(
    process.cwd(),
    'node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs',
  );
  pdfjsLib.GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).href;

  const doc = await pdfjsLib.getDocument({
    data: new Uint8Array(pdfBuffer),
    disableFontFace,
    isEvalSupported: false,
    standardFontDataUrl:
      resolve(process.cwd(), 'node_modules/pdfjs-dist/standard_fonts/') + '/',
  }).promise;

  const totalDocPages: number = doc.numPages;
  const pagesRequested = opts.pageList
    ? opts.pageList.filter((p) => p >= 1 && p <= totalDocPages)
    : selectDefaultPages(totalDocPages, maxPages);

  const pages: PageRenderResult[] = [];

  for (const pageNum of pagesRequested) {
    const diskPath = path.join(tempDir, `page-${pageNum}.jpg`);

    try {
      const page = await doc.getPage(pageNum);
      const viewport = page.getViewport({ scale });
      const width  = Math.round(viewport.width);
      const height = Math.round(viewport.height);

      const canvas = createCanvas(width, height);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ctx: any = canvas.getContext('2d');

      // White background (JPEG has no alpha)
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);

      // Render the page
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (page as any).render({ canvasContext: ctx, viewport }).promise;
      page.cleanup();

      // Compute whiteness BEFORE encoding (raw pixel data)
      const whiteness = computeWhiteness(ctx, width, height);

      // Encode to JPEG
      const jpegBuffer: Buffer = await (
        canvas as unknown as { encode(fmt: string, quality: number): Promise<Buffer> }
      ).encode('jpeg', quality);

      // Save to disk
      fs.writeFileSync(diskPath, jpegBuffer);

      const bytes = jpegBuffer.length;
      // Consider blank if almost all white OR suspiciously small file
      const isBlank = (whiteness >= 0 && whiteness > 0.97) || bytes < 8_000;

      pages.push({
        pageNumber: pageNum,
        base64:     jpegBuffer.toString('base64'),
        mimeType:   'image/jpeg',
        diskPath,
        bytes,
        width,
        height,
        whiteness,
        isBlank,
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      // Save a placeholder entry so the pipeline knows this page failed
      pages.push({
        pageNumber:  pageNum,
        base64:      '',
        mimeType:    'image/jpeg',
        diskPath,
        bytes:       0,
        width:       0,
        height:      0,
        whiteness:   -1,
        isBlank:     true,
        renderError: errorMsg,
      });
    }
  }

  return { pages, totalDocPages, pagesRequested, docId, renderMethod: 'pdfjs', scale, jpegQuality: quality };
}

/**
 * Clean up all temp files for a given docId.
 * Safe to call after the response has been sent.
 */
export function cleanupTempDir(docId: string): void {
  try {
    const tempDir = path.join(os.tmpdir(), `perizia-${docId}`);
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch {
    // ignore cleanup errors
  }
}

/** Return the absolute disk path for a saved page image (may not exist yet). */
export function pageDiskPath(docId: string, pageNumber: number): string {
  return path.join(os.tmpdir(), `perizia-${docId}`, `page-${pageNumber}.jpg`);
}
