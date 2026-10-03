// Integration: YouTube state jobs, link suggestions and account deletion retries.

import { createTestDatabase, type TestDatabase } from "@app/db/testing";
import type { FetchLike } from "@app/youtube";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { runRetryAccountDeletions } from "../src/jobs/accounts";
import { pgLedger } from "../src/jobs/ledger";
import { runPurge } from "../src/jobs/purge";
import { runValidateSuggestions } from "../src/jobs/suggestions";
import { runRecheckReported, runValidate } from "../src/jobs/validate";

let t: TestDatabase;
const USER = "33333333-3333-3333-3333-333333333333";
const NOW = () => new Date("2026-10-05T12:00:00Z");

async function q(sql: string, values: unknown[] = []) {
  return (await t.pool.query(sql, values)).rows;
}

async function seedVideo(
  videoId: string,
  opts: {
    status?: string;
    checkedDaysAgo?: number | null;
    recordKey?: string;
    playable?: boolean;
  } = {},
) {
  const checked =
    opts.checkedDaysAgo === undefined || opts.checkedDaysAgo === null
      ? null
      : `now() - interval '${opts.checkedDaysAgo} days'`;
  await t.pool.query(
    `insert into yt_videos (video_id, dump_embed_flag, status, title, duration_s, view_count, thumbnail_url,
       region_allowed, region_blocked, checked_at, first_seen_dump)
     values ($1, true, $2, 'A title', 200, 1234, 'https://i.ytimg.com/x.jpg', '{US}', '{DE}', ${checked ?? "null"}, '2026-09-01')`,
    [videoId, opts.status ?? "playable"],
  );
  await t.pool.query(
    `insert into record_videos (record_key, video_id, release_id, title, artist_display, genres, styles,
       format_names, format_descriptions, pressings, rand_key, playable, added_in_dump)
     values ($1, $2, 1, 'Record', 'Artist', '{Jazz}', '{Fusion}', '{Vinyl}', '{LP}', 1, 5, $3, '2026-09-01')`,
    [opts.recordKey ?? "r:1", videoId, opts.playable ?? true],
  );
}

function replay(body: unknown, status = 200, seen: string[] = []): FetchLike {
  return async (url) => {
    seen.push(url);
    return { ok: status < 400, status, json: async () => body };
  };
}

const playableItem = (id: string) => ({
  id,
  snippet: { title: `Video ${id}` },
  contentDetails: { duration: "PT3M" },
  status: {
    uploadStatus: "processed",
    privacyStatus: "public",
    embeddable: true,
    madeForKids: false,
  },
  statistics: { viewCount: "10" },
});

beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t?.drop();
});
beforeEach(async () => {
  await t.pool.query(
    "truncate yt_videos, record_videos, video_reports, yt_quota_usage, link_suggestions, account_deletions, history, crates, crate_items, notes, subscriptions",
  );
});

describe("purge_yt_data (compliance test 6)", () => {
  it("nulls YouTube data not refreshed in 30 days and takes those videos out of the shuffle", async () => {
    await seedVideo("old00000001", { checkedDaysAgo: 31 });
    await seedVideo("new00000001", { checkedDaysAgo: 5, recordKey: "r:2" });
    const res = await runPurge(t.pool);
    expect(res).toEqual({ purged: 1, unplayable: 1 });
    const [old] = await q("select * from yt_videos where video_id = 'old00000001'");
    expect(old).toMatchObject({
      status: "unchecked",
      title: null,
      duration_s: null,
      view_count: null,
      thumbnail_url: null,
      region_allowed: null,
      region_blocked: null,
      checked_at: null,
    });
    const [fresh] = await q("select title, status from yt_videos where video_id = 'new00000001'");
    expect(fresh).toEqual({ title: "A title", status: "playable" });
    const playable = await q("select video_id, playable from record_videos order by 1");
    expect(playable).toEqual([
      { video_id: "new00000001", playable: true },
      { video_id: "old00000001", playable: false },
    ]);
  });
});

describe("validate", () => {
  it("checks unchecked IDs first and IDs older than 25 days, within the hourly share", async () => {
    await seedVideo("unchecked01", { status: "unchecked", checkedDaysAgo: null, playable: false });
    await seedVideo("stale000001", { checkedDaysAgo: 26, recordKey: "r:2" });
    await seedVideo("fresh000001", { checkedDaysAgo: 3, recordKey: "r:3" });
    const seen: string[] = [];
    const res = await runValidate({
      db: t.pool,
      apiKey: "k",
      budget: 8000,
      now: NOW,
      fetch: replay({ items: [playableItem("unchecked01")] }, 200, seen),
    });
    expect(res).toMatchObject({ checked: 2, calls: 1, statusChanged: 2 });
    expect(new URL(seen[0] as string).searchParams.get("id")).toBe("unchecked01,stale000001");
    const rows = await q("select video_id, status from yt_videos order by 1");
    expect(rows).toEqual([
      { video_id: "fresh000001", status: "playable" },
      { video_id: "stale000001", status: "unavailable" },
      { video_id: "unchecked01", status: "playable" },
    ]);
    expect(
      (await q("select playable from record_videos where video_id = 'unchecked01'"))[0]?.playable,
    ).toBe(true);
    expect(
      (await q("select playable from record_videos where video_id = 'stale000001'"))[0]?.playable,
    ).toBe(false);
  });

  it("spends nothing once the day's budget is gone", async () => {
    await seedVideo("unchecked01", { status: "unchecked", checkedDaysAgo: null });
    const ledger = pgLedger(t.pool, 1, NOW);
    expect(await ledger.reserve(1)).toBe(true);
    expect(await ledger.reserve(1)).toBe(false);
    const res = await runValidate({
      db: t.pool,
      apiKey: "k",
      budget: 1,
      now: NOW,
      fetch: replay({ items: [] }),
    });
    expect(res).toMatchObject({ calls: 0, stoppedFor: "budget" });
  });

  it("stops until the Pacific reset after quotaExceeded", async () => {
    await seedVideo("unchecked01", { status: "unchecked", checkedDaysAgo: null });
    const quota = { error: { code: 403, errors: [{ reason: "quotaExceeded" }] } };
    const first = await runValidate({
      db: t.pool,
      apiKey: "k",
      budget: 8000,
      now: NOW,
      fetch: replay(quota, 403),
    });
    expect(first.stoppedFor).toBe("quota_exceeded");
    const [usage] = await q("select exhausted from yt_quota_usage");
    expect(usage?.exhausted).toBe(true);
    const seen: string[] = [];
    const second = await runValidate({
      db: t.pool,
      apiKey: "k",
      budget: 8000,
      now: NOW,
      fetch: replay({ items: [] }, 200, seen),
    });
    expect(second.stoppedFor).toBe("quota_exceeded");
    expect(seen).toEqual([]);
    const tomorrow = await runValidate({
      db: t.pool,
      apiKey: "k",
      budget: 8000,
      now: () => new Date("2026-10-06T12:00:00Z"),
      fetch: replay({ items: [] }),
    });
    expect(tomorrow.calls).toBe(1);
  });
});

describe("recheck_reported", () => {
  it("folds reports into error counts and rechecks reported videos", async () => {
    await seedVideo("reported001", { checkedDaysAgo: 2 });
    await seedVideo("quiet000001", { checkedDaysAgo: 2, recordKey: "r:2" });
    await t.pool.query(
      "insert into video_reports (video_id, code) values ('reported001', 150), ('reported001', 100)",
    );
    const seen: string[] = [];
    const res = await runRecheckReported({
      db: t.pool,
      apiKey: "k",
      budget: 8000,
      now: NOW,
      fetch: replay({ items: [] }, 200, seen),
    });
    expect(res).toMatchObject({ checked: 1, statusChanged: 1 });
    expect(new URL(seen[0] as string).searchParams.get("id")).toBe("reported001");
    const [row] = await q(
      "select status, error_reports from yt_videos where video_id = 'reported001'",
    );
    expect(row).toEqual({ status: "unavailable", error_reports: 2 });
    expect(
      (await q("select count(*)::int as n from video_reports where processed_at is null"))[0]?.n,
    ).toBe(0);
  });
});

describe("validate_link_suggestions", () => {
  it("accepts playable links, rejects the rest, and adds accepted ones to the catalog", async () => {
    await seedVideo("existing001", { checkedDaysAgo: 1, recordKey: "m:9" });
    await t.pool.query(
      `insert into link_suggestions (user_id, record_key, video_id) values
         ($1, 'm:9', 'goodlink001'), ($1, 'm:9', 'kidslink001'), ($1, 'm:9', 'existing001'), ($1, 'r:404', 'goodlink002')`,
      [USER],
    );
    const kids = {
      ...playableItem("kidslink001"),
      status: { embeddable: true, madeForKids: true },
    };
    const res = await runValidateSuggestions({
      db: t.pool,
      apiKey: "k",
      budget: 8000,
      now: NOW,
      fetch: replay({ items: [playableItem("goodlink001"), kids] }),
    });
    expect(res).toEqual({ accepted: 1, rejected: 3 });
    const s = await q("select video_id, status, reason from link_suggestions order by video_id");
    expect(s).toEqual([
      { video_id: "existing001", status: "rejected", reason: "already_linked" },
      { video_id: "goodlink001", status: "accepted", reason: null },
      { video_id: "goodlink002", status: "rejected", reason: "record_not_in_catalog" },
      { video_id: "kidslink001", status: "rejected", reason: "made_for_kids" },
    ]);
    const [added] = await q(
      "select record_key, playable, track_position, styles from record_videos where video_id = 'goodlink001'",
    );
    expect(added).toEqual({
      record_key: "m:9",
      playable: true,
      track_position: null,
      styles: ["Fusion"],
    });
  });
});

describe("retry_account_deletions", () => {
  it("re-deletes user rows and deletes the auth user, keeping failures for retry", async () => {
    await t.pool.query(
      "insert into history (user_id, played_at, record_key, video_id) values ($1, now(), 'r:1', 'x')",
      [USER],
    );
    await t.pool.query("insert into account_deletions (user_id) values ($1)", [USER]);
    const failing = await runRetryAccountDeletions(t.pool, {
      deleteUser: async () => {
        throw new Error("auth down");
      },
    });
    expect(failing).toEqual({ completed: 0, failed: 1 });
    expect((await q("select count(*)::int as n from history"))[0]?.n).toBe(0);
    expect((await q("select attempts, last_error from account_deletions"))[0]).toEqual({
      attempts: 1,
      last_error: "auth down",
    });
    const deleted: string[] = [];
    const ok = await runRetryAccountDeletions(t.pool, {
      deleteUser: async (id) => void deleted.push(id),
    });
    expect(ok).toEqual({ completed: 1, failed: 0 });
    expect(deleted).toEqual([USER]);
    expect(await q("select * from account_deletions")).toEqual([]);
  });
});
