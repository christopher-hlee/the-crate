import "server-only";
import { type FavoritesResponse, RecordKeySchema, VideoIdSchema } from "@app/api-client";
import { limitsFor, type Plan } from "@app/core";
import { type Pool, withTransaction } from "@app/db";
import { z } from "zod";
import { badRequest, limitReached, notFound } from "./http";
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

/**
 * Where a page ends in the newest-first order: the last row's added_at (to the microsecond,
 * so rows saved in the same millisecond aren't lost), record key and video ID. Clients get it
 * as an opaque base64url string. A keyset, unlike an offset, doesn't skip rows when favorites
 * are removed between pages.
 */
const CursorSchema = z.tuple([
  z.string().regex(/^2\d{3}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/),
  RecordKeySchema,
  VideoIdSchema,
]);
type Cursor = z.infer<typeof CursorSchema>;

export function encodeFavoritesCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

function parseCursor(raw: string): Cursor | null {
  if (!/^[A-Za-z0-9_-]{1,400}$/.test(raw)) return null;
  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  const parsed = CursorSchema.safeParse(value);
  if (!parsed.success) return null;
  // A real calendar instant only: Postgres would throw on "2026-02-30".
  const [at] = parsed.data;
  const ms = Date.parse(at);
  const real = !Number.isNaN(ms) && new Date(ms).toISOString().slice(0, 19) === at.slice(0, 19);
  return real ? parsed.data : null;
}

/** The position a cursor names, or a 400 for anything this server didn't hand out. */
export function decodeFavoritesCursor(raw: string): Cursor {
  const cursor = parseCursor(raw);
  if (!cursor) throw badRequest("Invalid cursor");
  return cursor;
}

/** Newest first, 50 a page, from a keyset cursor (see `encodeFavoritesCursor`). */
export async function listFavorites(
  db: Pool,
  userId: string,
  plan: Plan,
  cursor: string | null,
): Promise<FavoritesResponse> {
  const after = cursor ? decodeFavoritesCursor(cursor) : null;
  const values: unknown[] = [userId];
  let keyset = "";
  if (after) {
    values.push(...after);
    keyset = `and (added_at < $2::timestamptz
             or (added_at = $2::timestamptz and (record_key, video_id) > ($3, $4)))`;
  }
  const res = await db.query<{
    record_key: string;
    video_id: string;
    note: string | null;
    added_at: Date;
    added_key: string;
  }>(
    `select record_key, video_id, note, added_at,
            to_char(added_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as added_key
       from favorites where user_id = $1 ${keyset}
      order by added_at desc, record_key, video_id limit ${PAGE + 1}`,
    values,
  );
  const rows = res.rows.slice(0, PAGE);
  const last = rows.at(-1);
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
    nextCursor:
      res.rows.length > PAGE && last
        ? encodeFavoritesCursor([last.added_key, last.record_key, last.video_id])
        : null,
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
