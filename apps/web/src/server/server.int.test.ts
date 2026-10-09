// Integration: the web server's catalog and user-data logic against Postgres.

import type { CopyValue } from "@app/db";
import { copyRows } from "@app/db";
import { createTestDatabase, type TestDatabase } from "@app/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addComment, myComments, setDisplayName } from "./community";
import { addItem, createCrate, getCrate } from "./crates";
import { addFavorite } from "./favorites";
import { listHistory, logPlay } from "./history";
import { catalogItems } from "./records";
import { pickNext } from "./shuffle";
import { TRENDING, trending } from "./trending";

let t: TestDatabase;
const USER = "44444444-4444-4444-4444-444444444444";
const MASTER = ["masterv0001", "masterv0002", "masterv0003"];

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

function row(i: number, styles: string[], playable = true): CopyValue[] {
  return [
    `r:${i}`,
    `vid${String(i).padStart(8, "0")}`,
    i,
    `Record ${i}`,
    "Artist",
    ["Jazz"],
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
  for (let i = 1; i <= 200; i++) rows.push(row(i, i <= 5 ? ["Rare Groove"] : ["Fusion"]));
  rows.push(row(999, ["Rare Groove"], false));
  // A master with three videos, for "More from this release".
  MASTER.forEach((video, i) => {
    const r = row(500, ["Dub"]);
    r[0] = "m:500";
    r[1] = video;
    r[10] = 500_000 + i * 1000;
    rows.push(r);
  });
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

describe("pickNext", () => {
  it("seeks for broad filters and wraps around", async () => {
    const res = await pickNext(t.pool, {
      filters: { styles: ["Fusion"] },
      exclusions: { session: [], seen: [] },
      userId: null,
      viewerCountry: null,
      threshold: 50,
      random: () => 0.999999,
    });
    expect(res.via).toBe("seek");
    expect(res.pick?.recordKey).toBe("r:6"); // r past the last rand_key wraps to the start
    expect(res.pick?.record.discogsUrl).toBe("https://www.discogs.com/release/6");
  });

  it("uses a cached list for narrow filters and honours exclusions", async () => {
    const seen = new Set<string>();
    for (let i = 0; i < 40; i++) {
      const res = await pickNext(t.pool, {
        filters: { styles: ["Rare Groove"] },
        exclusions: { session: ["r:1"], seen: ["vid00000002"] },
        userId: null,
        viewerCountry: null,
        threshold: 50,
      });
      expect(res.via).toBe("list");
      if (res.pick) seen.add(res.pick.recordKey);
    }
    expect([...seen].sort()).toEqual(["r:3", "r:4", "r:5"]);
    const cached = await t.pool.query<{ key: string }>("select key from pick_cache");
    expect(cached.rows.filter((r) => r.key.startsWith("list:"))).toHaveLength(1);
  });

  it("skips records in a signed-in user's history", async () => {
    for (const i of [3, 4]) {
      await t.pool.query(
        "insert into history (user_id, played_at, record_key, video_id) values ($1, now() - ($2 || ' s')::interval, $3, $4)",
        [USER, String(i), `r:${i}`, `vid${String(i).padStart(8, "0")}`],
      );
    }
    const picks = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const res = await pickNext(t.pool, {
        filters: { styles: ["Rare Groove"] },
        exclusions: { session: ["r:1", "r:2"], seen: [] },
        userId: USER,
        viewerCountry: null,
        threshold: 50,
      });
      if (res.pick) picks.add(res.pick.recordKey);
    }
    expect([...picks]).toEqual(["r:5"]);

    // With repeats on, heard records come round again; this session's records still don't.
    const again = new Set<string>();
    for (let i = 0; i < 40; i++) {
      const res = await pickNext(t.pool, {
        filters: { styles: ["Rare Groove"] },
        exclusions: { session: ["r:1", "r:2"], seen: [], repeats: true },
        userId: USER,
        viewerCountry: null,
        threshold: 50,
      });
      if (res.pick) again.add(res.pick.recordKey);
    }
    expect([...again].sort()).toEqual(["r:3", "r:4", "r:5"]);
    const broad = await pickNext(t.pool, {
      filters: { styles: ["Fusion"] },
      exclusions: { session: [], seen: [], repeats: true },
      userId: USER,
      viewerCountry: null,
      threshold: 50,
    });
    expect(broad.via).toBe("seek");
    expect(broad.pick).not.toBeNull();
  });
});

describe("pickNext within one record (More from this release)", () => {
  const SCOPE = { recordKeys: ["m:500"] };
  // A threshold of 50 serves the scope from a cached list; 0 forces the rand_key seek.
  const PATHS = [
    ["list", 50],
    ["seek", 0],
  ] as const;

  async function picks(
    n: number,
    exclusions: { session: string[]; seen: string[]; repeats?: boolean },
    threshold: number,
    userId: string | null = null,
  ) {
    const out: (string | null)[] = [];
    for (let i = 0; i < n; i++) {
      const res = await pickNext(t.pool, {
        filters: SCOPE,
        exclusions,
        userId,
        viewerCountry: null,
        threshold,
      });
      if (res.pick) expect(res.via).toBe(threshold > 0 ? "list" : "seek");
      out.push(res.pick ? `${res.pick.recordKey}/${res.pick.videoId}` : null);
    }
    return out;
  }

  for (const [via, threshold] of PATHS) {
    it(`shuffles inside the record even though the session has shown it (${via})`, async () => {
      // The Dig screen adds every pick to the session list before the scope is applied.
      const got = await picks(30, { session: ["r:1", "m:500"], seen: [] }, threshold);
      expect(got.every((p) => p?.startsWith("m:500/"))).toBe(true);
      // The list picks uniformly; the seek wraps to the lowest rand_key in a set this small.
      if (via === "list") expect(new Set(got).size).toBeGreaterThan(1);
    });

    it(`keeps the video on screen out by its ID, signed in or not (${via})`, async () => {
      // masterv0001 has the lowest rand_key, so the seek would land on it every time.
      for (const userId of [null, "99999999-9999-4999-8999-999999999999"]) {
        const ex = { session: ["m:500"], seen: ["masterv0001"] };
        const got = await picks(20, ex, threshold, userId);
        expect(got.every((p) => p?.startsWith("m:500/"))).toBe(true);
        expect(got).not.toContain("m:500/masterv0001");
        // Repeats lift the server-side history, not the client's own list.
        const again = await picks(20, { ...ex, repeats: true }, threshold, userId);
        expect(again.every((p) => p?.startsWith("m:500/"))).toBe(true);
        expect(again).not.toContain("m:500/masterv0001");
      }
      expect(await picks(1, { session: ["m:500"], seen: MASTER }, threshold, USER)).toEqual([null]);
    });
  }

  it("still skips the session's records outside a scope", async () => {
    const res = await pickNext(t.pool, {
      filters: { styles: ["Rare Groove"] },
      exclusions: { session: ["r:1", "r:2", "r:3", "r:4", "r:5"], seen: [] },
      userId: null,
      viewerCountry: null,
      threshold: 50,
    });
    expect(res.pick).toBeNull();
  });
});

describe("history", () => {
  it("trims to the plan's window on insert and pages newest first", async () => {
    const user = "55555555-5555-5555-5555-555555555555";
    for (let i = 1; i <= 53; i++) {
      await logPlay(t.pool, user, "free", {
        recordKey: `r:${i}`,
        videoId: `vid${String(i).padStart(8, "0")}`,
        seconds: 5,
      });
    }
    const n = await t.pool.query("select count(*)::int as n from history where user_id = $1", [
      user,
    ]);
    expect(n.rows[0]?.n).toBe(50);
    const page = await listHistory(t.pool, user, "free", null);
    expect(page.window).toBe(50);
    expect(page.items[0]?.recordKey).toBe("r:53");
    expect(page.items).toHaveLength(50);
    expect(page.nextCursor).toBeNull();
  });
});

describe("crates", () => {
  it("keeps crates a Pro tool, keeps order and marks unavailable records", async () => {
    const user = "66666666-6666-6666-6666-666666666666";
    // Free accounts favorite records instead; crates are Pro (200 crates of 1,000 records).
    await expect(createCrate(t.pool, user, "free", { name: "Keepers" })).rejects.toMatchObject({
      code: "pro_required",
    });
    const crate = await createCrate(t.pool, user, "pro", { name: "Keepers" });
    for (let i = 1; i <= 50; i++) {
      await addItem(t.pool, user, "pro", crate.id, {
        recordKey: `r:${i}`,
        videoId: `vid${String(i).padStart(8, "0")}`,
      });
    }
    // A lapsed subscriber keeps the crate but can't add to it.
    await expect(
      addItem(t.pool, user, "free", crate.id, { recordKey: "r:51", videoId: "vid00000051" }),
    ).rejects.toMatchObject({ code: "pro_required" });
    const detail = await addItem(t.pool, user, "pro", crate.id, {
      recordKey: "r:999",
      videoId: "vid00000999",
    });
    expect(detail.items).toHaveLength(51);
    expect(detail.items[0]?.recordKey).toBe("r:1");
    expect(detail.items.at(-1)).toMatchObject({ recordKey: "r:999", available: false, note: null });
    await expect(
      getCrate(t.pool, "77777777-7777-7777-7777-777777777777", crate.id),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("reports records that left the catalog with no summary", async () => {
    const items = await catalogItems(t.pool, [
      { recordKey: "r:1", videoId: "vid00000001" },
      { recordKey: "m:424242", videoId: "gonegonegon" },
    ]);
    expect(items.get("r:1/vid00000001")?.available).toBe(true);
    expect(items.get("m:424242/gonegonegon")).toMatchObject({ available: false, record: null });
  });
});

describe("trending", () => {
  it("ranks records by recent fans, needs two of them, and skips unplayable videos", async () => {
    const fans = [1, 2, 3].map((i) => `aaaaaaa${i}-aaaa-4aaa-8aaa-aaaaaaaaaaaa`);
    const ref = (i: number) => ({
      recordKey: `r:${i}`,
      videoId: `vid${String(i).padStart(8, "0")}`,
    });
    for (const u of fans) await addFavorite(t.pool, u, "free", ref(10));
    for (const u of fans.slice(0, 2)) await addFavorite(t.pool, u, "free", ref(11));
    await addFavorite(t.pool, fans[0] as string, "free", ref(12)); // one fan: not shown
    for (const u of fans.slice(0, 2)) await addFavorite(t.pool, u, "free", ref(13));
    await t.pool.query(
      "update favorites set added_at = now() - interval '30 days' where record_key = 'r:13'",
    );
    await t.pool.query("delete from pick_cache where key like 'trending:%'");
    const res = await trending(t.pool);
    expect(res.days).toBe(TRENDING.days);
    expect(res.items.map((i) => [i.recordKey, i.fans])).toEqual([
      ["r:10", 3],
      ["r:11", 2],
    ]);
  });
});

describe("my comments", () => {
  it("lists the viewer's comments with the record they're on", async () => {
    const me = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    await setDisplayName(t.pool, me, "Night Owl");
    await addComment(t.pool, me, "r:7", "first");
    await addComment(t.pool, me, "r:8", "second");
    const mine = await myComments(t.pool, me);
    expect(mine.map((c) => [c.body, c.record?.title])).toEqual([
      ["second", "Record 8"],
      ["first", "Record 7"],
    ]);
    expect(await myComments(t.pool, USER)).toEqual([]);
  });

  it("treats names that differ only in case, separators or width as taken", async () => {
    const other = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    for (const copy of ["night.owl", "NIGHT_OWL", "Ｎight Owl"]) {
      await expect(setDisplayName(t.pool, other, copy)).rejects.toMatchObject({ status: 409 });
    }
    expect(await setDisplayName(t.pool, other, "Ｄay Owl")).toEqual({ displayName: "Day Owl" });
  });
});
