// Integration: fixture dumps through stage, build, swap and diff, twice, against Postgres,
// served over HTTP by the fixture dump server (DISCOGS_DUMPS_BASE_URL in production).

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { rollbackCatalog } from "@app/db";
import { createTestDatabase, type TestDatabase } from "@app/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ChecksumError, runIngest } from "../src/ingest/run";
import { runValidate } from "../src/jobs/validate";
import { startFixtureServer } from "./fixture-server";

const fixture = (name: string) =>
  gzipSync(readFileSync(new URL(`../../../fixtures/discogs/${name}`, import.meta.url)));
const recording = JSON.parse(
  readFileSync(
    new URL("../../../fixtures/youtube/videos-list-mixed.json", import.meta.url),
    "utf8",
  ),
) as { body: unknown };

const OCT = fixture("releases-small.xml");
const NOV = fixture("releases-small-next.xml");
const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");

let t: TestDatabase;
let server: Awaited<ReturnType<typeof startFixtureServer>>;

type Row = Record<string, unknown>;
async function rows(sql: string, values: unknown[] = []): Promise<Row[]> {
  return (await t.pool.query(sql, values)).rows;
}
async function rv(recordKey: string, videoId: string): Promise<Row> {
  const [row] = await rows("select * from record_videos where record_key = $1 and video_id = $2", [
    recordKey,
    videoId,
  ]);
  if (!row) throw new Error(`missing ${recordKey}/${videoId}`);
  return row;
}

function deps(now: string) {
  return { pool: t.pool, baseUrl: server.url, now: () => new Date(now) };
}

beforeAll(async () => {
  t = await createTestDatabase();
  server = await startFixtureServer({
    "/?prefix=data/2026/": {
      type: "text/html",
      body: [
        '<a href="data/2026/discogs_20261001_releases.xml.gz">oct</a>',
        '<a href="data/2026/discogs_20261001_CHECKSUM.txt">oct sums</a>',
        '<a href="data/2026/discogs_20261101_releases.xml.gz">nov</a>',
        '<a href="data/2026/discogs_20261101_CHECKSUM.txt">nov sums</a>',
        '<a href="data/2026/discogs_20261201_releases.xml.gz">dec</a>',
      ].join("\n"),
    },
    "/data/2026/discogs_20261001_releases.xml.gz": { body: OCT },
    "/data/2026/discogs_20261001_CHECKSUM.txt": {
      body: `${sha(OCT)}  discogs_20261001_releases.xml.gz\n`,
    },
    "/data/2026/discogs_20261101_releases.xml.gz": { body: NOV },
    "/data/2026/discogs_20261101_CHECKSUM.txt": {
      body: `${sha(NOV)}  discogs_20261101_releases.xml.gz\n`,
    },
    "/data/2026/discogs_20261201_releases.xml.gz": { body: NOV },
    "/data/2026/discogs_20261201_CHECKSUM.txt": {
      body: `${"0".repeat(64)}  discogs_20261201_releases.xml.gz\n`,
    },
  });
});

afterAll(async () => {
  await server?.close();
  await t?.drop();
});

const dump = (stamp: string) => ({
  stamp,
  dumpDate: `${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6)}`,
  releasesUrl: `${server.url}data/2026/discogs_${stamp}_releases.xml.gz`,
  checksumUrl: `${server.url}data/2026/discogs_${stamp}_CHECKSUM.txt`,
});

describe("ingest, month one", () => {
  it("discovers the newest dump, but a pinned dump wins", async () => {
    const outcome = await runIngest(deps("2026-10-02T06:00:00Z"), { dump: dump("20261001") });
    expect(outcome).toMatchObject({
      status: "succeeded",
      dumpDate: "2026-10-01",
      releasesSeen: 8,
      records: 4,
      recordVideos: 8,
      addedRecords: 4,
      removedRecords: 0,
      newVideoIds: 8,
    });
  });

  it("skips a dump that already succeeded", async () => {
    const again = await runIngest(deps("2026-10-02T06:00:00Z"), { dump: dump("20261001") });
    expect(again).toEqual({
      status: "skipped",
      reason: "dump already ingested",
      dumpDate: "2026-10-01",
    });
  });

  it("keeps full rows only for releases with YouTube links", async () => {
    const ids = (await rows("select id from releases order by id")).map((r) => Number(r.id));
    expect(ids).toEqual([101, 102, 201, 203, 204]);
  });

  it("groups pressings by record: counts, earliest year, country rule and unions", async () => {
    const r = await rv("m:7001", "GlassHarb01");
    expect(r).toMatchObject({
      pressings: 3,
      year: 1993,
      country: "UK",
      label_name: "Tidewater Sound",
      catno: "TW-001",
      artist_display: "Marlo Venn",
      release_id: 101,
      track_position: "A1",
      track_title: "Glass Harbour",
      playable: false,
      added_in_dump: "2026-10-01",
    });
    expect(r.styles).toEqual(["Ambient", "Deep House", "Dub Techno"]);
    expect(r.format_names).toEqual(["CD", "Vinyl"]);
    expect(r.format_descriptions).toEqual(expect.arrayContaining(["Promo", "Reissue", "Album"]));
    expect(r.artist_ids).toEqual([9001]);
  });

  it("matches links to tracks across pressings", async () => {
    const positions = Object.fromEntries(
      (await rows("select video_id, track_position from record_videos")).map((x) => [
        x.video_id,
        x.track_position,
      ]),
    );
    expect(positions).toEqual({
      GlassHarb01: "A1",
      NightFerry1: "B1",
      LowTideDub9: "B",
      CalleOcho_1: "A",
      NeonRain_77: "A1",
      LastTrain_1: "A2b",
      CratesDJh01: "A1",
      Dust_LoFi02: "A2",
    });
  });

  it("scores deep cuts from Discogs data only", async () => {
    const deep = Object.fromEntries(
      (await rows("select distinct record_key, deep_cut from record_videos")).map((x) => [
        x.record_key,
        x.deep_cut,
      ]),
    );
    for (const v of Object.values(deep)) expect(v).toBeGreaterThanOrEqual(0);
    expect(deep["r:201"]).toBeGreaterThan(deep["m:7001"] as number);
  });

  it("registers new IDs as unchecked with the Discogs embed flag", async () => {
    const yt = await rows(
      "select video_id, status, dump_embed_flag, first_seen_dump from yt_videos order by video_id",
    );
    expect(yt).toHaveLength(8);
    expect(yt.every((y) => y.status === "unchecked" && y.first_seen_dump === "2026-10-01")).toBe(
      true,
    );
    expect(yt.find((y) => y.video_id === "LowTideDub9")?.dump_embed_flag).toBe(false);
  });

  it("records the run, the census and a changelog draft, and cleans up staging", async () => {
    const [run] = await rows("select * from ingest_runs");
    expect(run).toMatchObject({
      status: "succeeded",
      releases_seen: 8,
      records: 4,
      record_videos: 8,
      new_video_ids: 8,
    });
    expect(run?.sha256).toBe(sha(OCT));
    const [census] = await rows("select census from style_census where dump_date = '2026-10-01'");
    const c = census?.census as {
      basis: string;
      totalRecords: number;
      styles: Record<string, { records: number; cooccurring: [string, number][] }>;
    };
    expect(c.basis).toBe("all");
    expect(c.totalRecords).toBe(4);
    expect(c.styles["Deep House"]?.records).toBe(1);
    expect(c.styles["Deep House"]?.cooccurring.map(([s]) => s)).toEqual(["Ambient", "Dub Techno"]);
    const [entry] = await rows("select kind, title, draft, body from changelog_entries");
    expect(entry).toMatchObject({
      kind: "data",
      title: "Catalog update: October 2026",
      draft: true,
    });
    expect(String(entry?.body)).toContain("4 records with 8 YouTube links");
    const leftovers = await rows(
      "select tablename from pg_tables where schemaname = 'public' and (tablename like 'stg_%' or tablename like 'tmp_%')",
    );
    expect(leftovers).toEqual([]);
    const idx = await rows(
      "select indexname from pg_indexes where tablename = 'record_videos' order by 1",
    );
    expect(idx.map((i) => i.indexname)).toContain("record_videos_shuffle");
    expect(idx.map((i) => i.indexname)).toContain("record_videos_pkey");
  });
});

describe("validation between months", () => {
  it("marks checked videos and mirrors playability", async () => {
    const res = await runValidate({
      db: t.pool,
      apiKey: "test-key",
      budget: 100,
      now: () => new Date("2026-10-05T12:00:00Z"),
      fetch: async () => ({ ok: true, status: 200, json: async () => recording.body }),
    });
    expect(res).toMatchObject({ checked: 8, calls: 1, stoppedFor: "done" });
    const playable = (
      await rows("select video_id from record_videos where playable order by 1")
    ).map((r) => r.video_id);
    expect(playable).toEqual(["GlassHarb01", "LastTrain_1", "NightFerry1"]);
    const [usage] = await rows("select units from yt_quota_usage where pacific_day = '2026-10-05'");
    expect(usage?.units).toBe(1);
  });
});

describe("ingest, month two", () => {
  let before: Map<string, number>;

  it("carries rand_key, added_in_dump and playability; joins accepted suggestions", async () => {
    before = new Map(
      (await rows("select record_key || '/' || video_id as k, rand_key from record_videos")).map(
        (r) => [String(r.k), Number(r.rand_key)],
      ),
    );
    await t.pool.query(
      `insert into yt_videos (video_id, dump_embed_flag, status, checked_at, first_seen_dump)
       values ('SuggestVid1', true, 'playable', now(), '2026-10-20')`,
    );
    await t.pool.query(
      `insert into link_suggestions (user_id, record_key, video_id, status)
       values ('22222222-2222-2222-2222-222222222222', 'r:203', 'SuggestVid1', 'accepted')`,
    );
    const outcome = await runIngest(deps("2026-11-02T06:00:00Z"), { dump: dump("20261101") });
    expect(outcome).toMatchObject({
      status: "succeeded",
      dumpDate: "2026-11-01",
      addedRecords: 1,
      removedRecords: 1,
      newVideoIds: 2,
    });
    for (const [k, rand] of before) {
      if (k.startsWith("r:201/")) continue;
      const [recordKey, videoId] = k.split("/") as [string, string];
      const row = await rv(recordKey, videoId);
      expect(row.rand_key).toBe(rand);
      expect(row.added_in_dump).toBe("2026-10-01");
    }
    expect((await rv("m:7001", "GlassHarb01")).playable).toBe(true);
    expect(await rv("m:7001", "GlassJapan1")).toMatchObject({
      added_in_dump: "2026-11-01",
      playable: false,
    });
    expect(await rv("r:203", "SuggestVid1")).toMatchObject({
      track_position: null,
      playable: true,
    });
  });

  it("updates record facts with the new pressing and drops records that left the dump", async () => {
    const r = await rv("m:7001", "GlassHarb01");
    expect(r).toMatchObject({ pressings: 4, year: 1990, country: "UK" });
    expect(r.styles).toEqual(["Ambient", "Balearic", "Deep House", "Dub Techno"]);
    const keys = (await rows("select distinct record_key from record_videos order by 1")).map(
      (x) => x.record_key,
    );
    expect(keys).toEqual(["m:7001", "m:7002", "r:203", "r:301"]);
    const old = await rows("select count(*)::int as n from old_record_videos");
    expect(old[0]?.n).toBe(8);
  });

  it("rejects a dump whose checksum doesn't match and leaves the live tables alone", async () => {
    const liveBefore = await rows("select record_key, video_id from record_videos order by 1, 2");
    // Discovery picks the newest listed dump: December, whose published checksum is wrong.
    await expect(runIngest(deps("2026-12-02T06:00:00Z"), {})).rejects.toBeInstanceOf(ChecksumError);
    expect(await rows("select record_key, video_id from record_videos order by 1, 2")).toEqual(
      liveBefore,
    );
    const [run] = await rows(
      "select status, error from ingest_runs where dump_date = '2026-12-01'",
    );
    expect(run?.status).toBe("failed");
    expect(String(run?.error)).toContain("Checksum mismatch");
    const staging = await rows("select tablename from pg_tables where tablename like 'stg_%'");
    expect(staging).toEqual([]);
    expect((await rows("select count(*)::int as n from old_record_videos"))[0]?.n).toBe(8);
  });

  it("rolls back to last month's catalog", async () => {
    const client = await t.pool.connect();
    try {
      await rollbackCatalog(client);
    } finally {
      client.release();
    }
    const keys = (await rows("select distinct record_key from record_videos order by 1")).map(
      (x) => x.record_key,
    );
    expect(keys).toEqual(["m:7001", "m:7002", "r:201", "r:203"]);
    const idx = await rows("select indexname from pg_indexes where tablename = 'record_videos'");
    expect(idx.map((i) => i.indexname)).toContain("record_videos_shuffle");
  });
});
