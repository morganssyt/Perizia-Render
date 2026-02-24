import { pathToFileURL } from 'url';
import { resolve } from 'path';

export interface PageImage {
  pageNumber: number;
  base64: string;
  mimeType: 'image/jpeg';
}

export interface PdfImagesResult {
  images: PageImage[];
  totalPages: number;
  pagesAnalyzed: number[];
}

const DEFAULT_SCALE = 2.0;
const DEFAULT_MAX_PAGES = parseInt(process.env.MAX_PAGES_VISION ?? '10', 10);
const DEFAULT_QUALITY = parseInt(process.env.VISION_JPEG_QUALITY ?? '75', 10);

/**
 * Select pages: first (max-2) + last 2, deduped, sorted.
 * e.g. total=26 max=10 → [1,2,3,4,5,6,7,8,25,26]
 */
function selectPages(total: number, max: number): number[] {
  if (total <= max) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const lastCount = Math.min(2, max);
  const firstCount = max - lastCount;
  const pages = new Set<number>();
  for (let i = 1; i <= firstCount; i++) pages.add(i);
  for (let i = Math.max(firstCount + 1, total - lastCount + 1); i <= total; i++) pages.add(i);
  return Array.from(pages).sort((a, b) => a - b);
}

/**
 * Convert PDF buffer to JPEG images for OpenAI Vision.
 * Uses pdfjs-dist (legacy ESM) + @napi-rs/canvas.
 * Server-only — never import on the client.
 *
 * @param opts.pageList  - explicit list of 1-based page numbers to render (overrides maxPages)
 */
export async function pdfToImages(
  pdfBuffer: Buffer,
  opts: { maxPages?: number; quality?: number; scale?: number; pageList?: number[] } = {},
): Promise<PdfImagesResult> {
  const maxPages = opts.maxPages ?? DEFAULT_MAX_PAGES;
  const quality = opts.quality ?? DEFAULT_QUALITY;
  const scale = opts.scale ?? DEFAULT_SCALE;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs' as any);
  const { createCanvas } = await import('@napi-rs/canvas');

  // Point worker to the legacy pdfjs worker on disk (required for Node.js)
  const workerPath = resolve(
    process.cwd(),
    'node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs',
  );
  pdfjsLib.GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).href;

  const doc = await pdfjsLib.getDocument({
    data: new Uint8Array(pdfBuffer),
    disableFontFace: true,
    isEvalSupported: false,
    standardFontDataUrl:
      resolve(process.cwd(), 'node_modules/pdfjs-dist/standard_fonts/') + '/',
  }).promise;

  const totalPages: number = doc.numPages;
  const pagesAnalyzed = opts.pageList
    ? opts.pageList.filter((p) => p >= 1 && p <= totalPages)
    : selectPages(totalPages, maxPages);
  const images: PageImage[] = [];

  for (const pageNum of pagesAnalyzed) {
    try {
      const page = await doc.getPage(pageNum);
      const viewport = page.getViewport({ scale });
      const width = Math.round(viewport.width);
      const height = Math.round(viewport.height);

      const canvas = createCanvas(width, height);
      const ctx = canvas.getContext('2d');

      // White background — required for JPEG (no alpha channel)
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await page.render({ canvasContext: ctx as any, viewport }).promise;
      page.cleanup();

      // Encode as JPEG (much smaller than PNG for photos/scans)
      const jpegBuffer: Buffer = await (
        canvas as unknown as {
          encode(fmt: string, quality: number): Promise<Buffer>;
        }
      ).encode('jpeg', quality);

      images.push({ pageNumber: pageNum, base64: jpegBuffer.toString('base64'), mimeType: 'image/jpeg' });
    } catch {
      // Skip pages that fail to render — graceful degradation
    }
  }

  return { images, totalPages, pagesAnalyzed };
}
