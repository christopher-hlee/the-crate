// The daily YouTube unit budget, kept in Postgres and shared by every job and process.

import { pacificDay } from "@app/core";
import type { Queryable } from "@app/db";
import type { QuotaLedger } from "@app/youtube";

export type PgLedger = QuotaLedger & {
  usedToday(): Promise<{ units: number; exhausted: boolean }>;
};

export function pgLedger(
  db: Queryable,
  budget: number,
  now: () => Date = () => new Date(),
): PgLedger {
  return {
    async reserve(units) {
      const day = pacificDay(now());
      const res = await db.query(
        `insert into yt_quota_usage as q (pacific_day, units) select $1::date, $2::int where $2::int <= $3::int
         on conflict (pacific_day) do update set units = q.units + excluded.units, updated_at = now()
           where not q.exhausted and q.units + excluded.units <= $3::int
         returning units`,
        [day, units, budget],
      );
      return (res.rowCount ?? 0) > 0;
    },
    async markExhausted() {
      await db.query(
        `insert into yt_quota_usage (pacific_day, units, exhausted) values ($1, 0, true)
         on conflict (pacific_day) do update set exhausted = true, updated_at = now()`,
        [pacificDay(now())],
      );
    },
    async usedToday() {
      const res = await db.query<{ units: number; exhausted: boolean }>(
        "select units, exhausted from yt_quota_usage where pacific_day = $1",
        [pacificDay(now())],
      );
      return res.rows[0] ?? { units: 0, exhausted: false };
    },
  };
}
