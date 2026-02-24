/**
 * ocrLocal.ts — Local OCR via Tesseract CLI.
 *
 * Tesseract is NOT installed on this machine by default.
 * This module detects availability and returns graceful results:
 * - If Tesseract is not installed → available=false, callers fall back to Vision OCR.
 * - If installed → run `tesseract <path> stdout -l ita --psm 6` and capture output.
 *
 * Server-only.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';

const execAsync = promisify(exec);

export interface LocalOcrResult {
  available: boolean;
  version?: string;
}

export interface LocalOcrPageResult {
  page: number;
  text: string;
  chars: number;
  status: 'ok' | 'empty' | 'failed';
  errorDetail?: string;
}

let _cachedAvailability: boolean | null = null;
let _cachedVersion: string | null = null;

/**
 * Check once if Tesseract CLI is available on PATH.
 * Result is cached for the lifetime of the process.
 */
export async function checkTesseract(): Promise<LocalOcrResult> {
  if (_cachedAvailability !== null) {
    return { available: _cachedAvailability, version: _cachedVersion ?? undefined };
  }

  try {
    const { stdout } = await execAsync('tesseract --version', { timeout: 5000 });
    _cachedAvailability = true;
    _cachedVersion = stdout.split('\n')[0]?.trim() ?? 'unknown';
    return { available: true, version: _cachedVersion };
  } catch {
    _cachedAvailability = false;
    return { available: false };
  }
}

/**
 * Run Tesseract OCR on a saved image file.
 * Tries psm 6 first, then 4, then 11 as fallback.
 *
 * @param imagePath  Absolute path to the image file.
 * @param pageNumber  1-based page number (for labeling only).
 */
export async function ocrLocalPage(
  imagePath: string,
  pageNumber: number,
): Promise<LocalOcrPageResult> {
  if (!fs.existsSync(imagePath)) {
    return { page: pageNumber, text: '', chars: 0, status: 'failed', errorDetail: 'Image file not found' };
  }

  const psmValues = [6, 4, 11];
  let lastError = '';

  for (const psm of psmValues) {
    try {
      const cmd = `tesseract "${imagePath}" stdout -l ita --psm ${psm}`;
      const { stdout } = await execAsync(cmd, { timeout: 30_000 });
      const text = stdout.trim();
      if (text.length >= 30) {
        return { page: pageNumber, text, chars: text.length, status: 'ok' };
      }
      // text too short — try next psm
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }

  return {
    page: pageNumber,
    text: '',
    chars: 0,
    status: 'empty',
    errorDetail: lastError || 'All PSM modes returned empty text',
  };
}
