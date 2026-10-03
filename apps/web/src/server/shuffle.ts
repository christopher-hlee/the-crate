import "server-only";
import type { ShufflePick, ShuffleResponse } from "@app/api-client";
import {
  CACHE_TTL,
  discogsUrl,
  type Filters,
  filterHash,
  isEmptyFilter,
  RAND_KEY_MAX,
} from "@app/core";
import {
  buildCandidateListQuery,
  buildCountQuery,
  buildPickByKeyQuery,
  buildPickQuery,
  type Exclusions,
  type PickRow,
  type Queryable,
} from "@app/db";
import { cacheGet, cacheSet } from "./cache";

export function toPick(row: PickRow, thumbnailUrl: string | null): ShufflePick {
  return {
    recordKey: row.record_key,
    videoId: row.video_id,
    releaseId: row.release_id,
    track:
      row.track_position && row.track_title
        ? { position: row.track_position, title: row.track_title }
        : null,
    record: {
      title: row.title,
      artist: row.artist_display,
      label: row.label_name,
      catno: row.catno,
      year: row.year,
      country: row.country,
      styles: row.styles,
      discogsUrl: discogsUrl(row.record_key),
    },
    tempo:
      row.bpm !== null
        ? {
            bpm: Math.round(row.bpm * 10) / 10,
            camelotKey: row.camelot_key,
            source: row.tempo_source ?? "unknown",
          }
        : null,
    thumbnailUrl,
  };
}

async function withThumbnail(db: Queryable, row: PickRow | undefined): Promise<ShufflePick | null> {
  if (!row) return null;
  const t = await db.query<{ thumbnail_url: string | null }>(
    "select thumbnail_url from yt_videos where video_id = $1",
    [row.video_id],
  );
  return toPick(row, t.rows[0]?.thumbnail_url ?? null);
}

/**
 * Whether a filter set is narrow (fewer than `threshold` playable matches). Decided with a
 * capped count once an hour per filter hash, not on every pick.
 */
export async function isNarrow(
  db: Queryable,
  filters: Filters,
  threshold: number,
): Promise<boolean> {
  if (threshold <= 0 || isEmptyFilter(filters)) return false;
  const key = `narrow:v1:${filterHash(filters)}`;
  const cached = await cacheGet<{ narrow: boolean }>(db, key);
  if (cached) return cached.narrow;
  const q = buildCountQuery(filters, { cap: threshold });
  const n = (await db.query<{ n: number }>(q.text, q.values)).rows[0]?.n ?? 0;
  const narrow = n < threshold;
  await cacheSet(db, key, { narrow, n }, CACHE_TTL.narrowListSeconds);
  return narrow;
}

/** Every match for a narrow filter set in the viewer's country, cached for an hour. */
export async function candidateList(
  db: Queryable,
  filters: Filters,
  threshold: number,
  country: string | null,
): Promise<[string, string][]> {
  const key = `list:v1:${filterHash(filters)}:${country ?? "-"}`;
  const cached = await cacheGet<{ items: [string, string][] }>(db, key);
  if (cached) return cached.items;
  const q = buildCandidateListQuery(filters, { limit: threshold + 1, viewerCountry: country });
  const res = await db.query<{ record_key: string; video_id: string }>(q.text, q.values);
  const items = res.rows.map((r) => [r.record_key, r.video_id] as [string, string]);
  await cacheSet(db, key, { items }, CACHE_TTL.narrowListSeconds);
  return items;
}

export type PickOptions = {
  filters: Filters;
  exclusions: { session: readonly string[]; seen: readonly string[] };
  userId: string | null;
  viewerCountry: string | null;
  threshold: number;
  random?: () => number;
};

export async function pickNext(db: Queryable, o: PickOptions): Promise<ShuffleResponse> {
  const random = o.random ?? Math.random;
  const ex: Exclusions = {
    sessionRecordKeys: o.exclusions.session,
    clientSeenIds: o.userId ? [] : o.exclusions.seen,
    userId: o.userId,
    viewerCountry: o.viewerCountry,
  };

  if (await isNarrow(db, o.filters, o.threshold)) {
    const session = new Set(o.exclusions.session);
    const seen = new Set(o.exclusions.seen);
    let candidates = (await candidateList(db, o.filters, o.threshold, o.viewerCountry)).filter(
      ([rk, vid]) => !session.has(rk) && !seen.has(vid),
    );
    if (o.userId && candidates.length > 0) {
      const played = await db.query<{ video_id: string }>(
        "select distinct video_id from history where user_id = $1 and video_id = any($2::text[])",
        [o.userId, candidates.map(([, v]) => v)],
      );
      const playedIds = new Set(played.rows.map((r) => r.video_id));
      candidates = candidates.filter(([, v]) => !playedIds.has(v));
    }
    // The list can be up to an hour old; skip anything that stopped being playable.
    for (let attempt = 0; attempt < 5 && candidates.length > 0; attempt++) {
      const i = Math.floor(random() * candidates.length);
      const [rk, vid] = candidates[i] as [string, string];
      const q = buildPickByKeyQuery(rk, vid);
      const row = (await db.query<PickRow>(q.text, q.values)).rows[0];
      if (row) return { pick: await withThumbnail(db, row), via: "list" };
      candidates.splice(i, 1);
    }
    return { pick: null, via: "list" };
  }

  const r = Math.floor(random() * RAND_KEY_MAX);
  let q = buildPickQuery(o.filters, { ...ex, r });
  let row = (await db.query<PickRow>(q.text, q.values)).rows[0];
  if (!row && r > 0) {
    q = buildPickQuery(o.filters, { ...ex, r: 0 });
    row = (await db.query<PickRow>(q.text, q.values)).rows[0];
  }
  return { pick: await withThumbnail(db, row), via: "seek" };
}
