/**
 * visionOcr.ts — PASS 1 of the two-pass Vision pipeline.
 *
 * Sends each rendered page image to gpt-4o-mini as a Vision call and asks it
 * to transcribe the body text (ignoring watermarks/headers).
 * Returns OcrPage[] sorted by page number.
 *
 * Server-only.
 */
import OpenAI from 'openai';
import type { PageImage } from './pdf-to-images';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface OcrPage {
  /** Original 1-based page number from the document */
  page: number;
  /** Transcribed text (empty string when status !== 'ok') */
  text: string;
  /** Length of text in characters */
  chars: number;
  /** 'ok' = usable text, 'empty' = blank/unreadable page, 'failed' = API error */
  status: 'ok' | 'empty' | 'failed';
  /** First 300 chars for debug preview */
  preview: string;
  /** Raw error message or model output when status !== 'ok' */
  rawModelOutput?: string;
}

// ---------------------------------------------------------------------------
// OCR system prompt (Italian legal docs, watermark-ignoring)
// ---------------------------------------------------------------------------

const OCR_SYSTEM = `You are a precise OCR engine for Italian legal documents.
Your ONLY task: extract ALL readable body text from the provided page image.

Rules:
- IGNORE repeated watermarks, headers and footers such as:
  "Pubblicazione ufficiale ad uso esclusivo personale"
  "ASTE GIUDIZIARIE" logos or stamps
  Any text repeated in diagonal across the page
- Output PLAIN TEXT only.
- Keep original paragraph structure and line breaks.
- Do NOT summarize, paraphrase, translate, or reorder content.
- If the page is completely blank or the only content is a watermark/logo, output exactly the word: BLANK`;

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * PASS 1: OCR each page image individually via gpt-4o-mini Vision.
 * Processes pages one-by-one for maximum reliability.
 *
 * Asserts that every dataUrl starts with "data:image/" before calling the API.
 */
export async function visionOcrPages(
  images: PageImage[],
  client: OpenAI,
): Promise<OcrPage[]> {
  const results: OcrPage[] = [];

  for (const img of images) {
    const dataUrl = `data:${img.mimeType};base64,${img.base64}`;

    // Hard assert — catch encoding bugs early
    if (!dataUrl.startsWith('data:image/')) {
      throw new Error(
        `[visionOcr] Invalid data URL for page ${img.pageNumber}. ` +
        `Expected "data:image/..." but got "${dataUrl.slice(0, 30)}"`,
      );
    }

    try {
      const completion = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        temperature: 0,
        max_tokens: 2048,
        messages: [
          { role: 'system', content: OCR_SYSTEM },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Trascrivi il testo di questa pagina (Pagina ${img.pageNumber} del documento). Output solo testo plain, nessuna spiegazione.`,
              },
              {
                type: 'image_url',
                image_url: { url: dataUrl, detail: 'high' },
              },
            ],
          },
        ],
      });

      const raw = (completion.choices[0]?.message?.content ?? '').trim();
      const isBlank =
        raw === '' ||
        raw.toUpperCase() === 'BLANK' ||
        raw.toLowerCase() === 'blank';

      if (isBlank) {
        results.push({
          page:     img.pageNumber,
          text:     '',
          chars:    0,
          status:   'empty',
          preview:  '',
          rawModelOutput: raw || '(empty response)',
        });
      } else {
        results.push({
          page:    img.pageNumber,
          text:    raw,
          chars:   raw.length,
          status:  raw.length < 50 ? 'empty' : 'ok',
          preview: raw.slice(0, 300),
        });
      }
    } catch (err) {
      results.push({
        page:    img.pageNumber,
        text:    '',
        chars:   0,
        status:  'failed',
        preview: '',
        rawModelOutput: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return results.sort((a, b) => a.page - b.page);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Average chars/page across pages with status='ok' */
export function ocrAvgChars(pages: OcrPage[]): number {
  const ok = pages.filter((p) => p.status === 'ok');
  if (ok.length === 0) return 0;
  return ok.reduce((s, p) => s + p.chars, 0) / ok.length;
}

/** Build the paged OCR text payload for PASS 2 */
export function buildOcrPayload(pages: OcrPage[]): string {
  return pages
    .map((p) => {
      const body = p.text.trim() || '(pagina vuota o non leggibile)';
      return `===PAGINA ${p.page}===\n${body}`;
    })
    .join('\n\n');
}
