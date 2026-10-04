import "server-only";
import type { FavoritesResponse } from "@app/api-client";
import { limitsFor, type Plan } from "@app/core";
import { type Pool, withTransaction } from "@app/db";
import { limitReached, notFound } from "./http";
import { catalogItems } from "./records";

const PAGE = 50;
type Ref = { recordKey: string; videoId: string };

async function total(db: Pool, userId: string): Promise<number> {
  const res = await db.query<{ n: number }>(
    "select count(*)::int as n from favorites where user_id = $1",
    [userId],
  );
  return res.rows[0]?.n ?? 0;
}

/** Newest first, 50 a page. The cursor is the offset (favorites are capped at 10,000). */
export async function listFavorites(
  db: Pool,
  userId: string,
  plan: Plan,
  cursor: string | null,
): Promise<FavoritesResponse> {
  const offset = Math.max(0, Number.parseInt(cursor ?? "0", 10) || 0);
  const res = await db.query<{
    record_key: string;
    video_id: string;
    note: string | null;
    added_at: Date;
  }>(
    `select record_key, video_id, note, added_at from favorites where user_id = $1
      order by added_at desc, record_key, video_id limit ${PAGE + 1} offset $2`,
    [userId, offset],
  );
  const rows = res.rows.slice(0, PAGE);
  const items = await catalogItems(
    db,
    rows.map((r) => ({ recordKey: r.record_key, videoId: r.video_id })),
  );
  return {
    items: rows.map((r) => {
      const item = items.get(`${r.record_key}/${r.video_id}`);
      return {
        recordKey: r.record_key,
        videoId: r.video_id,
        discogsUrl: item?.discogsUrl ?? "",
        available: item?.available ?? false,
        record: item?.record ?? null,
        note: r.note,
        addedAt: r.added_at.toISOString(),
      };
    }),
    nextCursor: res.rows.length > PAGE ? String(offset + PAGE) : null,
    total: await total(db, userId),
    max: limitsFor(plan).maxFavorites,
  };
}

export async function favoriteStatus(db: Pool, userId: string, ref: Ref) {
  const res = await db.query(
    "select 1 from favorites where user_id = $1 and record_key = $2 and video_id = $3",
    [userId, ref.recordKey, ref.videoId],
  );
  return { favorited: res.rowCount === 1, total: await total(db, userId) };
}

/** Adds a catalog record and video to favorites; a repeat is a no-op. */
export async function addFavorite(db: Pool, userId: string, plan: Plan, ref: Ref) {
  const known = await db.query(
    "select 1 from record_videos where record_key = $1 and video_id = $2",
    [ref.recordKey, ref.videoId],
  );
  if (!known.rowCount) throw notFound("That record");
  await withTransaction(db, async (client) => {
    // Serialise per user so two tabs can't both slip past the cap.
    await client.query("select pg_advisory_xact_lock(hashtextextended($1, 11))", [userId]);
    const exists = await client.query(
      "select 1 from favorites where user_id = $1 and record_key = $2 and video_id = $3",
      [userId, ref.recordKey, ref.videoId],
    );
    if (exists.rowCount) return;
    const n = (
      await client.query<{ n: number }>(
        "select count(*)::int as n from favorites where user_id = $1",
        [userId],
      )
    ).rows[0]?.n;
    const max = limitsFor(plan).maxFavorites;
    if ((n ?? 0) >= max)
      throw limitReached(`You can keep up to ${max.toLocaleString("en-US")} favorites.`);
    await client.query(
      "insert into favorites (user_id, record_key, video_id) values ($1, $2, $3)",
      [userId, ref.recordKey, ref.videoId],
    );
  });
  return favoriteStatus(db, userId, ref);
}

export async function removeFavorite(db: Pool, userId: string, ref: Ref) {
  await db.query("delete from favorites where user_id = $1 and record_key = $2 and video_id = $3", [
    userId,
    ref.recordKey,
    ref.videoId,
  ]);
  return favoriteStatus(db, userId, ref);
}

export async function setFavoriteNote(
  db: Pool,
  userId: string,
  ref: Ref,
  note: string | null,
): Promise<void> {
  const res = await db.query(
    "update favorites set note = $4 where user_id = $1 and record_key = $2 and video_id = $3",
    [userId, ref.recordKey, ref.videoId, note || null],
  );
  if (!res.rowCount) throw notFound("That favorite");
}
