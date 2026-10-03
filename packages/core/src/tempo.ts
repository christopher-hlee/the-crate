// Tempo helpers: tap tempo, and turning listener votes into a community estimate whose
// confidence grows with agreement, so enough agreeing votes can outrank other sources.

import type { CamelotKey } from "./camelot";

/** BPM from tap timestamps (ms): the median interval of the last 8 taps. Null under 4 taps. */
export function tapTempo(timestamps: readonly number[]): number | null {
  const recent = timestamps.slice(-9);
  if (recent.length < 4) return null;
  const intervals: number[] = [];
  for (let i = 1; i < recent.length; i++) {
    const d = (recent[i] as number) - (recent[i - 1] as number);
    if (d > 150 && d < 3000) intervals.push(d);
  }
  if (intervals.length < 3) return null;
  intervals.sort((a, b) => a - b);
  const mid = Math.floor(intervals.length / 2);
  const median =
    intervals.length % 2
      ? (intervals[mid] as number)
      : ((intervals[mid - 1] as number) + (intervals[mid] as number)) / 2;
  return Math.round((60_000 / median) * 10) / 10;
}

/** Confidence for a source: GetSongBPM 0.8, AcousticBrainz 0.5, analysis 0.7. */
export const SOURCE_CONFIDENCE = { getsongbpm: 0.8, acousticbrainz: 0.5, analysis: 0.7 } as const;

/** Community confidence: 0.3 plus 0.15 per agreeing vote, capped at 0.95 (5 agree → 0.95). */
export function communityConfidence(agreeing: number): number {
  return Math.min(0.95, 0.3 + 0.15 * Math.max(0, agreeing));
}

export const BPM_AGREEMENT = 2;

export type TempoVote = { bpm: number | null; camelotKey: CamelotKey | string | null };

/**
 * Community estimate from votes: the median BPM and how many votes sit within ±2 BPM of it
 * (half and double time count as agreeing), and the most common key and its count.
 */
export function communityEstimate(votes: readonly TempoVote[]): {
  bpm: number | null;
  bpmAgreeing: number;
  camelotKey: string | null;
  keyAgreeing: number;
} {
  const bpms = votes
    .map((v) => v.bpm)
    .filter((b): b is number => typeof b === "number" && b > 0)
    .sort((a, b) => a - b);
  let bpm: number | null = null;
  let bpmAgreeing = 0;
  if (bpms.length > 0) {
    const mid = Math.floor(bpms.length / 2);
    bpm =
      bpms.length % 2
        ? (bpms[mid] as number)
        : ((bpms[mid - 1] as number) + (bpms[mid] as number)) / 2;
    const m = bpm;
    bpmAgreeing = bpms.filter(
      (b) =>
        Math.abs(b - m) <= BPM_AGREEMENT ||
        Math.abs(b * 2 - m) <= BPM_AGREEMENT ||
        Math.abs(b / 2 - m) <= BPM_AGREEMENT,
    ).length;
    bpm = Math.round(bpm * 10) / 10;
  }
  const keyCounts = new Map<string, number>();
  for (const v of votes)
    if (v.camelotKey) keyCounts.set(v.camelotKey, (keyCounts.get(v.camelotKey) ?? 0) + 1);
  let camelotKey: string | null = null;
  let keyAgreeing = 0;
  for (const [k, n] of [...keyCounts.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    if (n > keyAgreeing) {
      camelotKey = k;
      keyAgreeing = n;
    }
  }
  return { bpm, bpmAgreeing, camelotKey, keyAgreeing };
}
