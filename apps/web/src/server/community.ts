import "server-only";
import type {
  BlockedCommenter,
  BlockedCommentersResponse,
  Comment,
  MyComment,
} from "@app/api-client";
import {
  type BlockedTerms,
  COMMENT_BLOCKS_MAX,
  COMMENT_HIDE_AFTER_REPORTS,
  commentProblem,
  contributionPoints,
  displayNameContentProblem,
  effectivePlan,
  normalizeDisplayName,
  parseBlockedTerms,
  type Rank,
  rankFor,
} from "@app/core";
import { type Pool, recountCommentReports, withTransaction } from "@app/db";
import { badRequest, HttpError, limitReached, notFound } from "./http";

/** Comments hide themselves once this many different people with a display name report them. */
export const HIDE_AFTER_REPORTS = COMMENT_HIDE_AFTER_REPORTS;

let termsCache: { raw: string | undefined; terms: BlockedTerms } | null = null;

/** The operator's blocked-terms list (COMMENT_BLOCKED_TERMS), parsed once per value. */
export function commentBlockedTerms(): BlockedTerms {
  const raw = process.env.COMMENT_BLOCKED_TERMS;
  if (!termsCache || termsCache.raw !== raw) termsCache = { raw, terms: parseBlockedTerms(raw) };
  return termsCache.terms;
}

export async function profileOf(db: Pool, userId: string): Promise<{ displayName: string } | null> {
  const res = await db.query<{ display_name: string }>(
    "select display_name from profiles where user_id = $1",
    [userId],
  );
  const row = res.rows[0];
  return row ? { displayName: row.display_name } : null;
}

export async function setDisplayName(
  db: Pool,
  userId: string,
  displayName: string,
  blockedTerms: BlockedTerms = commentBlockedTerms(),
) {
  // The name shows beside every comment, so it passes the same content filter.
  const problem = displayNameContentProblem(normalizeDisplayName(displayName), blockedTerms);
  if (problem) throw badRequest(problem);
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

/** A record's visible comments, leaving out anyone the viewer has blocked. */
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
        and ($2::uuid is null or not exists (
          select 1 from user_blocks b where b.blocker_id = $2 and b.blocked_id = c.user_id))
      order by c.created_at desc limit 200`,
    [recordKey, viewerId],
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
  blockedTerms: BlockedTerms = commentBlockedTerms(),
): Promise<Comment> {
  const profile = await profileOf(db, userId);
  if (!profile) throw new HttpError(409, "conflict", "Choose a display name before commenting.");
  // Links and the operator's blocked terms are refused before anything is stored.
  const problem = commentProblem(body, blockedTerms);
  if (problem) throw badRequest(problem);
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

/**
 * One report per person per comment, and only from people with a display name. Whether the
 * comment hides is worked out from the live report rows in the same transaction, never from a
 * counter, so reports from deleted accounts stop counting (DECISIONS 37).
 */
export async function reportComment(db: Pool, userId: string, id: string): Promise<void> {
  await withTransaction(db, async (client) => {
    const c = await client.query<{ user_id: string }>(
      "select user_id from comments where id = $1 for update",
      [id],
    );
    const row = c.rows[0];
    if (!row) throw notFound("That comment");
    if (row.user_id === userId) return;
    const reporter = await client.query("select 1 from profiles where user_id = $1", [userId]);
    if (!reporter.rowCount)
      throw new HttpError(409, "conflict", "Choose a display name before reporting a comment.");
    await client.query(
      "insert into comment_reports (comment_id, user_id) values ($1, $2) on conflict do nothing",
      [id, userId],
    );
    await recountCommentReports(client, [id]);
  });
}

type BlockRow = { id: string; created_at: Date; display_name: string | null };

const toBlocked = (r: BlockRow): BlockedCommenter => ({
  id: r.id,
  displayName: r.display_name ?? "Digger",
  blockedAt: r.created_at.toISOString(),
});

const BLOCK_SELECT = `select b.id, b.created_at, p.display_name
   from user_blocks b left join profiles p on p.user_id = b.blocked_id`;

/**
 * Blocks a comment's author for the viewer, whose lists then leave out everything that author
 * posts. The author's user ID never leaves the server: the viewer gets the block's own ID.
 */
export async function blockCommenter(
  db: Pool,
  userId: string,
  commentId: string,
): Promise<BlockedCommenter> {
  const c = await db.query<{ user_id: string }>("select user_id from comments where id = $1", [
    commentId,
  ]);
  const author = c.rows[0]?.user_id;
  if (!author) throw notFound("That comment");
  if (author === userId) throw badRequest("You can't block yourself.");
  const find = async () =>
    (
      await db.query<BlockRow>(`${BLOCK_SELECT} where b.blocker_id = $1 and b.blocked_id = $2`, [
        userId,
        author,
      ])
    ).rows[0];
  const existing = await find();
  if (existing) return toBlocked(existing);
  const count = await db.query<{ n: number }>(
    "select count(*)::int as n from user_blocks where blocker_id = $1",
    [userId],
  );
  if ((count.rows[0]?.n ?? 0) >= COMMENT_BLOCKS_MAX)
    throw limitReached(
      `You can block up to ${COMMENT_BLOCKS_MAX.toLocaleString("en-US")} people. Unblock someone first.`,
    );
  await db.query(
    "insert into user_blocks (blocker_id, blocked_id) values ($1, $2) on conflict do nothing",
    [userId, author],
  );
  return toBlocked((await find()) as BlockRow);
}

/** The commenters the viewer blocked, newest first, by display name and block ID. */
export async function listBlockedCommenters(
  db: Pool,
  userId: string,
): Promise<BlockedCommentersResponse> {
  const res = await db.query<BlockRow>(
    `${BLOCK_SELECT} where b.blocker_id = $1 order by b.created_at desc, b.id`,
    [userId],
  );
  return { items: res.rows.map(toBlocked), max: COMMENT_BLOCKS_MAX };
}

export async function unblockCommenter(db: Pool, userId: string, id: string): Promise<void> {
  const res = await db.query("delete from user_blocks where id = $1 and blocker_id = $2", [
    id,
    userId,
  ]);
  if (!res.rowCount) throw notFound("That block");
}
