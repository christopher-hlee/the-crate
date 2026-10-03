// Integration: shuffle queries against a real Postgres (TEST_DATABASE_URL).

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CopyValue } from "./copy";
import { copyRows } from "./copy";
import {
  buildCandidateListQuery,
  buildCountQuery,
  buildPickQuery,
  buildSeededQuery,
  type Exclusions,
  type PickRow,
} from "./shuffle";
import { createTestDatabase, type TestDatabase } from "./testing";

let t: TestDatabase;

const USER = "11111111-1111-1111-1111-111111111111";

type Row = {
  key: string;
  vid: string;
  rand: number;
  playable?: boolean;
  styles?: string[];
  genres?: string[];
  year?: number | null;
  country?: string | null;
  formats?: string[];
  descs?: string[];
  bpm?: number | null;
  camelot?: string | null;
  deep?: number | null;
  label?: number | null;
  artists?: number[];
};

const COLUMNS = [
  "record_key",
  "video_id",
  "release_id",
  "title",
  "artist_display",
  "artist_ids",
  "label_id",
  "year",
  "country",
  "genres",
  "styles",
  "format_names",
  "format_descriptions",
  "pressings",
  "deep_cut",
  "bpm",
  "camelot_key",
  "rand_key",
  "playable",
  "added_in_dump",
];

function toCopy(r: Row): CopyValue[] {
  return [
    r.key,
    r.vid,
    Number(r.key.slice(2)),
    `Title ${r.key}`,
    "Artist",
    r.artists ?? [],
    r.label ?? null,
    r.year === undefined ? 1995 : r.year,
    r.country === undefined ? "UK" : r.country,
    r.genres ?? ["Electronic"],
    r.styles ?? ["House"],
    r.formats ?? ["Vinyl"],
    r.descs ?? ["LP"],
    1,
    r.deep ?? null,
    r.bpm ?? null,
    r.camelot ?? null,
    r.rand,
    r.playable ?? true,
    "2026-10-01",
  ];
}

const ROWS: Row[] = [
  {
    key: "m:1",
    vid: "vid00000001",
    rand: 100,
    styles: ["House", "Deep House"],
    year: 1992,
    bpm: 122,
    camelot: "8A",
    label: 5,
    artists: [7],
  },
  {
    key: "m:1",
    vid: "vid00000002",
    rand: 200,
    styles: ["House", "Deep House"],
    year: 1992,
    bpm: 61,
    camelot: "9A",
    label: 5,
  },
  {
    key: "m:2",
    vid: "vid00000003",
    rand: 300,
    styles: ["Techno"],
    year: 1999,
    country: "Germany",
    bpm: 135,
    camelot: "1B",
    deep: 0.9,
  },
  {
    key: "r:3",
    vid: "vid00000004",
    rand: 400,
    styles: ["Boogaloo"],
    genres: ["Latin"],
    year: 1971,
    country: "US",
    formats: ["Vinyl"],
    descs: ['7"', "Promo"],
    deep: 0.95,
  },
  { key: "r:4", vid: "vid00000005", rand: 50, playable: false, styles: ["House"] },
  {
    key: "r:5",
    vid: "vid00000006",
    rand: 500,
    styles: ["House"],
    year: null,
    country: null,
    formats: ["CD"],
  },
  { key: "r:6", vid: "vid00000007", rand: 600, styles: ["Ambient"], year: 2005 },
];

async function pick(
  filters: Parameters<typeof buildPickQuery>[0],
  ctx: Exclusions & { r: number },
) {
  const q = buildPickQuery(filters, ctx);
  const res = await t.pool.query<PickRow>(q.text, q.values);
  return res.rows[0] ?? null;
}

/** Every distinct pick reachable for a filter by walking r across the key space. */
async function reachable(filters: Parameters<typeof buildPickQuery>[0], ctx: Exclusions = {}) {
  const seen = new Set<string>();
  for (const r of [0, 99, 101, 201, 301, 401, 501, 601]) {
    const row = await pick(filters, { ...ctx, r });
    if (row) seen.add(row.video_id);
  }
  return [...seen].sort();
}

beforeAll(async () => {
  t = await createTestDatabase();
  const client = await t.pool.connect();
  try {
    await copyRows(client, "record_videos", COLUMNS, ROWS.map(toCopy));
  } finally {
    client.release();
  }
  await t.pool.query(`
    insert into yt_videos (video_id, dump_embed_flag, status, view_count, region_blocked, region_allowed, first_seen_dump) values
      ('vid00000001', true, 'playable', 500, '{DE}', null, '2026-10-01'),
      ('vid00000002', true, 'playable', 5000000, null, null, '2026-10-01'),
      ('vid00000003', true, 'playable', 100, null, '{DE,AT}', '2026-10-01'),
      ('vid00000004', true, 'playable', 20, null, null, '2026-10-01')`);
  await t.pool.query(
    "insert into history (user_id, played_at, record_key, video_id) values ($1, now(), 'r:6', 'vid00000007')",
    [USER],
  );
});

afterAll(async () => {
  await t?.drop();
});

describe("unseeded pick", () => {
  it("returns only playable rows, seeking from r and wrapping to the start", async () => {
    expect((await pick({}, { r: 0 }))?.video_id).toBe("vid00000001");
    expect((await pick({}, { r: 101 }))?.video_id).toBe("vid00000002");
    expect(await pick({}, { r: 601 })).toBeNull();
    expect(await reachable({})).not.toContain("vid00000005");
  });

  it("returns the full pick row", async () => {
    const row = await pick({}, { r: 0 });
    expect(row).toMatchObject({
      record_key: "m:1",
      release_id: 1,
      title: "Title m:1",
      styles: ["House", "Deep House"],
      year: 1992,
      bpm: 122,
      camelot_key: "8A",
    });
  });

  it("applies Free filters", async () => {
    expect(await reachable({ styles: ["House"] })).toEqual([
      "vid00000001",
      "vid00000002",
      "vid00000006",
    ]);
    expect(await reachable({ styles: ["House"], yearFrom: 1990, yearTo: 1995 })).toEqual([
      "vid00000001",
      "vid00000002",
    ]);
    expect(await reachable({ countries: ["Germany", "US"] })).toEqual([
      "vid00000003",
      "vid00000004",
    ]);
    expect(await reachable({ genres: ["Latin"] })).toEqual(["vid00000004"]);
    expect(await reachable({ formats: ["CD"] })).toEqual(["vid00000006"]);
  });

  it("applies Pro filters", async () => {
    expect(await reachable({ bpmFrom: 120, bpmTo: 124 })).toEqual(["vid00000001"]);
    expect(await reachable({ bpmFrom: 120, bpmTo: 124, halfDouble: true })).toEqual([
      "vid00000001",
      "vid00000002",
    ]);
    expect(await reachable({ key: "8A" })).toEqual(["vid00000001"]);
    expect(await reachable({ key: "8A", compatibleKeys: true })).toEqual([
      "vid00000001",
      "vid00000002",
    ]);
    expect(await reachable({ deepCutMin: 0.92 })).toEqual(["vid00000004"]);
    expect(await reachable({ formatDescriptions: ["Promo"] })).toEqual(["vid00000004"]);
    expect(await reachable({ labelIds: [5] })).toEqual(["vid00000001", "vid00000002"]);
    expect(await reachable({ artistIds: [7] })).toEqual(["vid00000001"]);
    expect(await reachable({ maxViews: 1000 })).toEqual([
      "vid00000001",
      "vid00000003",
      "vid00000004",
    ]);
  });

  it("respects session, client-seen and history exclusions", async () => {
    expect(await reachable({ styles: ["House"] }, { sessionRecordKeys: ["m:1"] })).toEqual([
      "vid00000006",
    ]);
    expect(await reachable({ styles: ["House"] }, { clientSeenIds: ["vid00000006"] })).toEqual([
      "vid00000001",
      "vid00000002",
    ]);
    expect(await reachable({ styles: ["Ambient"] }, { userId: USER })).toEqual([]);
    expect(await reachable({ styles: ["Ambient"] })).toEqual(["vid00000007"]);
  });

  it("respects region rules for the viewer's country", async () => {
    const all = await reachable({});
    const inGermany = await reachable({}, { viewerCountry: "DE" });
    const inFrance = await reachable({}, { viewerCountry: "FR" });
    expect(all).toContain("vid00000001");
    expect(inGermany).not.toContain("vid00000001"); // blocked in DE
    expect(inGermany).toContain("vid00000003"); // allowed in DE
    expect(inFrance).toContain("vid00000001");
    expect(inFrance).not.toContain("vid00000003"); // allowed only in DE, AT
  });
});

describe("counts and candidate lists", () => {
  it("counts playable matches with a cap and tempo coverage", async () => {
    const q = buildCountQuery({ styles: ["House"] });
    const res = await t.pool.query<{ n: number; with_tempo: number }>(q.text, q.values);
    expect(res.rows[0]).toEqual({ n: 3, with_tempo: 2 });
    const capped = buildCountQuery({}, { cap: 2 });
    expect((await t.pool.query<{ n: number }>(capped.text, capped.values)).rows[0]?.n).toBe(3);
  });

  it("lists candidates for narrow filters", async () => {
    const q = buildCandidateListQuery({ styles: ["Techno", "Boogaloo"] }, { limit: 10 });
    const res = await t.pool.query<{ video_id: string }>(q.text, q.values);
    expect(res.rows.map((r) => r.video_id).sort()).toEqual(["vid00000003", "vid00000004"]);
  });
});

describe("seeded order", () => {
  async function order(seed: number) {
    const q = buildSeededQuery({}, { seed, limit: 50 });
    return (await t.pool.query<{ video_id: string }>(q.text, q.values)).rows.map((r) => r.video_id);
  }

  it("is stable for one seed and differs across seeds", async () => {
    const a = await order(1);
    expect(await order(1)).toEqual(a);
    expect(a).toHaveLength(6);
    const others = await Promise.all([2, 3, 4, 5].map(order));
    expect(others.some((o) => o.join() !== a.join())).toBe(true);
  });

  it("pages without overlap", async () => {
    const page = async (offset: number) => {
      const q = buildSeededQuery({}, { seed: 7, limit: 2, offset });
      return (await t.pool.query<{ video_id: string }>(q.text, q.values)).rows.map(
        (r) => r.video_id,
      );
    };
    const pages = [...(await page(0)), ...(await page(2)), ...(await page(4))];
    expect(new Set(pages).size).toBe(6);
  });
});
