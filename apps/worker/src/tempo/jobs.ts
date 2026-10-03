// enrich_tempo and pick_audio_features.

import { communityConfidence, communityEstimate, GETSONGBPM } from "@app/core";
import type { Queryable } from "@app/db";
import { type FetchJson, lookupTempo } from "./getsongbpm";

const HOUR_MS = 3_600_000;
/** Lookups are retried after this long when GetSongBPM had nothing. */
const RETRY_EMPTY_DAYS = 180;

/** Reserves one GetSongBPM request in the current hour; false once 2,500 are used. */
export async function reserveGetSongBpm(db: Queryable, now = new Date()): Promise<boolean> {
  const windowStart = new Date(Math.floor(now.getTime() / HOUR_MS) * HOUR_MS);
  const res = await db.query<{ count: number }>(
    `insert into rate_limits (key, window_start, count) values ('svc:getsongbpm', $1, 1)
     on conflict (key, window_start) do update set count = rate_limits.count + 1
       where rate_limits.count < $2
     returning count`,
    [windowStart, GETSONGBPM.requestsPerHour],
  );
  return (res.rowCount ?? 0) > 0;
}

type Candidate = {
  release_id: number;
  track_position: string;
  track_title: string;
  artist: string;
};

export async function runEnrichTempo(
  db: Queryable,
  options: {
    enabled: boolean;
    apiKey: string | undefined;
    maxRequests?: number;
    fetch?: FetchJson;
  },
): Promise<{ looked: number; found: number; skipped?: string }> {
  if (!options.enabled) return { looked: 0, found: 0, skipped: "FEATURE_GETSONGBPM is off" };
  if (!options.apiKey) return { looked: 0, found: 0, skipped: "GETSONGBPM_API_KEY is not set" };
  const candidates = (
    await db.query<Candidate>(
      `select distinct on (rv.release_id, rv.track_position) rv.release_id, rv.track_position, rv.track_title,
              coalesce((select nullif(t->'artists'->0->>'anv', '') from releases r, jsonb_array_elements(r.tracklist) t
                         where r.id = rv.release_id and t->>'position' = rv.track_position limit 1),
                       (select regexp_replace(t->'artists'->0->>'name', '\\s+\\(\\d+\\)$', '') from releases r,
                               jsonb_array_elements(r.tracklist) t
                         where r.id = rv.release_id and t->>'position' = rv.track_position limit 1),
                       rv.artist_display) as artist
         from record_videos rv
        where rv.playable and rv.track_position is not null and rv.track_title is not null and rv.bpm is null
          and not exists (select 1 from track_audio_features f
                           where f.release_id = rv.release_id and f.track_position = rv.track_position
                             and f.source = 'getsongbpm'
                             and (f.bpm is not null or f.updated_at > now() - make_interval(days => $2)))
        limit $1`,
      [options.maxRequests ?? 200, RETRY_EMPTY_DAYS],
    )
  ).rows;
  let looked = 0;
  let found = 0;
  for (const c of candidates) {
    if (!(await reserveGetSongBpm(db))) break;
    looked++;
    const hit = await lookupTempo(options.apiKey, c.artist, c.track_title, options.fetch);
    if (hit?.bpm !== null && hit?.bpm !== undefined) found++;
    // A row with no BPM records "looked up, nothing found" so it isn't asked again for months.
    await db.query(
      `insert into track_audio_features (release_id, track_position, source, bpm, camelot_key, confidence, updated_at)
       values ($1, $2, 'getsongbpm', $3, $4, $5, now())
       on conflict (release_id, track_position, source) do update set bpm = excluded.bpm,
         camelot_key = excluded.camelot_key, confidence = excluded.confidence, updated_at = now()`,
      [
        c.release_id,
        c.track_position,
        hit?.bpm ?? null,
        hit?.camelotKey ?? null,
        hit?.confidence ?? 0,
      ],
    );
  }
  if (looked > 0) await runPickAudioFeatures(db);
  return { looked, found };
}

/**
 * Turns tap-tempo and key votes into community estimates, then copies each track's best
 * tempo and key (highest confidence wins) onto every record_videos row for that track.
 */
export async function runPickAudioFeatures(
  db: Queryable,
): Promise<{ community: number; updated: number }> {
  const votes = await db.query<{
    release_id: number;
    track_position: string;
    bpm: number | null;
    camelot_key: string | null;
  }>(
    "select release_id, track_position, bpm, camelot_key from tempo_votes order by release_id, track_position",
  );
  const groups = new Map<
    string,
    {
      releaseId: number;
      position: string;
      votes: { bpm: number | null; camelotKey: string | null }[];
    }
  >();
  for (const v of votes.rows) {
    const k = `${v.release_id}/${v.track_position}`;
    const g = groups.get(k) ?? { releaseId: v.release_id, position: v.track_position, votes: [] };
    g.votes.push({ bpm: v.bpm, camelotKey: v.camelot_key });
    groups.set(k, g);
  }
  let community = 0;
  for (const g of groups.values()) {
    const est = communityEstimate(g.votes);
    if (est.bpm === null && est.camelotKey === null) continue;
    // One confidence per row: it follows the tempo agreement, and a key needs two votes.
    const confidence = communityConfidence(est.bpm !== null ? est.bpmAgreeing : est.keyAgreeing);
    await db.query(
      `insert into track_audio_features (release_id, track_position, source, bpm, camelot_key, confidence, updated_at)
       values ($1, $2, 'community', $3, $4, $5, now())
       on conflict (release_id, track_position, source) do update set bpm = excluded.bpm,
         camelot_key = excluded.camelot_key, confidence = excluded.confidence, updated_at = now()`,
      [g.releaseId, g.position, est.bpm, est.keyAgreeing >= 2 ? est.camelotKey : null, confidence],
    );
    community++;
  }
  const res = await db.query(
    `update record_videos rv set bpm = b.bpm, camelot_key = b.camelot_key, tempo_source = b.bpm_source
       from track_audio_best b
      where b.release_id = rv.release_id and b.track_position = rv.track_position
        and (rv.bpm is distinct from b.bpm or rv.camelot_key is distinct from b.camelot_key
             or rv.tempo_source is distinct from b.bpm_source)`,
  );
  return { community, updated: res.rowCount ?? 0 };
}

/** Share of playable records with a tempo, overall and per style. */
export async function tempoCoverage(db: Queryable): Promise<{
  overall: { records: number; withTempo: number; share: number };
  byStyle: { style: string; records: number; withTempo: number; share: number }[];
}> {
  const share = (w: number, n: number) => (n === 0 ? 0 : Math.round((w / n) * 10_000) / 10_000);
  const records = `(select distinct on (record_key) record_key, styles,
                           bool_or(bpm is not null) over (partition by record_key) as has_tempo
                      from record_videos where playable order by record_key) r`;
  const overall = (
    await db.query<{ n: number; w: number }>(
      `select count(*)::int as n, count(*) filter (where has_tempo)::int as w from ${records}`,
    )
  ).rows[0] ?? { n: 0, w: 0 };
  const byStyle = await db.query<{ style: string; n: number; w: number }>(
    `select s as style, count(*)::int as n, count(*) filter (where has_tempo)::int as w
       from ${records}, unnest(styles) s group by s order by n desc`,
  );
  return {
    overall: { records: overall.n, withTempo: overall.w, share: share(overall.w, overall.n) },
    byStyle: byStyle.rows.map((r) => ({
      style: r.style,
      records: r.n,
      withTempo: r.w,
      share: share(r.w, r.n),
    })),
  };
}
