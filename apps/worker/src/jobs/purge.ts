// purge_yt_data (daily): the 30-day rule. Any video not checked in 30 days loses every
// YouTube API field, goes back to unchecked and leaves the shuffle until it is rechecked.
// Runs even when validation is behind. Also clears expired cache rows and old rate windows.

import { YOUTUBE } from "@app/core";
import type { Queryable } from "@app/db";

export async function runPurge(db: Queryable): Promise<{ purged: number; unplayable: number }> {
  const res = await db.query<{ purged: number; unplayable: number }>(
    `with purged as (
       update yt_videos
          set title = null, duration_s = null, view_count = null, thumbnail_url = null,
              region_allowed = null, region_blocked = null, channel_id = null, channel_title = null,
              tags = null, status = 'unchecked', checked_at = null
        where checked_at < now() - make_interval(days => $1)
       returning video_id
     ), unplayable as (
       update record_videos rv set playable = false
         from purged p where rv.video_id = p.video_id and rv.playable
       returning 1
     )
     select (select count(*) from purged)::int as purged, (select count(*) from unplayable)::int as unplayable`,
    [YOUTUBE.maxDataAgeDays],
  );
  await db.query("delete from pick_cache where expires_at < now()");
  await db.query("delete from rate_limits where window_start < now() - interval '1 day'");
  return res.rows[0] ?? { purged: 0, unplayable: 0 };
}
