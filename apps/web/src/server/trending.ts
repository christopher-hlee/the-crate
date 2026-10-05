import "server-only";
import type { TrendingItem, TrendingResponse } from "@app/api-client";
import type { Pool } from "@app/db";
import { cacheGet, cacheSet } from "./cache";
import { catalogItems } from "./records";

/**
 * Trending: the playable records the most different people favorited in the last week. Built
 * only from our own favorites (never YouTube views or other API data), and a record needs at
 * least two fans so no one person's taste is on show.
 */
export const TRENDING = { days: 7, minFans: 2, size: 50, cacheSeconds: 10 * 60 } as const;

export async function trending(db: Pool): Promise<TrendingResponse> {
  const key = "trending:v1";
  const cached = await cacheGet<TrendingResponse>(db, key);
  if (cached) return cached;
  const res = await db.query<{ record_key: string; video_id: string; fans: number }>(
    `select f.record_key, f.video_id, count(distinct f.user_id)::int as fans
       from favorites f
       join record_videos rv on rv.record_key = f.record_key and rv.video_id = f.video_id
      where rv.playable and f.added_at > now() - make_interval(days => $1)
      group by f.record_key, f.video_id
     having count(distinct f.user_id) >= $2
      order by fans desc, max(f.added_at) desc, f.record_key
      limit $3`,
    [TRENDING.days, TRENDING.minFans, TRENDING.size],
  );
  const items = await catalogItems(
    db,
    res.rows.map((r) => ({ recordKey: r.record_key, videoId: r.video_id })),
  );
  const out: TrendingItem[] = [];
  for (const r of res.rows) {
    const item = items.get(`${r.record_key}/${r.video_id}`);
    if (item?.available) out.push({ ...item, fans: r.fans });
  }
  const body: TrendingResponse = { items: out, days: TRENDING.days };
  await cacheSet(db, key, body, TRENDING.cacheSeconds);
  return body;
}
