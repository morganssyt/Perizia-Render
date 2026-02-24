import { SectionCandidate } from '@/types';

/**
 * Calculate confidence score (0–1) for an extraction based on:
 * - Number of keyword matches
 * - Whether keyword appeared in a title/heading
 * - Text window length (more context = better)
 * - Number of candidates found (more = less certain which is right)
 */
export function calculateConfidence(
  candidate: SectionCandidate,
  totalCandidates: number
): number {
  let score = 0;

  // Base: keyword matches (max 0.4)
  const keywordScore = Math.min(candidate.matchedKeywords.length / 4, 1) * 0.4;
  score += keywordScore;

  // Title match bonus (0.25)
  if (candidate.isTitle) {
    score += 0.25;
  }

  // Text length: enough context (0.15)
  if (candidate.text.length > 200) {
    score += 0.15;
  } else if (candidate.text.length > 50) {
    score += 0.08;
  }

  // Fewer total candidates = more confident (0.2)
  if (totalCandidates === 1) {
    score += 0.2;
  } else if (totalCandidates === 2) {
    score += 0.1;
  } else if (totalCandidates <= 3) {
    score += 0.05;
  }

  return Math.min(Math.round(score * 100) / 100, 1);
}

/**
 * Determine if two candidates have similar confidence (potential conflict).
 */
export function hasConflict(
  confidenceA: number,
  confidenceB: number,
  threshold = 0.15
): boolean {
  return Math.abs(confidenceA - confidenceB) < threshold;
}
