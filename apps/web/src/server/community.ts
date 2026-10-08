import "server-only";
import type { Comment, MyComment } from "@app/api-client";
import {
  contributionPoints,
  effectivePlan,
  normalizeDisplayName,
  type Rank,
  rankFor,
} from "@app/core";
import { type Pool, withTransaction } from "@app/db";
import { HttpError, notFound } from "./http";

/** Comments hide themselves once this many different people report them. */
export const HIDE_AFTER_REPORTS = 3;

export async function profileOf(db: Pool, userId: string): Promise<{ displayName: string } | null> {
  const res = await db.query<{ display_name: string }>(
    "select display_name from profiles where user_id = $1",
    [userId],
  );
  const row = res.rows[0];
  return row ? { displayName: row.display_name } : null;
}

export async function setDisplayName(db: Pool, userId: string, displayName: string) {
  try {
    await db.query(
      `insert into profiles (user_id, display_name) values ($1, $2)
       on conflict (user_id) do update set display_name = excluded.display_name, updated_at = now()`,
      [userId, normalizeDisplayName(displayName)],
    );
  } catch (err) {
    if ((err as { code?: string }).code === "23505")
      throw new HttpError(409, "conflict", "That name is taken.");
    throw err;
  }
  return { displayName: normalizeDisplayName(displayName) };
}

/** Ranks for many users at once: favorites, comments and tempo/key votes. */
export async function ranksFor(db: Pool, userIds: readonly string[]): Promise<Map<string, Rank>> {
  const out = new Map<string, Rank>();
  if (userIds.length === 0) return out;
  const res = await db.query<{
    user_id: string;
    favorites: number;
    comments: number;
    votes: number;
  }>(
    `select u.user_id,
            (select count(*) from favorites f where f.user_id = u.user_id)::int as favorites,
            (select count(*) from comments c where c.user_id = u.user_id and not c.hidden)::int as comments,
            (select count(*) from tempo_votes v where v.user_id = u.user_id)::int as votes
       from unnest($1::uuid[]) as u(user_id)`,
    [[...new Set(userIds)]],
  );
  for (const r of res.rows) out.set(r.user_id, rankFor(contributionPoints(r)));
  return out;
}

type CommentRow = {
  id: string;
  user_id: string;
  body: string;
  created_at: Date;
  display_name: string | null;
  plan: string | null;
  expires_at: Date | null;
};

export async function listComments(
  db: Pool,
  recordKey: string,
  viewerId: string | null,
): Promise<Comment[]> {
  const res = await db.query<CommentRow>(
    `select c.id, c.user_id, c.body, c.created_at, p.display_name, s.plan, s.expires_at
       from comments c
       left join profiles p on p.user_id = c.user_id
       left join subscriptions s on s.user_id = c.user_id
      where c.record_key = $1 and not c.hidden
      order by c.created_at desc limit 200`,
    [recordKey],
  );
  const ranks = await ranksFor(
    db,
    res.rows.map((r) => r.user_id),
  );
  const now = new Date();
  return res.rows.map((r) => {
    const rank = ranks.get(r.user_id) ?? rankFor(0);
    return {
      id: r.id,
      body: r.body,
      createdAt: r.created_at.toISOString(),
      author: {
        displayName: r.display_name ?? "Digger",
        rank: { level: rank.level, title: rank.title },
        pro:
          effectivePlan(r.plan ? { plan: r.plan, expiresAt: r.expires_at } : null, now) === "pro",
      },
      mine: r.user_id === viewerId,
    };
  });
}

/** The viewer's own comments, newest first, with the record they're on. */
export async function myComments(db: Pool, userId: string): Promise<MyComment[]> {
  const res = await db.query<{
    id: string;
    record_key: string;
    body: string;
    created_at: Date;
    hidden: boolean;
    title: string | null;
    artist_display: string | null;
  }>(
    `select c.id, c.record_key, c.body, c.created_at, c.hidden, r.title, r.artist_display
       from comments c
       left join lateral (
         select title, artist_display from record_videos rv
          where rv.record_key = c.record_key limit 1
       ) r on true
      where c.user_id = $1
      order by c.created_at desc limit 500`,
    [userId],
  );
  return res.rows.map((r) => ({
    id: r.id,
    recordKey: r.record_key,
    body: r.body,
    createdAt: r.created_at.toISOString(),
    hidden: r.hidden,
    record: r.title ? { title: r.title, artist: r.artist_display ?? "" } : null,
  }));
}

export async function addComment(
  db: Pool,
  userId: string,
  recordKey: string,
  body: string,
): Promise<Comment> {
  const profile = await profileOf(db, userId);
  if (!profile) throw new HttpError(409, "conflict", "Choose a display name before commenting.");
  const known = await db.query("select 1 from record_videos where record_key = $1 limit 1", [
    recordKey,
  ]);
  if (!known.rowCount) throw notFound("That record");
  const res = await db.query<{ id: string }>(
    "insert into comments (record_key, user_id, body) values ($1, $2, $3) returning id",
    [recordKey, userId, body.trim()],
  );
  const id = res.rows[0]?.id as string;
  const all = await listComments(db, recordKey, userId);
  return all.find((c) => c.id === id) as Comment;
}

export async function deleteComment(db: Pool, userId: string, id: string): Promise<void> {
  const res = await db.query("delete from comments where id = $1 and user_id = $2", [id, userId]);
  if (!res.rowCount) throw notFound("That comment");
}

/** One report per person per comment; enough reports hide it until a moderator looks. */
export async function reportComment(db: Pool, userId: string, id: string): Promise<void> {
  await withTransaction(db, async (client) => {
    const c = await client.query<{ user_id: string }>(
      "select user_id from comments where id = $1 for update",
      [id],
    );
    const row = c.rows[0];
    if (!row) throw notFound("That comment");
    if (row.user_id === userId) return;
    const ins = await client.query(
      "insert into comment_reports (comment_id, user_id) values ($1, $2) on conflict do nothing",
      [id, userId],
    );
    if (!ins.rowCount) return;
    await client.query(
      `update comments set report_count = report_count + 1,
              hidden = hidden or report_count + 1 >= $2
        where id = $1`,
      [id, HIDE_AFTER_REPORTS],
    );
  });
}
