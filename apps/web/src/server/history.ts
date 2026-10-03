import "server-only";
import type { HistoryResponse } from "@app/api-client";
import { limitsFor, type Plan } from "@app/core";
import type { Queryable } from "@app/db";
import { catalogItems } from "./records";

const PAGE = 50;

/** Logs a play and trims history to the plan's window (50 Free, 1,000 Pro). */
export async function logPlay(
  db: Queryable,
  userId: string,
  plan: Plan,
  play: { recordKey: string; videoId: string; seconds?: number | undefined },
): Promise<void> {
  await db.query(
    `insert into history (user_id, played_at, record_key, video_id, seconds)
     values ($1, clock_timestamp(), $2, $3, $4) on conflict do nothing`,
    [userId, play.recordKey, play.videoId, play.seconds ?? null],
  );
  await db.query(
    `delete from history where user_id = $1 and played_at < (
       select played_at from history where user_id = $1 order by played_at desc offset $2 limit 1)`,
    [userId, limitsFor(plan).historyWindow - 1],
  );
}

export async function listHistory(
  db: Queryable,
  userId: string,
  plan: Plan,
  cursor: string | null,
): Promise<HistoryResponse> {
  const window = limitsFor(plan).historyWindow;
  const res = await db.query<{
    played_at: Date;
    record_key: string;
    video_id: string;
    seconds: number | null;
  }>(
    `select played_at, record_key, video_id, seconds from (
       select * from history where user_id = $1 order by played_at desc limit $2
     ) w where ($3::timestamptz is null or played_at < $3) order by played_at desc limit $4`,
    [userId, window, cursor, PAGE + 1],
  );
  const rows = res.rows.slice(0, PAGE);
  const items = await catalogItems(
    db,
    rows.map((r) => ({ recordKey: r.record_key, videoId: r.video_id })),
  );
  return {
    window,
    nextCursor:
      res.rows.length > PAGE ? (rows[rows.length - 1]?.played_at.toISOString() ?? null) : null,
    items: rows.map((r) => {
      const item = items.get(`${r.record_key}/${r.video_id}`);
      return {
        recordKey: r.record_key,
        videoId: r.video_id,
        discogsUrl: item?.discogsUrl ?? "",
        available: item?.available ?? false,
        record: item?.record ?? null,
        playedAt: r.played_at.toISOString(),
        seconds: r.seconds,
      };
    }),
  };
}
