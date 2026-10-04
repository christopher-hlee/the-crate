// Every table holding a user's rows. Account deletion removes all of them (rule 15).

import type { Queryable } from "./client";

export const USER_TABLES = [
  "history",
  "crates",
  "notes",
  "tempo_votes",
  "link_suggestions",
  "subscriptions",
  "asset_chops",
] as const;

/** Deletes every row a user owns. crate_items and crate_assets go with crates (on delete cascade). */
export async function deleteUserRows(db: Queryable, userId: string): Promise<void> {
  for (const t of USER_TABLES) await db.query(`delete from ${t} where user_id = $1`, [userId]);
  await db.query("update video_reports set user_id = null where user_id = $1", [userId]);
}
