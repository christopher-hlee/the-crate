// validate (hourly) and recheck_reported (every 10 minutes): videos.list for unchecked IDs,
// IDs last checked over 25 days ago, and IDs with fresh player error reports.

import { unitsForThisRun, YOUTUBE } from "@app/core";
import type { Queryable } from "@app/db";
import { checkVideos, type FetchLike } from "@app/youtube";
import { pgLedger } from "./ledger";
import { applyChecks } from "./youtube-state";

export type YouTubeDeps = {
  db: Queryable;
  apiKey: string;
  budget: number;
  fetch?: FetchLike;
  referer?: string;
  now?: () => Date;
};

export type ValidateResult = {
  checked: number;
  calls: number;
  statusChanged: number;
  stoppedFor: string;
};

/** IDs due for a check, oldest first, limited to videos still in the live catalog. */
export async function dueVideoIds(db: Queryable, limit: number): Promise<string[]> {
  const res = await db.query<{ video_id: string }>(
    `select y.video_id from yt_videos y
      where (y.status = 'unchecked' or y.checked_at < now() - make_interval(days => $2))
        and exists (select 1 from record_videos rv where rv.video_id = y.video_id)
      order by y.checked_at asc nulls first, y.video_id
      limit $1`,
    [limit, YOUTUBE.revalidateAfterDays],
  );
  return res.rows.map((r) => r.video_id);
}

async function check(deps: YouTubeDeps, ids: string[]): Promise<ValidateResult> {
  if (ids.length === 0) return { checked: 0, calls: 0, statusChanged: 0, stoppedFor: "done" };
  const ledger = pgLedger(deps.db, deps.budget, deps.now);
  const res = await checkVideos(ids, {
    apiKey: deps.apiKey,
    fetch: deps.fetch,
    referer: deps.referer,
    ledger,
  });
  const { statusChanged } = await applyChecks(deps.db, res.checks);
  return {
    checked: res.checks.length,
    calls: res.calls,
    statusChanged,
    stoppedFor: res.stoppedFor,
  };
}

export async function runValidate(deps: YouTubeDeps): Promise<ValidateResult> {
  const ledger = pgLedger(deps.db, deps.budget, deps.now);
  const used = await ledger.usedToday();
  if (used.exhausted)
    return { checked: 0, calls: 0, statusChanged: 0, stoppedFor: "quota_exceeded" };
  const units = unitsForThisRun({
    budget: deps.budget,
    usedToday: used.units,
    at: (deps.now ?? (() => new Date()))(),
  });
  if (units === 0) return { checked: 0, calls: 0, statusChanged: 0, stoppedFor: "budget" };
  return check(deps, await dueVideoIds(deps.db, units * YOUTUBE.idsPerCall));
}

/** Folds new player reports into yt_videos and rechecks the reported videos first. */
export async function runRecheckReported(
  deps: YouTubeDeps,
  maxCalls = 10,
): Promise<ValidateResult> {
  await deps.db.query(
    `with r as (
       update video_reports set processed_at = now() where processed_at is null returning video_id
     ), n as (select video_id, count(*)::int as n from r group by video_id)
     update yt_videos y set error_reports = y.error_reports + n.n from n where y.video_id = n.video_id`,
  );
  // Recheck videos reported since their last check, at most once an hour each.
  const res = await deps.db.query<{ video_id: string }>(
    `select y.video_id from yt_videos y
      where exists (select 1 from video_reports r
                     where r.video_id = y.video_id and r.reported_at > coalesce(y.checked_at, '-infinity'))
        and (y.checked_at is null or y.checked_at < now() - interval '1 hour')
      order by y.error_reports desc, y.video_id
      limit $1`,
    [maxCalls * YOUTUBE.idsPerCall],
  );
  return check(
    deps,
    res.rows.map((r) => r.video_id),
  );
}
