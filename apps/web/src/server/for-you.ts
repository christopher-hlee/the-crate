import "server-only";
import type { ForYouResponse } from "@app/api-client";
import { dailySeed, hash32 } from "@app/core";
import type { Pool } from "@app/db";
import { seededPage } from "./sequence";

/**
 * "For you": a daily seeded order drawn from the styles a user favorites most (or, before any
 * favorites, plays most). Same order all day for that user; new tomorrow.
 */
export async function forYou(
  db: Pool,
  userId: string,
  page: number,
  now = new Date(),
): Promise<ForYouResponse> {
  const res = await db.query<{ style: string }>(
    `with mine as (
       select record_key, video_id, 3 as weight from favorites where user_id = $1
       union all
       select record_key, video_id, 1 from history where user_id = $1
     )
     select s.style from mine m
       join record_videos rv on rv.record_key = m.record_key and rv.video_id = m.video_id
       cross join lateral unnest(rv.styles) as s(style)
      group by s.style order by sum(m.weight) desc, s.style limit 3`,
    [userId],
  );
  const basis = res.rows.map((r) => r.style);
  if (basis.length === 0) return { items: [], page, hasMore: false, seed: 0, basis };
  const seed = hash32(`${userId}:${dailySeed(now)}`) % 2_147_483_647;
  const seq = await seededPage(db, { styles: basis }, seed, page);
  return { ...seq, basis };
}
