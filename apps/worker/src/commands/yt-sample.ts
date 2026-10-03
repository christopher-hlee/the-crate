// yt:sample — validates a random sample of video IDs (default 5,000, i.e. 100 videos.list
// calls) to estimate the playable share. Phase 0 uses this to size the catalog.

import { hash32 } from "@app/core";
import { parseReleaseStream, youtubeVideos } from "@app/discogs";
import { checkVideos, type FetchLike, type QuotaLedger, type VideoCheck } from "@app/youtube";
import { looksGzipped, openSource } from "../source";

/**
 * Bottom-k sketch: keeps the k distinct IDs with the smallest hash, which is a uniform
 * sample of the distinct IDs seen, in O(k) memory however long the stream is.
 */
export class DistinctSample {
  private readonly items: { h: number; id: string }[] = [];
  private readonly ids = new Set<string>();

  constructor(
    private readonly k: number,
    private readonly salt = 0x5bd1e995,
  ) {}

  add(id: string): void {
    if (this.ids.has(id)) return;
    const h = hash32(id, this.salt);
    const last = this.items[this.items.length - 1];
    if (this.items.length >= this.k && last && h >= last.h) return;
    let lo = 0;
    let hi = this.items.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if ((this.items[mid] as { h: number }).h < h) lo = mid + 1;
      else hi = mid;
    }
    this.items.splice(lo, 0, { h, id });
    this.ids.add(id);
    if (this.items.length > this.k) {
      const dropped = this.items.pop();
      if (dropped) this.ids.delete(dropped.id);
    }
  }

  values(): string[] {
    return this.items.map((x) => x.id);
  }
}

export async function sampleIdsFromDump(
  source: string,
  k: number,
): Promise<{ ids: string[]; releases: number }> {
  const sample = new DistinctSample(k);
  let releases = 0;
  const bytes = await openSource(source);
  for await (const r of parseReleaseStream(bytes, { gzip: looksGzipped(source) })) {
    releases++;
    for (const v of youtubeVideos(r)) sample.add(v.videoId as string);
  }
  return { ids: sample.values(), releases };
}

/** Wilson score interval for a proportion, 95%. */
export function wilson(successes: number, n: number): { low: number; high: number } {
  if (n === 0) return { low: 0, high: 0 };
  const z = 1.96;
  const p = successes / n;
  const denom = 1 + (z * z) / n;
  const centre = p + (z * z) / (2 * n);
  const margin = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  const r = (x: number) => Math.round(x * 10_000) / 10_000;
  return { low: r((centre - margin) / denom), high: r((centre + margin) / denom) };
}

export type SampleReport = {
  sampled: number;
  calls: number;
  stoppedFor: string;
  byStatus: Record<string, number>;
  playableShare: number;
  playableShare95: { low: number; high: number };
  regionRestrictedShareOfPlayable: number;
  madeForKidsShare: number;
};

export function summarise(checks: VideoCheck[], calls: number, stoppedFor: string): SampleReport {
  const byStatus: Record<string, number> = {};
  for (const c of checks) byStatus[c.status] = (byStatus[c.status] ?? 0) + 1;
  const playable = byStatus.playable ?? 0;
  const restricted = checks.filter(
    (c) =>
      c.status === "playable" && (c.regionAllowed !== null || (c.regionBlocked?.length ?? 0) > 0),
  ).length;
  const n = checks.length;
  const r = (x: number) => Math.round(x * 10_000) / 10_000;
  return {
    sampled: n,
    calls,
    stoppedFor,
    byStatus,
    playableShare: n === 0 ? 0 : r(playable / n),
    playableShare95: wilson(playable, n),
    regionRestrictedShareOfPlayable: playable === 0 ? 0 : r(restricted / playable),
    madeForKidsShare: n === 0 ? 0 : r((byStatus.made_for_kids ?? 0) / n),
  };
}

/** A ledger capped at a fixed number of units, for one-off runs outside the daily jobs. */
export function fixedLedger(maxUnits: number): QuotaLedger {
  let used = 0;
  let exhausted = false;
  return {
    async reserve(units) {
      if (exhausted || used + units > maxUnits) return false;
      used += units;
      return true;
    },
    async markExhausted() {
      exhausted = true;
    },
  };
}

export async function validateSample(
  ids: string[],
  options: { apiKey: string; fetch?: FetchLike },
): Promise<SampleReport> {
  const maxUnits = Math.ceil(ids.length / 50);
  const res = await checkVideos(ids, {
    apiKey: options.apiKey,
    fetch: options.fetch,
    ledger: fixedLedger(maxUnits),
  });
  return summarise(res.checks, res.calls, res.stoppedFor);
}
