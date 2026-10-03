// validate_link_suggestions (every 10 minutes): users suggest a YouTube link for a record;
// the worker checks it with videos.list and, when it plays, adds it to the catalog. Accepted
// suggestions are joined into every later rebuild.

import { RAND_KEY_MAX, YOUTUBE } from "@app/core";
import type { Queryable } from "@app/db";
import { checkVideos } from "@app/youtube";
import { pgLedger } from "./ledger";
import type { YouTubeDeps } from "./validate";
import { applyChecks } from "./youtube-state";

type Pending = { id: string; record_key: string; video_id: string };

async function reject(db: Queryable, id: string, reason: string): Promise<void> {
  await db.query(
    "update link_suggestions set status = 'rejected', reason = $2, checked_at = now() where id = $1",
    [id, reason],
  );
}

export async function runValidateSuggestions(
  deps: YouTubeDeps,
  limit = 200,
): Promise<{ accepted: number; rejected: number }> {
  const { db } = deps;
  const pending = (
    await db.query<Pending>(
      "select id, record_key, video_id from link_suggestions where status = 'pending' order by created_at limit $1",
      [limit],
    )
  ).rows;
  let accepted = 0;
  let rejected = 0;
  const toCheck: Pending[] = [];
  for (const s of pending) {
    const rec = await db.query<{ linked: boolean }>(
      "select bool_or(video_id = $2) as linked from record_videos where record_key = $1",
      [s.record_key, s.video_id],
    );
    const linked = rec.rows[0]?.linked;
    if (linked === null || linked === undefined) {
      await reject(db, s.id, "record_not_in_catalog");
      rejected++;
    } else if (linked) {
      await reject(db, s.id, "already_linked");
      rejected++;
    } else {
      toCheck.push(s);
    }
  }
  if (toCheck.length === 0) return { accepted, rejected };

  // Make sure every suggested ID has a yt_videos row before recording the check.
  await db.query(
    `insert into yt_videos (video_id, dump_embed_flag, first_seen_dump)
     select unnest($1::text[]), true, current_date on conflict do nothing`,
    [toCheck.map((s) => s.video_id)],
  );
  const res = await checkVideos(
    toCheck.map((s) => s.video_id),
    {
      apiKey: deps.apiKey,
      fetch: deps.fetch,
      referer: deps.referer,
      ledger: pgLedger(db, deps.budget, deps.now),
    },
  );
  await applyChecks(db, res.checks);
  const byId = new Map(res.checks.map((c) => [c.videoId, c]));
  for (const s of toCheck) {
    const c = byId.get(s.video_id);
    if (!c) continue; // budget ran out; stays pending for the next run
    if (c.status !== "playable") {
      await reject(db, s.id, c.status);
      rejected++;
      continue;
    }
    await db.query(
      `insert into record_videos (record_key, video_id, release_id, track_position, track_title, title,
         artist_display, artist_ids, label_id, label_name, catno, year, country, genres, styles,
         format_names, format_descriptions, pressings, deep_cut, bpm, camelot_key, tempo_source,
         rand_key, playable, added_in_dump)
       select record_key, $2, release_id, null, null, title, artist_display, artist_ids, label_id,
              label_name, catno, year, country, genres, styles, format_names, format_descriptions,
              pressings, deep_cut, null, null, null, $3, true,
              coalesce((select max(dump_date) from ingest_runs where status = 'succeeded'), current_date)
         from record_videos where record_key = $1
        order by (track_position is null), release_id
        limit 1
       on conflict (record_key, video_id) do nothing`,
      [s.record_key, s.video_id, Math.floor(Math.random() * RAND_KEY_MAX)],
    );
    await db.query(
      "update link_suggestions set status = 'accepted', reason = null, checked_at = now() where id = $1",
      [s.id],
    );
    accepted++;
  }
  return { accepted, rejected };
}

export const SUGGESTION_IDS_PER_RUN = 200 / YOUTUBE.idsPerCall;
