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

export type VideoFacts = {
  thumbnailUrl: string | null;
  channel: ShufflePick["channel"];
  favorited: boolean;
};

const NO_FACTS: VideoFacts = { thumbnailUrl: null, channel: null, favorited: false };

export function toPick(row: PickRow, facts: VideoFacts = NO_FACTS): ShufflePick {
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
    thumbnailUrl: facts.thumbnailUrl,
    channel: facts.channel,
    favorited: facts.favorited,
  };
}

/** The pick's YouTube facts (thumbnail, channel; refreshed within 30 days) and favorite state. */
async function withFacts(
  db: Queryable,
  row: PickRow | undefined,
  userId: string | null,
): Promise<ShufflePick | null> {
  if (!row) return null;
  const t = await db.query<{
    thumbnail_url: string | null;
    channel_id: string | null;
    channel_title: string | null;
    favorited: boolean;
  }>(
    `select y.thumbnail_url, y.channel_id, y.channel_title,
            ($2::uuid is not null and exists (select 1 from favorites f where f.user_id = $2::uuid
               and f.record_key = $3 and f.video_id = $1)) as favorited
       from (select $1::text as video_id) v left join yt_videos y on y.video_id = v.video_id`,
    [row.video_id, userId, row.record_key],
  );
  const f = t.rows[0];
  return toPick(row, {
    thumbnailUrl: f?.thumbnail_url ?? null,
    channel:
      f?.channel_id && f.channel_title
        ? { id: f.channel_id, title: f.channel_title, topic: f.channel_title.endsWith(" - Topic") }
        : null,
    favorited: f?.favorited ?? false,
  });
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
  exclusions: { session: readonly string[]; seen: readonly string[]; repeats?: boolean };
  userId: string | null;
  viewerCountry: string | null;
  threshold: number;
  random?: () => number;
};

export async function pickNext(db: Queryable, o: PickOptions): Promise<ShuffleResponse> {
  const random = o.random ?? Math.random;
  // With repeats on, only this session's records are skipped, not everything heard before.
  const repeats = o.exclusions.repeats === true;
  // "More from this release" scopes the shuffle to records this session has already shown
  // (the one on screen, at least), so those can't also be skipped as session records.
  const scoped = new Set(o.filters.recordKeys ?? []);
  const sessionKeys = o.exclusions.session.filter((k) => !scoped.has(k));
  // `seen` is the client's own list of videos to skip, honoured for everyone: a signed-out
  // user's seen list, or the video on screen. Clients leave their seen list out with repeats
  // on; signed-in users' history is skipped here unless repeats are on.
  const seenIds = o.exclusions.seen;
  const ex: Exclusions = {
    sessionRecordKeys: sessionKeys,
    clientSeenIds: seenIds,
    userId: repeats ? null : o.userId,
    viewerCountry: o.viewerCountry,
  };

  if (await isNarrow(db, o.filters, o.threshold)) {
    const session = new Set(sessionKeys);
    const seen = new Set(seenIds);
    let candidates = (await candidateList(db, o.filters, o.threshold, o.viewerCountry)).filter(
      ([rk, vid]) => !session.has(rk) && !seen.has(vid),
    );
    if (o.userId && !repeats && candidates.length > 0) {
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
      if (row) return { pick: await withFacts(db, row, o.userId), via: "list" };
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
  return { pick: await withFacts(db, row, o.userId), via: "seek" };
}
