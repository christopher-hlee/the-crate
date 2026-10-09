// Integration: favorites, saved filters, comments and profiles, "For you" and crate item notes
// against Postgres.

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
import { addItem, createCrate, getCrate, setCrateItemNote } from "./crates";
import {
  addFavorite,
  favoriteStatus,
  listFavorites,
  removeFavorite,
  setFavoriteNote,
} from "./favorites";
import { forYou } from "./for-you";
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

  it("pages 50 at a time with an offset cursor", async () => {
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
    expect(one.nextCursor).toBe("50");
    expect(one.total).toBe(55);
    const two = await listFavorites(t.pool, user, "pro", one.nextCursor);
    expect(two.items.map((i) => i.recordKey)).toEqual(["r:91", "r:92", "r:93", "r:94", "r:95"]);
    expect(two.nextCursor).toBeNull();
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
