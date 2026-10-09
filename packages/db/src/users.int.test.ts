// Integration: account deletion reaches every user table, both sides of a block, and the
// report counts of comments the user reported.

import { COMMENT_HIDE_AFTER_REPORTS } from "@app/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDatabase, type TestDatabase } from "./testing";
import { deleteUserRows, recountCommentReports, USER_COLUMNS, USER_TABLES } from "./users";

let t: TestDatabase;
let n = 0;
const newUser = () => `00000000-0000-4000-9000-${String(++n).padStart(12, "0")}`;

beforeAll(async () => {
  t = await createTestDatabase();
});

afterAll(async () => {
  await t?.drop();
});

async function withProfile(userId: string) {
  await t.pool.query("insert into profiles (user_id, display_name) values ($1, $2)", [
    userId,
    `User ${userId.slice(-6)}`,
  ]);
  return userId;
}

async function addComment(userId: string): Promise<string> {
  const res = await t.pool.query<{ id: string }>(
    "insert into comments (record_key, user_id, body) values ('r:1', $1, 'x') returning id",
    [userId],
  );
  return res.rows[0]?.id as string;
}

const state = async (id: string) =>
  (
    await t.pool.query<{ report_count: number; hidden: boolean }>(
      "select report_count, hidden from comments where id = $1",
      [id],
    )
  ).rows[0];

describe("USER_TABLES", () => {
  it("lists every table with a column naming a user", async () => {
    const res = await t.pool.query<{ table_name: string }>(
      `select distinct table_name from information_schema.columns
        where table_schema = 'public' and column_name in ('user_id', 'blocker_id', 'blocked_id')`,
    );
    // video_reports keeps the report with the user nulled; account_deletions is the retry queue.
    const kept = new Set(["video_reports", "account_deletions"]);
    const tables = res.rows.map((r) => r.table_name).filter((name) => !kept.has(name));
    expect([...USER_TABLES].sort()).toEqual(tables.sort());
    for (const [table, columns] of Object.entries(USER_COLUMNS)) {
      const cols = await t.pool.query<{ column_name: string }>(
        "select column_name from information_schema.columns where table_name = $1",
        [table],
      );
      for (const c of columns ?? []) expect(cols.rows.map((r) => r.column_name)).toContain(c);
    }
  });
});

describe("deleteUserRows", () => {
  it("removes blocks the user made and blocks against them, and keeps everyone else's", async () => {
    const [gone, other, third] = [newUser(), newUser(), newUser()];
    await t.pool.query(
      "insert into user_blocks (blocker_id, blocked_id) values ($1, $2), ($2, $1), ($2, $3)",
      [gone, other, third],
    );
    await withProfile(gone);
    await withProfile(other);
    await addComment(gone);
    await deleteUserRows(t.pool, gone);
    const blocks = await t.pool.query(
      "select blocker_id, blocked_id from user_blocks where $1 in (blocker_id, blocked_id) or blocker_id = $2",
      [gone, other],
    );
    expect(blocks.rows).toEqual([{ blocker_id: other, blocked_id: third }]);
    for (const table of ["profiles", "comments"]) {
      const left = await t.pool.query(`select 1 from ${table} where user_id = $1`, [gone]);
      expect(left.rowCount, table).toBe(0);
    }
    expect(
      (await t.pool.query("select 1 from profiles where user_id = $1", [other])).rowCount,
    ).toBe(1);
  });

  it("recounts the comments the user reported, so their reports stop hiding anything", async () => {
    const comment = await addComment(await withProfile(newUser()));
    const reporters: string[] = [];
    for (let i = 0; i < COMMENT_HIDE_AFTER_REPORTS; i++)
      reporters.push(await withProfile(newUser()));
    for (const r of reporters)
      await t.pool.query("insert into comment_reports (comment_id, user_id) values ($1, $2)", [
        comment,
        r,
      ]);
    await recountCommentReports(t.pool, [comment]);
    expect(await state(comment)).toEqual({
      report_count: COMMENT_HIDE_AFTER_REPORTS,
      hidden: true,
    });

    await deleteUserRows(t.pool, reporters[0] as string);
    expect(await state(comment)).toEqual({
      report_count: COMMENT_HIDE_AFTER_REPORTS - 1,
      hidden: false,
    });
  });

  it("counts only reporters with a display name", async () => {
    const comment = await addComment(await withProfile(newUser()));
    for (let i = 0; i < COMMENT_HIDE_AFTER_REPORTS; i++)
      await t.pool.query("insert into comment_reports (comment_id, user_id) values ($1, $2)", [
        comment,
        newUser(),
      ]);
    await recountCommentReports(t.pool, [comment]);
    expect(await state(comment)).toEqual({ report_count: 0, hidden: false });
  });
});
