// Stage: parse the dump once and COPY slim facts for every release, full rows for releases
// with YouTube links (or with accepted link suggestions), and one raw row per link.

import type { Readable } from "node:stream";
import { artistDisplay, matchVideosToTracks, recordKeyFor, stripDiscogsSuffix } from "@app/core";
import {
  CopyWriter,
  FACTS_COLUMNS,
  type Pool,
  RELEASE_COLUMNS,
  RELEASE_VIDEO_COLUMNS,
} from "@app/db";
import {
  type DiscogsRelease,
  type ParserStats,
  parseReleaseStream,
  youtubeVideos,
} from "@app/discogs";

export type StageCounts = {
  releasesSeen: number;
  releasesStaged: number;
  linksStaged: number;
  parseErrors: number;
};

function uniq(values: readonly string[]): string[] {
  return [...new Set(values.filter((v) => v !== ""))];
}

export function factsRow(r: DiscogsRelease, recordKey: string) {
  return [
    r.id,
    r.masterId,
    recordKey,
    r.isMainRelease,
    r.year,
    r.country,
    r.labels.find((l) => l.id !== null)?.id ?? null,
    uniq(r.genres),
    uniq(r.styles),
    uniq(r.formats.map((f) => f.name)),
    uniq(r.formats.flatMap((f) => f.descriptions)),
  ] as const;
}

export function releaseRow(r: DiscogsRelease, recordKey: string) {
  return [
    r.id,
    r.masterId,
    recordKey,
    r.isMainRelease,
    r.title,
    { json: r.artists },
    artistDisplay(r.artists),
    { json: r.labels },
    r.year,
    r.country,
    uniq(r.genres),
    uniq(r.styles),
    { json: r.formats },
    {
      json: r.tracklist.map((t) => ({
        position: t.position,
        title: t.title,
        duration_s: t.durationS,
        artists: t.artists,
      })),
    },
  ] as const;
}

/** One row per YouTube link, with the track it matched (if any). */
export function linkRows(r: DiscogsRelease, recordKey: string) {
  const videos = youtubeVideos(r);
  const matches = matchVideosToTracks(
    videos.map((v) => ({ videoId: v.videoId as string, title: v.title })),
    r.tracklist.map((t) => ({
      position: t.position,
      title: t.title,
      artists: t.artists.map((a) => a.anv || stripDiscogsSuffix(a.name)),
    })),
    artistDisplay(r.artists),
  );
  const byVideo = new Map(matches.map((m) => [m.videoId, r.tracklist[m.trackIndex]]));
  return videos.map((v, i) => {
    const track = byVideo.get(v.videoId as string);
    return [
      r.id,
      recordKey,
      v.videoId as string,
      v.embed,
      track?.position ?? null,
      track?.title ?? null,
      i,
    ] as const;
  });
}

export async function stageReleases(options: {
  pool: Pool;
  bytes: Readable;
  gzip: boolean;
  /** Records with accepted link suggestions keep full rows even without dump links. */
  keepRecordKeys: ReadonlySet<string>;
  log?: (msg: string) => void;
}): Promise<StageCounts> {
  const clients = await Promise.all([
    options.pool.connect(),
    options.pool.connect(),
    options.pool.connect(),
  ]);
  const [c1, c2, c3] = clients as [(typeof clients)[0], (typeof clients)[0], (typeof clients)[0]];
  const facts = await CopyWriter.open(c1, "stg_release_facts", FACTS_COLUMNS);
  const releases = await CopyWriter.open(c2, "stg_releases", RELEASE_COLUMNS);
  const links = await CopyWriter.open(c3, "stg_release_videos", RELEASE_VIDEO_COLUMNS);
  const stats: ParserStats = { errors: 0, firstErrors: [] };
  let seen = 0;
  let failed: unknown = null;
  try {
    for await (const r of parseReleaseStream(options.bytes, { gzip: options.gzip, stats })) {
      seen++;
      const recordKey = recordKeyFor(r.masterId, r.id);
      await facts.write(factsRow(r, recordKey));
      const rows = linkRows(r, recordKey);
      if (rows.length > 0 || options.keepRecordKeys.has(recordKey)) {
        await releases.write(releaseRow(r, recordKey));
        for (const row of rows) await links.write(row);
      }
      if (seen % 500_000 === 0) options.log?.(`  staged ${seen.toLocaleString("en-US")} releases`);
    }
    await Promise.all([facts.end(), releases.end(), links.end()]);
  } catch (err) {
    failed = err;
    for (const w of [facts, releases, links]) w.abort(err);
    throw err;
  } finally {
    for (const c of clients) c.release(failed ? (failed as Error) : undefined);
  }
  return {
    releasesSeen: seen,
    releasesStaged: releases.count,
    linksStaged: links.count,
    parseErrors: stats.errors,
  };
}
