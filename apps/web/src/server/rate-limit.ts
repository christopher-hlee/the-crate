import "server-only";
import { createHash } from "node:crypto";
import { RATE_LIMITS, type RateLimitName } from "@app/core";
import type { Queryable } from "@app/db";
import { HttpError } from "./http";

/** Fixed-window limits per user when signed in, per (hashed) IP when signed out. */
export async function rateLimit(
  db: Queryable,
  name: RateLimitName,
  who: { userId?: string | null; ip: string },
): Promise<void> {
  const { limit, windowSeconds } = RATE_LIMITS[name];
  const subject = who.userId
    ? `u:${who.userId}`
    : `ip:${createHash("sha256").update(who.ip).digest("hex").slice(0, 32)}`;
  const windowStart = new Date(
    Math.floor(Date.now() / (windowSeconds * 1000)) * windowSeconds * 1000,
  );
  const res = await db.query<{ count: number }>(
    `insert into rate_limits (key, window_start, count) values ($1, $2, 1)
     on conflict (key, window_start) do update set count = rate_limits.count + 1
     returning count`,
    [`${name}:${subject}`, windowStart],
  );
  if ((res.rows[0]?.count ?? 0) > limit) {
    throw new HttpError(429, "rate_limited", "Slow down a little and try again shortly.");
  }
}
