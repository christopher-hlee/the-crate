// Integration: keyword search on a catalog big enough for the planner to prefer indexes.
// Set queries (counts, candidate lists, seeded orders) must be able to use both GIN expression
// indexes; the seek must walk rand_key instead of collecting every match first.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  buildCandidateListQuery,
  buildCountQuery,
  buildPickQuery,
  buildSeededQuery,
  type PickRow,
} from "./shuffle";
import type { Query } from "./sql";
import { createTestDatabase, type TestDatabase } from "./testing";

let t: TestDatabase;
const ROWS = 20_000;
const vid = (n: number) => `v${String(n).padStart(10, "0")}`;

beforeAll(async () => {
  t = await createTestDatabase();
  await t.pool.query(
    `insert into record_videos (record_key, video_id, release_id, title, artist_display, label_name,
       track_title, genres, styles, format_names, format_descriptions, pressings, rand_key, playable,
       added_in_dump)
     select 'r:' || n, 'v' || lpad(n::text, 10, '0'), n,
            (array['Midnight','Sunrise','Groove','Session','Dream'])[1 + n % 5] || ' ' || (n % 997),
            'Artist ' || (n % 503), 'Label ' || (n % 71),
            (array['Intro','Theme','Outro','Dub'])[1 + n % 4],
            array['Electronic'],
            array[(array['House','Techno','Post-Punk','Boogaloo'])[1 + n % 4]],
            array['Vinyl'], array['LP'], 1, (hashint4(n) & 2147483647), true, '2026-10-01'
       from generate_series(1, $1::int) n`,
    [ROWS],
  );
  await t.pool.query(
    `insert into yt_videos (video_id, dump_embed_flag, status, first_seen_dump, title, tags)
     select 'v' || lpad(n::text, 10, '0'), true, 'playable', '2026-10-01',
            'Upload ' || (n % 301) || ' ' || (array['full album','vinyl rip','live'])[1 + n % 3],
            array['music']
       from generate_series(1, $1::int, 2) n`,
    [ROWS],
  );
  // A rare word in YouTube titles (2 rows), and one in the Discogs names of two rows and the
  // YouTube titles of two, one of them the same row, which must still come once.
  await t.pool.query(
    "update record_videos set title = 'Zyxwvut Sessions' where video_id = any($1::text[])",
    [[vid(1234), vid(15001)]],
  );
  await t.pool.query(
    "update yt_videos set title = 'Qwplkj bootleg' where video_id = any($1::text[])",
    [[vid(101), vid(5001)]],
  );
  await t.pool.query(
    "update yt_videos set title = 'Zyxwvut tape' where video_id = any($1::text[])",
    [[vid(7001), vid(15001)]],
  );
  await t.pool.query("analyze record_videos");
  await t.pool.query("analyze yt_videos");
});

afterAll(async () => {
  await t?.drop();
});

async function plan(q: Query): Promise<string> {
  const res = await t.pool.query<{ "QUERY PLAN": string }>(
    `explain (costs off) ${q.text}`,
    q.values,
  );
  return res.rows.map((r) => r["QUERY PLAN"]).join("\n");
}

async function count(q: Query): Promise<number> {
  return (await t.pool.query<{ n: number }>(q.text, q.values)).rows[0]?.n ?? -1;
}

async function keys(q: Query): Promise<string[]> {
  const res = await t.pool.query<{ video_id: string }>(q.text, q.values);
  return res.rows.map((r) => r.video_id).sort();
}

describe("keyword set queries", () => {
  it("serve a rare word from the GIN indexes and count a two-sided match once", async () => {
    const q = buildCountQuery({ q: "zyxwvut" }, { cap: 5000 });
    const p = await plan(q);
    expect(p).toContain("record_videos_search");
    expect(p).toContain("yt_videos_search");
    expect(p).not.toMatch(/Seq Scan on record_videos/);
    expect(await count(q)).toBe(3);
    expect(await keys(buildCandidateListQuery({ q: "zyxwvut" }, { limit: 5001 }))).toEqual([
      vid(1234),
      vid(7001),
      vid(15001),
    ]);
  });

  it("serve a rare YouTube word from the GIN indexes", async () => {
    const list = buildCandidateListQuery({ q: "qwplkj" }, { limit: 5001 });
    const p = await plan(list);
    expect(p).toContain("record_videos_search");
    expect(p).toContain("yt_videos_search");
    expect(p).not.toMatch(/Seq Scan on record_videos/);
    expect(await keys(list)).toEqual([vid(101), vid(5001)]);
    const seeded = buildSeededQuery({ q: "qwplkj" }, { seed: 3, limit: 50 });
    expect(await plan(seeded)).toContain("yt_videos_search");
    expect(await keys(seeded)).toEqual([vid(101), vid(5001)]);
  });

  it("keep every word within one source", async () => {
    // "sessions" is only in the Discogs title and "bootleg" only in the YouTube one.
    expect(await count(buildCountQuery({ q: "sessions bootleg" }))).toBe(0);
    expect(await count(buildCountQuery({ q: "qwplkj bootleg" }))).toBe(2);
    expect(await count(buildCountQuery({ q: "zyxwvut tape" }))).toBe(2);
    expect(await count(buildCountQuery({ q: "zyxwvut sessions" }))).toBe(2);
  });

  it("match hyphenated styles as Discogs writes them", async () => {
    expect(await count(buildCountQuery({ q: "Post-Punk" }, { cap: 100_000 }))).toBe(ROWS / 4);
    expect(await count(buildCountQuery({ q: "post punk" }, { cap: 100_000 }))).toBe(ROWS / 4);
  });

  it("stop a capped count early for a common word", async () => {
    expect(await count(buildCountQuery({ q: "vinyl rip" }, { cap: 100 }))).toBe(101);
    expect(await count(buildCountQuery({ q: "techno" }, { cap: 100 }))).toBe(101);
  });
});

describe("keyword seek", () => {
  it("walks rand_key for a broad word on either side", async () => {
    for (const q of ["techno", "vinyl rip"]) {
      const query = buildPickQuery({ q }, { r: 1_000_000 });
      expect(await plan(query)).toContain("record_videos_shuffle");
      const row = (await t.pool.query<PickRow>(query.text, query.values)).rows[0];
      expect(row).toBeDefined();
    }
  });

  it("returns only rows that match", async () => {
    const query = buildPickQuery({ q: "qwplkj" }, { r: 0 });
    const row = (await t.pool.query<PickRow>(query.text, query.values)).rows[0];
    expect([vid(101), vid(5001)]).toContain(row?.video_id);
  });
});
