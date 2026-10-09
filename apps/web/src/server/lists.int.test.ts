// Integration: favorites, saved filters, comments and profiles, "For you" and crate item notes
// against Postgres.

import { CHANNEL_SCOPE_NOT_SAVED, limitsFor } from "@app/core";
import type { CopyValue } from "@app/db";
import { copyRows } from "@app/db";
import { createTestDatabase, type TestDatabase } from "@app/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  addComment,
  deleteComment,
  HIDE_AFTER_REPORTS,
  listComments,
  reportComment,
  setDisplayName,
} from "./community";
import { addItem, createCrate, getCrate, setCrateItemNote, updateCrate } from "./crates";
import {
  addFavorite,
  favoriteStatus,
  listFavorites,
  removeFavorite,
  setFavoriteNote,
} from "./favorites";
import { forYou } from "./for-you";
import { addNote, listNotes } from "./notes";
import { deleteSavedFilter, listSavedFilters, saveFilter } from "./saved-filters";

let t: TestDatabase;
let users = 0;
/** A fresh user ID per test, so tests never see each other's rows. */
const newUser = () => `00000000-0000-4000-8000-${String(++users).padStart(12, "0")}`;

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
  "country",
];

const vid = (i: number) => `vid${String(i).padStart(8, "0")}`;
const ref = (i: number) => ({ recordKey: `r:${i}`, videoId: vid(i) });

function row(i: number, styles: string[], playable = true): CopyValue[] {
  return [
    `r:${i}`,
    vid(i),
    i,
    `Record ${i}`,
    "Artist",
    ["Funk / Soul"],
    styles,
    ["Vinyl"],
    ["LP"],
    1,
    i * 1000,
    playable,
    "2026-10-01",
    "US",
  ];
}

beforeAll(async () => {
  t = await createTestDatabase();
  const rows: CopyValue[][] = [];
  // r:1–20 Rare Groove, r:21–40 Boogaloo, r:41–120 Fusion; r:999 can't play.
  for (let i = 1; i <= 120; i++)
    rows.push(row(i, i <= 20 ? ["Rare Groove"] : i <= 40 ? ["Boogaloo"] : ["Fusion"]));
  rows.push(row(999, ["Rare Groove"], false));
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

describe("favorites", () => {
  it("adds once, lists newest first, keeps notes and removes", async () => {
    const user = newUser();
    expect(await addFavorite(t.pool, user, "free", ref(1))).toEqual({ favorited: true, total: 1 });
    expect(await addFavorite(t.pool, user, "free", ref(1))).toEqual({ favorited: true, total: 1 });
    await addFavorite(t.pool, user, "free", ref(2));
    await addFavorite(t.pool, user, "free", ref(999));
    await expect(
      addFavorite(t.pool, user, "free", { recordKey: "m:424242", videoId: "gonegonegon" }),
    ).rejects.toMatchObject({ code: "not_found" });

    const list = await listFavorites(t.pool, user, "free", null);
    expect(list.items.map((i) => i.recordKey)).toEqual(["r:999", "r:2", "r:1"]);
    expect(list).toMatchObject({ total: 3, max: 10_000, nextCursor: null });
    expect(list.items[0]).toMatchObject({ available: false, note: null });
    expect(list.items[1]).toMatchObject({ available: true, record: { title: "Record 2" } });

    await setFavoriteNote(t.pool, user, ref(2), "Break at 1:20");
    expect((await listFavorites(t.pool, user, "free", null)).items[1]?.note).toBe("Break at 1:20");
    await setFavoriteNote(t.pool, user, ref(2), "");
    expect((await listFavorites(t.pool, user, "free", null)).items[1]?.note).toBeNull();
    await expect(setFavoriteNote(t.pool, user, ref(3), "Not a favorite")).rejects.toMatchObject({
      code: "not_found",
    });

    expect(await favoriteStatus(t.pool, user, ref(1))).toEqual({ favorited: true, total: 3 });
    expect(await removeFavorite(t.pool, user, ref(1))).toEqual({ favorited: false, total: 2 });
    expect(await removeFavorite(t.pool, user, ref(1))).toEqual({ favorited: false, total: 2 });
    // Another user's favorites are their own.
    expect((await listFavorites(t.pool, newUser(), "free", null)).items).toEqual([]);
  });

  it("pages 50 at a time with an opaque keyset cursor", async () => {
    const user = newUser();
    await t.pool.query(
      `insert into favorites (user_id, record_key, video_id, added_at)
       select $1, 'r:' || n, 'vid' || lpad(n::text, 8, '0'), now() - (n || ' seconds')::interval
         from generate_series(41, 95) as n`,
      [user],
    );
    const one = await listFavorites(t.pool, user, "pro", null);
    expect(one.items).toHaveLength(50);
    expect(one.items[0]?.recordKey).toBe("r:41");
    expect(one.nextCursor).toMatch(/^[A-Za-z0-9_-]+$/);
    // Not a number, so a client that still adjusts numeric cursors leaves it alone.
    expect(Number.parseInt(one.nextCursor ?? "", 10)).toBeNaN();
    expect(one.total).toBe(55);
    const two = await listFavorites(t.pool, user, "pro", one.nextCursor);
    expect(two.items.map((i) => i.recordKey)).toEqual(["r:91", "r:92", "r:93", "r:94", "r:95"]);
    expect(two.nextCursor).toBeNull();
  });

  async function walk(user: string, between?: (page: number) => Promise<void>) {
    const seen: string[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 10; page++) {
      const res = await listFavorites(t.pool, user, "free", cursor);
      seen.push(...res.items.map((i) => `${i.recordKey}/${i.videoId}`));
      cursor = res.nextCursor;
      if (!cursor) break;
      await between?.(page);
    }
    return seen;
  }

  it("doesn't skip rows when favorites are removed or added between pages", async () => {
    const user = newUser();
    await t.pool.query(
      `insert into favorites (user_id, record_key, video_id, added_at)
       select $1, 'r:' || n, 'vid' || lpad(n::text, 8, '0'), now() - (n || ' seconds')::interval
         from generate_series(1, 120) as n`,
      [user],
    );
    const all = (await walk(user)).slice();
    expect(all).toHaveLength(120);
    const got = await walk(user, async (page) => {
      if (page !== 0) return;
      // The user hearts off three rows on page one and favorites a new record.
      for (const i of [3, 10, 49]) await removeFavorite(t.pool, user, ref(i));
      await addFavorite(t.pool, user, "free", ref(999));
    });
    // Every row that was there throughout comes exactly once: rows 51 to 53 aren't skipped.
    expect(got.slice(50)).toEqual(all.slice(50));
    expect(new Set(got).size).toBe(got.length);
  });

  it("keeps rows with the same timestamp, even to the microsecond, in key order", async () => {
    const user = newUser();
    // One statement: every row gets the same now().
    await t.pool.query(
      `insert into favorites (user_id, record_key, video_id)
       select $1, 'r:' || n, 'vid' || lpad(n::text, 8, '0') from generate_series(1, 60) as n`,
      [user],
    );
    // And rows a microsecond apart, which a millisecond cursor would merge.
    await t.pool.query(
      `insert into favorites (user_id, record_key, video_id, added_at)
       select $1, 'r:' || n, 'vid' || lpad(n::text, 8, '0'),
              '2026-10-01T12:00:00.000500Z'::timestamptz - (n - 60 || ' microseconds')::interval
         from generate_series(61, 120) as n`,
      [user],
    );
    const got = await walk(user);
    expect(got).toHaveLength(120);
    expect(new Set(got).size).toBe(120);
    const sameNow = got.slice(0, 60).map((k) => k.split("/")[0]);
    expect(sameNow).toEqual([...sameNow].sort());
  });

  it("refuses cursors it didn't hand out", async () => {
    const user = newUser();
    const enc = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64url");
    for (const bad of [
      "50",
      "not a cursor",
      enc(["2026-10-01T12:00:00.000000Z", "r:1"]),
      enc(["2026-10-01T12:00:00Z", "r:1", vid(1)]),
      enc(["2026-02-30T12:00:00.000000Z", "r:1", vid(1)]),
      enc(["0000-01-01T00:00:00.000000Z", "r:1", vid(1)]),
      enc(["2026-10-01T12:00:00.000000Z", "x:1", vid(1)]),
      enc(["2026-10-01T12:00:00.000000Z", "r:1", "short"]),
      enc({ at: "2026-10-01T12:00:00.000000Z" }),
    ]) {
      await expect(listFavorites(t.pool, user, "free", bad)).rejects.toMatchObject({
        status: 400,
        code: "bad_request",
      });
    }
    const ok = enc(["2026-10-01T12:00:00.000000Z", "r:1", vid(1)]);
    expect((await listFavorites(t.pool, user, "free", ok)).items).toEqual([]);
  });

  it("stops at the plan's cap", async () => {
    const user = newUser();
    await t.pool.query(
      `insert into favorites (user_id, record_key, video_id)
       select $1, 'x:' || n, 'x' || lpad(n::text, 10, '0') from generate_series(1, $2::int) as n`,
      [user, 10_000],
    );
    await expect(addFavorite(t.pool, user, "free", ref(1))).rejects.toMatchObject({
      code: "limit_reached",
    });
    await t.pool.query("delete from favorites where user_id = $1 and record_key = 'x:1'", [user]);
    expect(await addFavorite(t.pool, user, "free", ref(1))).toEqual({
      favorited: true,
      total: 10_000,
    });
  });
});

describe("saved filters", () => {
  it("saves, replaces by name, refuses Pro filters on Free and deletes", async () => {
    const user = newUser();
    const first = await saveFilter(t.pool, user, "free", {
      name: "Groove",
      filters: { styles: ["Rare Groove"] },
    });
    expect(first.filters).toEqual({ styles: ["Rare Groove"] });
    const again = await saveFilter(t.pool, user, "free", {
      name: "Groove",
      filters: { styles: ["Boogaloo"], yearFrom: 1966 },
    });
    expect(again.id).toBe(first.id);
    await saveFilter(t.pool, user, "free", { name: "Another", filters: { styles: ["Fusion"] } });
    const list = await listSavedFilters(t.pool, user, "free");
    expect(list.max).toBe(200);
    expect(list.items.map((f) => [f.name, f.filters])).toEqual([
      ["Another", { styles: ["Fusion"] }],
      ["Groove", { styles: ["Boogaloo"], yearFrom: 1966 }],
    ]);

    await expect(
      saveFilter(t.pool, user, "free", { name: "Keywords", filters: { q: "deep funk" } }),
    ).rejects.toMatchObject({ code: "pro_required" });
    expect(
      (await saveFilter(t.pool, user, "pro", { name: "Keywords", filters: { q: "deep funk" } }))
        .name,
    ).toBe("Keywords");

    await expect(deleteSavedFilter(t.pool, newUser(), first.id)).rejects.toMatchObject({
      code: "not_found",
    });
    await deleteSavedFilter(t.pool, user, first.id);
    expect((await listSavedFilters(t.pool, user, "free")).items.map((f) => f.name)).toEqual([
      "Another",
      "Keywords",
    ]);
    await expect(deleteSavedFilter(t.pool, user, first.id)).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("never stores a channel scope, which is YouTube API data: it refuses, never drops it", async () => {
    const user = newUser();
    const channelIds = ["UCaaaaaaaaaaaaaaaaaaaaaa"];
    await expect(
      saveFilter(t.pool, user, "pro", {
        name: "Channel dig",
        filters: { channelIds, styles: ["Boogaloo"], topicOnly: true },
      }),
    ).rejects.toMatchObject({ status: 400, message: CHANNEL_SCOPE_NOT_SAVED });
    const rows = await t.pool.query("select 1 from saved_filters where user_id = $1", [user]);
    expect(rows.rowCount).toBe(0);
    // A channel scope is still a Pro filter, so Free is refused rather than silently emptied.
    await expect(
      saveFilter(t.pool, user, "free", { name: "Channel only", filters: { channelIds } }),
    ).rejects.toMatchObject({ code: "pro_required" });
  });

  it("caps new presets but still replaces one by name at the cap", async () => {
    const user = newUser();
    await t.pool.query(
      `insert into saved_filters (user_id, name, filters)
       select $1, 'f' || n, '{"styles":["Fusion"]}'::jsonb from generate_series(1, 200) as n`,
      [user],
    );
    await expect(
      saveFilter(t.pool, user, "free", { name: "One more", filters: { styles: ["Fusion"] } }),
    ).rejects.toMatchObject({ code: "limit_reached" });
    const replaced = await saveFilter(t.pool, user, "free", {
      name: "f1",
      filters: { styles: ["Boogaloo"] },
    });
    expect(replaced.filters).toEqual({ styles: ["Boogaloo"] });
  });
});

describe("profiles and comments", () => {
  it("keeps display names unique regardless of case", async () => {
    const a = newUser();
    const b = newUser();
    expect(await setDisplayName(t.pool, a, " Night Digger ")).toEqual({
      displayName: "Night Digger",
    });
    await expect(setDisplayName(t.pool, b, "night digger")).rejects.toMatchObject({
      status: 409,
      code: "conflict",
    });
    // Changing the case of your own name is fine.
    expect(await setDisplayName(t.pool, a, "NIGHT DIGGER")).toEqual({
      displayName: "NIGHT DIGGER",
    });
  });

  it("needs a profile, lists newest first, marks your own and deletes only yours", async () => {
    const a = newUser();
    const b = newUser();
    await expect(addComment(t.pool, a, "r:5", "Heavy drums")).rejects.toMatchObject({
      status: 409,
      code: "conflict",
    });
    await setDisplayName(t.pool, a, "Comment Author");
    await expect(addComment(t.pool, a, "m:424242", "Gone")).rejects.toMatchObject({
      code: "not_found",
    });
    const first = await addComment(t.pool, a, "r:5", "  Heavy drums  ");
    expect(first).toMatchObject({
      body: "Heavy drums",
      mine: true,
      author: { displayName: "Comment Author", pro: false, rank: { level: 1 } },
    });
    const second = await addComment(t.pool, a, "r:5", "B-side is better");
    expect((await listComments(t.pool, "r:5", b)).map((c) => [c.id, c.mine])).toEqual([
      [second.id, false],
      [first.id, false],
    ]);
    expect((await listComments(t.pool, "r:5", a)).every((c) => c.mine)).toBe(true);

    await expect(deleteComment(t.pool, b, first.id)).rejects.toMatchObject({ code: "not_found" });
    await deleteComment(t.pool, a, first.id);
    expect((await listComments(t.pool, "r:5", null)).map((c) => c.id)).toEqual([second.id]);
  });

  it(`hides a comment after ${HIDE_AFTER_REPORTS} people report it; no self-reports`, async () => {
    const author = newUser();
    await setDisplayName(t.pool, author, "Reported Author");
    const c = await addComment(t.pool, author, "r:6", "Spam spam spam");
    const count = async () =>
      (
        await t.pool.query<{ report_count: number; hidden: boolean }>(
          "select report_count, hidden from comments where id = $1",
          [c.id],
        )
      ).rows[0];

    // Reports count only from people with a display name (community.int.test.ts).
    const reporter = async () => {
      const u = newUser();
      await setDisplayName(t.pool, u, `Reporter ${u.slice(-4)}`);
      return u;
    };

    await reportComment(t.pool, author, c.id);
    expect(await count()).toEqual({ report_count: 0, hidden: false });
    const one = await reporter();
    await reportComment(t.pool, one, c.id);
    await reportComment(t.pool, one, c.id);
    expect(await count()).toEqual({ report_count: 1, hidden: false });
    await reportComment(t.pool, await reporter(), c.id);
    expect((await listComments(t.pool, "r:6", null)).map((x) => x.id)).toEqual([c.id]);
    await reportComment(t.pool, await reporter(), c.id);
    expect(await count()).toEqual({ report_count: 3, hidden: true });
    expect(await listComments(t.pool, "r:6", null)).toEqual([]);
    await expect(
      reportComment(t.pool, one, "00000000-0000-4000-8000-ffffffffffff"),
    ).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("for you", () => {
  it("is empty until there is something to go on", async () => {
    expect(await forYou(t.pool, newUser(), 0)).toMatchObject({
      items: [],
      basis: [],
      hasMore: false,
    });
  });

  it("draws a stable daily order from the styles a user favorites and plays most", async () => {
    const user = newUser();
    for (const i of [21, 22, 23]) await addFavorite(t.pool, user, "free", ref(i));
    await t.pool.query(
      "insert into history (user_id, played_at, record_key, video_id) values ($1, now(), 'r:41', $2)",
      [user, vid(41)],
    );
    const now = new Date("2026-10-05T12:00:00Z");
    const a = await forYou(t.pool, user, 0, now);
    expect(a.basis).toEqual(["Boogaloo", "Fusion"]);
    expect(a.items.length).toBeGreaterThan(0);
    for (const item of a.items)
      expect(item.record?.styles.some((s) => a.basis.includes(s))).toBe(true);
    const b = await forYou(t.pool, user, 0, now);
    expect(b.items.map((i) => i.videoId)).toEqual(a.items.map((i) => i.videoId));
    expect(b.seed).toBe(a.seed);
  });
});

describe("seeded crates", () => {
  it("refuse a channel scope on create and update, and store other filters normalized", async () => {
    const user = newUser();
    const channelIds = ["UCaaaaaaaaaaaaaaaaaaaaaa"];
    await expect(
      createCrate(t.pool, user, "pro", {
        name: "Channel seeded",
        filters: { channelIds, styles: ["Fusion"] },
        seed: 42,
      }),
    ).rejects.toMatchObject({ status: 400, message: CHANNEL_SCOPE_NOT_SAVED });
    const crate = await createCrate(t.pool, user, "pro", {
      name: "Seeded",
      filters: { styles: ["Fusion", "Boogaloo"] },
      seed: 42,
    });
    expect(crate.filters).toEqual({ styles: ["Boogaloo", "Fusion"] });
    const stored = async () =>
      (
        await t.pool.query<{ filters: unknown }>("select filters from crates where id = $1", [
          crate.id,
        ])
      ).rows[0]?.filters;
    expect(await stored()).toEqual({ styles: ["Boogaloo", "Fusion"] });

    await expect(
      updateCrate(t.pool, user, "pro", crate.id, { filters: { channelIds, yearFrom: 1970 } }),
    ).rejects.toMatchObject({ status: 400 });
    expect(await stored()).toEqual({ styles: ["Boogaloo", "Fusion"] });
    const updated = await updateCrate(t.pool, user, "pro", crate.id, {
      filters: { yearFrom: 1970 },
    });
    expect(updated.filters).toEqual({ yearFrom: 1970 });
    expect(await stored()).toEqual({ yearFrom: 1970 });
    expect(
      (await updateCrate(t.pool, user, "pro", crate.id, { filters: null })).filters,
    ).toBeNull();
  });
});

describe("notes", () => {
  const note = (i: number, body = `Note ${i}`) => ({ ...ref(i), atSeconds: i, body });

  it("adds and lists a user's notes on a video", async () => {
    const user = newUser();
    const a = await addNote(t.pool, user, "free", note(1, "Break at 1:20"));
    expect(a).toMatchObject({
      recordKey: "r:1",
      videoId: vid(1),
      atSeconds: 1,
      body: "Break at 1:20",
    });
    expect((await listNotes(t.pool, user, vid(1))).map((n) => n.id)).toEqual([a.id]);
    expect(await listNotes(t.pool, newUser(), vid(1))).toEqual([]);
  });

  it("stops at the plan's cap", async () => {
    const user = newUser();
    const max = limitsFor("free").maxNotes;
    expect(max).toBe(10_000);
    await t.pool.query(
      `insert into notes (user_id, record_key, video_id, body)
       select $1, 'r:1', $2, 'n' || n from generate_series(1, $3::int) as n`,
      [user, vid(1), max],
    );
    await expect(addNote(t.pool, user, "free", note(2))).rejects.toMatchObject({
      status: 403,
      code: "limit_reached",
    });
    await t.pool.query(
      "delete from notes where id = (select id from notes where user_id = $1 limit 1)",
      [user],
    );
    expect((await addNote(t.pool, user, "pro", note(2))).body).toBe("Note 2");
    // Two at once can't both slip past the cap.
    const race = await Promise.allSettled([
      addNote(t.pool, user, "free", note(3)),
      addNote(t.pool, user, "free", note(4)),
    ]);
    expect(race.every((r) => r.status === "rejected")).toBe(true);
    await t.pool.query(
      "delete from notes where id = (select id from notes where user_id = $1 limit 1)",
      [user],
    );
    const settled = await Promise.allSettled([
      addNote(t.pool, user, "free", note(3)),
      addNote(t.pool, user, "free", note(4)),
    ]);
    expect(settled.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const n = await t.pool.query<{ n: number }>(
      "select count(*)::int as n from notes where user_id = $1",
      [user],
    );
    expect(n.rows[0]?.n).toBe(max);
  });
});

describe("crate item notes", () => {
  it("sets and clears a note on one record in the owner's crate", async () => {
    const user = newUser();
    const crate = await createCrate(t.pool, user, "pro", { name: "Notes" });
    await addItem(t.pool, user, "pro", crate.id, ref(1));
    await addItem(t.pool, user, "pro", crate.id, ref(2));
    await setCrateItemNote(t.pool, user, crate.id, ref(1), "Loop the intro");
    expect((await getCrate(t.pool, user, crate.id)).items.map((i) => i.note)).toEqual([
      "Loop the intro",
      null,
    ]);
    await setCrateItemNote(t.pool, user, crate.id, ref(1), null);
    expect((await getCrate(t.pool, user, crate.id)).items[0]?.note).toBeNull();
    await expect(
      setCrateItemNote(t.pool, user, crate.id, ref(3), "Not in this crate"),
    ).rejects.toMatchObject({ code: "not_found" });
    await expect(
      setCrateItemNote(t.pool, newUser(), crate.id, ref(1), "Not my crate"),
    ).rejects.toMatchObject({ code: "not_found" });
  });
});
