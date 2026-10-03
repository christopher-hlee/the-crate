import "server-only";
import type { Queryable } from "@app/db";

/** Shared server cache in Postgres (pick_cache), so every instance sees the same lists. */
export async function cacheGet<T>(db: Queryable, key: string): Promise<T | null> {
  const res = await db.query<{ payload: T }>(
    "select payload from pick_cache where key = $1 and expires_at > now()",
    [key],
  );
  return res.rows[0]?.payload ?? null;
}

export async function cacheSet(
  db: Queryable,
  key: string,
  payload: unknown,
  ttlSeconds: number,
): Promise<void> {
  await db.query(
    `insert into pick_cache (key, payload, expires_at) values ($1, $2, now() + make_interval(secs => $3))
     on conflict (key) do update set payload = excluded.payload, expires_at = excluded.expires_at`,
    [key, JSON.stringify(payload), ttlSeconds],
  );
}
