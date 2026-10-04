// Chop markers on a cleared-lane asset: times in seconds where a user cuts the recording.

export const MAX_CHOPS = 64;
const MIN_GAP_S = 0.01;

/** Sorted, de-duplicated (within 10 ms), clamped inside the recording, at most MAX_CHOPS. */
export function normalizeChops(markers: readonly number[], durationS: number): number[] {
  const inside = markers
    .filter((m) => Number.isFinite(m) && m > 0 && m < durationS)
    .map((m) => Math.round(m * 1000) / 1000)
    .sort((a, b) => a - b);
  const out: number[] = [];
  for (const m of inside) {
    const last = out[out.length - 1];
    if (last === undefined || m - last >= MIN_GAP_S) out.push(m);
  }
  return out.slice(0, MAX_CHOPS);
}

export type Region = { index: number; startSeconds: number; endSeconds: number };

/** The regions between markers, from the start to the end of the recording. */
export function regionsFromChops(markers: readonly number[], durationS: number): Region[] {
  const cuts = [0, ...normalizeChops(markers, durationS), durationS];
  const regions: Region[] = [];
  for (let i = 0; i + 1 < cuts.length; i++)
    regions.push({
      index: i + 1,
      startSeconds: cuts[i] ?? 0,
      endSeconds: cuts[i + 1] ?? durationS,
    });
  return regions;
}
