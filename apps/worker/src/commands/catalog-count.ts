// catalog:count — streams a releases dump and reports what the catalog would hold.

import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { decadeOf, recordKeyFor, YOUTUBE } from "@app/core";
import {
  checksumFor,
  fileNameOf,
  type ParserStats,
  parseReleaseStream,
  youtubeVideos,
} from "@app/discogs";
import { isUrl, looksGzipped, newTap, openSource, tapStream } from "../source";

type Counts = Record<string, number>;

export type CountReport = {
  source: string;
  startedAt: string;
  finishedAt: string;
  runSeconds: number;
  bytesRead: number;
  sha256: string;
  checksum: { expected: string | null; matches: boolean | null };
  releasesScanned: number;
  releasesWithYouTubeLinks: number;
  shareOfReleasesLinked: number;
  youtubeLinks: number;
  uniqueVideoIds: number;
  embedFalse: { links: number; uniqueVideoIds: number; shareOfUniqueVideoIds: number };
  nonYouTubeLinks: number;
  records: { withYouTubeLinks: number };
  linked: { byGenre: Counts; byStyle: Counts; byDecade: Counts };
  all: { byGenre: Counts; byDecade: Counts };
  parseErrors: { count: number; first: string[] };
  quota: {
    idsPerDailyUnit: number;
    unitsPerDayFor30DayRefresh: number;
    dailyUnitBudget: number;
    fitsBudget: boolean;
  };
};

function bump(counts: Counts, key: string, by = 1): void {
  counts[key] = (counts[key] ?? 0) + by;
}

function sorted(counts: Counts): Counts {
  return Object.fromEntries(
    Object.entries(counts).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)),
  );
}

function round(n: number, places = 4): number {
  const f = 10 ** places;
  return Math.round(n * f) / f;
}

export type CountOptions = {
  source: string;
  gzip?: boolean;
  dailyUnitBudget?: number;
  /** Published checksum text; when omitted for a URL, `verify` fetches it next to the dump. */
  checksumText?: string;
  verify?: boolean;
  fetch?: typeof fetch;
  onProgress?: (scanned: number, bytes: number) => void;
};

async function fetchChecksum(source: string, fetchImpl: typeof fetch): Promise<string | null> {
  const name = fileNameOf(source);
  const m = /^discogs_(\d{8})_releases\.xml\.gz$/.exec(name);
  if (!m || !isUrl(source)) return null;
  const url = source.replace(name, `discogs_${m[1]}_CHECKSUM.txt`);
  const res = await fetchImpl(url);
  return res.ok ? res.text() : null;
}

export async function countCatalog(options: CountOptions): Promise<CountReport> {
  const fetchImpl = options.fetch ?? fetch;
  const started = new Date();
  const t0 = performance.now();
  const tap = newTap();
  const raw = await openSource(options.source, fetchImpl);
  const tapped = raw.pipe(tapStream(tap));
  raw.on("error", (err) => tapped.destroy(err));
  const stats: ParserStats = { errors: 0, firstErrors: [] };
  const gzip = options.gzip ?? looksGzipped(options.source);

  let scanned = 0;
  let linkedReleases = 0;
  let links = 0;
  let embedFalseLinks = 0;
  let nonYouTube = 0;
  const ids = new Set<string>();
  const embedFalseIds = new Set<string>();
  const records = new Set<string>();
  const linked = { byGenre: {} as Counts, byStyle: {} as Counts, byDecade: {} as Counts };
  const all = { byGenre: {} as Counts, byDecade: {} as Counts };

  for await (const r of parseReleaseStream(tapped, { gzip, stats })) {
    scanned++;
    const decade = r.year === null ? "unknown" : `${decadeOf(r.year)}s`;
    bump(all.byDecade, decade);
    for (const g of r.genres) bump(all.byGenre, g);
    const yt = youtubeVideos(r);
    nonYouTube += r.videos.filter((v) => v.videoId === null).length;
    if (yt.length > 0) {
      linkedReleases++;
      links += yt.length;
      records.add(recordKeyFor(r.masterId, r.id));
      bump(linked.byDecade, decade);
      for (const g of new Set(r.genres)) bump(linked.byGenre, g);
      for (const s of new Set(r.styles)) bump(linked.byStyle, s);
      for (const v of yt) {
        const id = v.videoId as string;
        ids.add(id);
        if (!v.embed) {
          embedFalseLinks++;
          embedFalseIds.add(id);
        }
      }
    }
    if (options.onProgress && scanned % 100_000 === 0) options.onProgress(scanned, tap.bytes);
  }

  const sha256 = tap.hash.digest("hex");
  const checksumText =
    options.checksumText ??
    (options.verify ? await fetchChecksum(options.source, fetchImpl) : null);
  const expected = checksumText ? checksumFor(checksumText, fileNameOf(options.source)) : null;
  const budget = options.dailyUnitBudget ?? YOUTUBE.defaultDailyUnitBudget;
  const idsPerUnit = YOUTUBE.idsPerCall * YOUTUBE.maxDataAgeDays;
  const unitsPerDay = Math.ceil(ids.size / idsPerUnit);

  return {
    source: options.source,
    startedAt: started.toISOString(),
    finishedAt: new Date().toISOString(),
    runSeconds: round((performance.now() - t0) / 1000, 1),
    bytesRead: tap.bytes,
    sha256,
    checksum: { expected, matches: expected === null ? null : expected === sha256 },
    releasesScanned: scanned,
    releasesWithYouTubeLinks: linkedReleases,
    shareOfReleasesLinked: scanned === 0 ? 0 : round(linkedReleases / scanned),
    youtubeLinks: links,
    uniqueVideoIds: ids.size,
    embedFalse: {
      links: embedFalseLinks,
      uniqueVideoIds: embedFalseIds.size,
      shareOfUniqueVideoIds: ids.size === 0 ? 0 : round(embedFalseIds.size / ids.size),
    },
    nonYouTubeLinks: nonYouTube,
    records: { withYouTubeLinks: records.size },
    linked: {
      byGenre: sorted(linked.byGenre),
      byStyle: sorted(linked.byStyle),
      byDecade: sorted(linked.byDecade),
    },
    all: { byGenre: sorted(all.byGenre), byDecade: sorted(all.byDecade) },
    parseErrors: { count: stats.errors, first: stats.firstErrors },
    quota: {
      idsPerDailyUnit: idsPerUnit,
      unitsPerDayFor30DayRefresh: unitsPerDay,
      dailyUnitBudget: budget,
      fitsBudget: unitsPerDay <= budget,
    },
  };
}

export async function writeReport(path: string, report: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(report, null, 2)}\n`);
}
