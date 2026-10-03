// Writes videos.list outcomes into yt_videos and mirrors playability onto record_videos.

import type { Queryable } from "@app/db";
import type { VideoCheck } from "@app/youtube";

export async function applyChecks(
  db: Queryable,
  checks: readonly VideoCheck[],
): Promise<{ statusChanged: number }> {
  if (checks.length === 0) return { statusChanged: 0 };
  const rows = checks.map((c) => ({
    video_id: c.videoId,
    status: c.status,
    title: c.title,
    duration_s: c.durationS,
    view_count: c.viewCount,
    thumbnail_url: c.thumbnailUrl,
    region_allowed: c.regionAllowed,
    region_blocked: c.regionBlocked,
  }));
  const res = await db.query<{ video_id: string }>(
    `with c as (
       select * from jsonb_to_recordset($1::jsonb) as x(
         video_id text, status text, title text, duration_s int, view_count bigint,
         thumbnail_url text, region_allowed text[], region_blocked text[])
     ),
     prev as (select y.video_id, y.status from yt_videos y join c using (video_id)),
     upd as (
       update yt_videos y set status = c.status, title = c.title, duration_s = c.duration_s,
              view_count = c.view_count, thumbnail_url = c.thumbnail_url,
              region_allowed = c.region_allowed, region_blocked = c.region_blocked, checked_at = now()
         from c where y.video_id = c.video_id
       returning y.video_id, y.status
     )
     select upd.video_id from upd join prev using (video_id) where prev.status is distinct from upd.status`,
    [JSON.stringify(rows)],
  );
  const changed = res.rows.map((r) => r.video_id);
  await syncPlayable(db, changed);
  return { statusChanged: changed.length };
}

/** Mirrors yt_videos.status = 'playable' onto every record_videos row with that video. */
export async function syncPlayable(db: Queryable, videoIds?: readonly string[]): Promise<number> {
  if (videoIds && videoIds.length === 0) return 0;
  const res = await db.query(
    `update record_videos rv set playable = (y.status = 'playable')
       from yt_videos y
      where y.video_id = rv.video_id
        and rv.playable is distinct from (y.status = 'playable')
        ${videoIds ? "and y.video_id = any($1::text[])" : ""}`,
    videoIds ? [[...videoIds]] : [],
  );
  return res.rowCount ?? 0;
}
