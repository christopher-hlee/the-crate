// Every table holding a user's rows. Account deletion removes all of them (rule 15).

import { COMMENT_HIDE_AFTER_REPORTS } from "@app/core";
import type { Queryable } from "./client";

export const USER_TABLES = [
  "history",
  "crates",
  "notes",
  "tempo_votes",
  "link_suggestions",
  "subscriptions",
  "asset_chops",
  "favorites",
  "saved_filters",
  "comment_reports",
  "comments",
  "profiles",
  "user_blocks",
] as const;

export type UserTable = (typeof USER_TABLES)[number];

/** The columns naming a user, where it isn't just `user_id`. A row goes if any of them match. */
export const USER_COLUMNS: Partial<Record<UserTable, readonly string[]>> = {
  user_blocks: ["blocker_id", "blocked_id"],
};

/**
 * Works a comment's report count and hidden flag out from the live comment_reports rows,
 * counting only reporters who have a display name. Locks the comments first, so the count
 * sees every report committed before it.
 */
export async function recountCommentReports(
  db: Queryable,
  commentIds: readonly string[],
): Promise<void> {
  if (commentIds.length === 0) return;
  const ids = [...new Set(commentIds)];
  await db.query("select id from comments where id = any($1::uuid[]) order by id for update", [
    ids,
  ]);
  await db.query(
    `update comments c
        set report_count = r.n, hidden = r.n >= $2
       from (select c2.id, count(p.user_id)::int as n
               from comments c2
               left join comment_reports cr on cr.comment_id = c2.id
               left join profiles p on p.user_id = cr.user_id
              where c2.id = any($1::uuid[])
              group by c2.id) r
      where c.id = r.id`,
    [ids, COMMENT_HIDE_AFTER_REPORTS],
  );
}

/**
 * Deletes every row a user owns. crate_items and crate_assets go with crates (on delete
 * cascade). Comments the user reported are recounted without their reports, so a deleted
 * account's reports stop counting toward hiding.
 */
export async function deleteUserRows(db: Queryable, userId: string): Promise<void> {
  const reported = await db.query<{ comment_id: string }>(
    "select comment_id from comment_reports where user_id = $1",
    [userId],
  );
  for (const t of USER_TABLES) {
    const columns = USER_COLUMNS[t] ?? ["user_id"];
    await db.query(`delete from ${t} where ${columns.map((c) => `${c} = $1`).join(" or ")}`, [
      userId,
    ]);
  }
  await db.query("update video_reports set user_id = null where user_id = $1", [userId]);
  await recountCommentReports(
    db,
    reported.rows.map((r) => r.comment_id),
  );
}
