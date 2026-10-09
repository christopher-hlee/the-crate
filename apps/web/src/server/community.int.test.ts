// Integration: comment moderation against Postgres. The filter before posting, reports that
// count only from people with a display name and are worked out from live rows, and
// per-viewer blocks that never reveal a user ID.

import {
  COMMENT_BLOCKED_TERM_MESSAGE,
  COMMENT_BLOCKS_MAX,
  COMMENT_LINK_MESSAGE,
  parseBlockedTerms,
} from "@app/core";
import { type CopyValue, copyRows } from "@app/db";
import { createTestDatabase, type TestDatabase } from "@app/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { deleteAccount } from "./account";
import {
  addComment,
  blockCommenter,
  HIDE_AFTER_REPORTS,
  listBlockedCommenters,
  listComments,
  reportComment,
  setDisplayName,
  unblockCommenter,
} from "./community";

let t: TestDatabase;
let users = 0;
const newUser = () => `00000000-0000-4000-a000-${String(++users).padStart(12, "0")}`;
/** A fresh user with a display name. */
async function member(): Promise<string> {
  const id = newUser();
  await setDisplayName(t.pool, id, `Member ${id.slice(-5)}`);
  return id;
}

const COLUMNS = [
  "record_key",
  "video_id",
  "release_id",
  "title",
  "artist_display",
  "genres",
  "styles",
  "format_names",
  "format_descriptions",
  "pressings",
  "rand_key",
  "playable",
  "added_in_dump",
];

beforeAll(async () => {
  t = await createTestDatabase();
  const rows: CopyValue[][] = [];
  for (let i = 1; i <= 10; i++) {
    rows.push([
      `r:${i}`,
      `vid${String(i).padStart(8, "0")}`,
      i,
      `Record ${i}`,
      "Artist",
      ["Jazz"],
      ["Fusion"],
      ["Vinyl"],
      ["LP"],
      1,
      i * 1000,
      true,
      "2026-10-01",
    ]);
  }
  const client = await t.pool.connect();
  try {
    await copyRows(client, "record_videos", COLUMNS, rows);
  } finally {
    client.release();
  }
});

afterAll(async () => {
  await t?.drop();
});

const commentState = async (id: string) =>
  (
    await t.pool.query<{ report_count: number; hidden: boolean }>(
      "select report_count, hidden from comments where id = $1",
      [id],
    )
  ).rows[0];

const stored = async (recordKey: string) =>
  (await t.pool.query("select 1 from comments where record_key = $1", [recordKey])).rowCount;

describe("filter before posting", () => {
  it("refuses links with a clear message and stores nothing", async () => {
    const author = await member();
    for (const body of ["rip at https://example.org", "www.example", "cheap at shop.example.com"])
      await expect(addComment(t.pool, author, "r:1", body)).rejects.toMatchObject({
        status: 400,
        code: "bad_request",
        message: COMMENT_LINK_MESSAGE,
      });
    expect(await stored("r:1")).toBe(0);
    expect((await addComment(t.pool, author, "r:1", "Break at 1:12, Vol.2 pressing")).body).toBe(
      "Break at 1:12, Vol.2 pressing",
    );
  });

  it("refuses the operator's blocked terms, whole words only", async () => {
    const author = await member();
    const terms = parseBlockedTerms("spork, foo bar");
    await expect(
      addComment(t.pool, author, "r:2", "What a ＳＰＯＲＫ", terms),
    ).rejects.toMatchObject({ status: 400, message: COMMENT_BLOCKED_TERM_MESSAGE });
    await expect(addComment(t.pool, author, "r:2", "FOO  bar!", terms)).rejects.toMatchObject({
      status: 400,
    });
    expect(await stored("r:2")).toBe(0);
    await addComment(t.pool, author, "r:2", "Sporks and foobar are fine", terms);
    expect(await stored("r:2")).toBe(1);
  });

  it("reads the list from COMMENT_BLOCKED_TERMS", async () => {
    const author = await member();
    const before = process.env.COMMENT_BLOCKED_TERMS;
    process.env.COMMENT_BLOCKED_TERMS = "Spork";
    try {
      await expect(addComment(t.pool, author, "r:3", "spork")).rejects.toMatchObject({
        status: 400,
      });
    } finally {
      if (before === undefined) delete process.env.COMMENT_BLOCKED_TERMS;
      else process.env.COMMENT_BLOCKED_TERMS = before;
    }
    await addComment(t.pool, author, "r:3", "spork");
    expect(await stored("r:3")).toBe(1);
  });
});

describe("reports", () => {
  it("count only from people with a display name", async () => {
    const c = await addComment(t.pool, await member(), "r:4", "Reported");
    const anonymous = newUser();
    await expect(reportComment(t.pool, anonymous, c.id)).rejects.toMatchObject({
      status: 409,
      code: "conflict",
      message: "Choose a display name before reporting a comment.",
    });
    expect(
      (await t.pool.query("select 1 from comment_reports where comment_id = $1", [c.id])).rowCount,
    ).toBe(0);
    expect(await commentState(c.id)).toEqual({ report_count: 0, hidden: false });
  });

  it("work out hiding from the live report rows, not a stored counter", async () => {
    const c = await addComment(t.pool, await member(), "r:5", "Counted");
    // A counter that drifted (or was bumped by reports since deleted) doesn't carry over.
    await t.pool.query("update comments set report_count = 2 where id = $1", [c.id]);
    await reportComment(t.pool, await member(), c.id);
    expect(await commentState(c.id)).toEqual({ report_count: 1, hidden: false });
    for (let i = 1; i < HIDE_AFTER_REPORTS; i++) await reportComment(t.pool, await member(), c.id);
    expect(await commentState(c.id)).toEqual({ report_count: HIDE_AFTER_REPORTS, hidden: true });
    expect(await listComments(t.pool, "r:5", null)).toEqual([]);
  });

  it("stop counting when the reporter deletes their account", async () => {
    const c = await addComment(t.pool, await member(), "r:6", "Brought back");
    const reporters: string[] = [];
    for (let i = 0; i < HIDE_AFTER_REPORTS; i++) {
      const r = await member();
      reporters.push(r);
      await reportComment(t.pool, r, c.id);
    }
    expect(await commentState(c.id)).toEqual({ report_count: HIDE_AFTER_REPORTS, hidden: true });

    // The same person signing up again gets a new account, which needs its own display name.
    await deleteAccount(t.pool, reporters[0] as string);
    expect(await commentState(c.id)).toEqual({
      report_count: HIDE_AFTER_REPORTS - 1,
      hidden: false,
    });
    expect((await listComments(t.pool, "r:6", null)).map((x) => x.id)).toEqual([c.id]);
    await expect(reportComment(t.pool, newUser(), c.id)).rejects.toMatchObject({ status: 409 });
    expect(await commentState(c.id)).toEqual({
      report_count: HIDE_AFTER_REPORTS - 1,
      hidden: false,
    });
  });
});

describe("blocks", () => {
  it("hide a commenter from the blocker only, by an opaque ID, until unblocked", async () => {
    const [viewer, troll, other] = [await member(), await member(), await member()];
    const bad = await addComment(t.pool, troll, "r:7", "Rude");
    await addComment(t.pool, troll, "r:7", "Ruder");
    const fine = await addComment(t.pool, other, "r:7", "Lovely pressing");

    const block = await blockCommenter(t.pool, viewer, bad.id);
    expect(block.displayName).toBe(bad.author.displayName);
    expect(block.id).not.toBe(troll);
    expect((await blockCommenter(t.pool, viewer, bad.id)).id).toBe(block.id);

    expect((await listComments(t.pool, "r:7", viewer)).map((c) => c.id)).toEqual([fine.id]);
    expect(await listComments(t.pool, "r:7", other)).toHaveLength(3);
    expect(await listComments(t.pool, "r:7", null)).toHaveLength(3);

    const list = await listBlockedCommenters(t.pool, viewer);
    expect(list).toMatchObject({ max: COMMENT_BLOCKS_MAX, items: [{ id: block.id }] });
    expect(JSON.stringify(list)).not.toContain(troll);
    expect((await listBlockedCommenters(t.pool, troll)).items).toEqual([]);

    await expect(unblockCommenter(t.pool, other, block.id)).rejects.toMatchObject({
      code: "not_found",
    });
    await unblockCommenter(t.pool, viewer, block.id);
    expect(await listComments(t.pool, "r:7", viewer)).toHaveLength(3);
    await expect(unblockCommenter(t.pool, viewer, block.id)).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("refuse your own comments, missing comments and more than the cap", async () => {
    const viewer = await member();
    const mine = await addComment(t.pool, viewer, "r:8", "Mine");
    await expect(blockCommenter(t.pool, viewer, mine.id)).rejects.toMatchObject({ status: 400 });
    await expect(
      blockCommenter(t.pool, viewer, "00000000-0000-4000-8000-ffffffffffff"),
    ).rejects.toMatchObject({ code: "not_found" });

    await t.pool.query(
      `insert into user_blocks (blocker_id, blocked_id)
       select $1, gen_random_uuid() from generate_series(1, $2::int)`,
      [viewer, COMMENT_BLOCKS_MAX],
    );
    const theirs = await addComment(t.pool, await member(), "r:8", "Theirs");
    await expect(blockCommenter(t.pool, viewer, theirs.id)).rejects.toMatchObject({
      code: "limit_reached",
    });
  });

  it("go with either account when it is deleted", async () => {
    const [viewer, troll] = [await member(), await member()];
    const bad = await addComment(t.pool, troll, "r:9", "Rude");
    await blockCommenter(t.pool, viewer, bad.id);
    await blockCommenter(t.pool, troll, (await addComment(t.pool, viewer, "r:9", "Hi")).id);
    await deleteAccount(t.pool, troll);
    expect((await listBlockedCommenters(t.pool, viewer)).items).toEqual([]);
    expect(
      (
        await t.pool.query("select 1 from user_blocks where $1 in (blocker_id, blocked_id)", [
          troll,
        ])
      ).rowCount,
    ).toBe(0);
  });
});
