import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startFixtureServer } from "../../test/fixture-server";
import { countCatalog } from "./catalog-count";

const FIXTURE = new URL("../../../../fixtures/discogs/releases-small.xml", import.meta.url)
  .pathname;
const xml = readFileSync(FIXTURE);
const gz = gzipSync(xml);
const gzSha = createHash("sha256").update(gz).digest("hex");
const DUMP = "data/2026/discogs_20261001_releases.xml.gz";

let server: Awaited<ReturnType<typeof startFixtureServer>>;

beforeAll(async () => {
  server = await startFixtureServer({
    [`/${DUMP}`]: { body: gz },
    "/data/2026/discogs_20261001_CHECKSUM.txt": {
      body: `${gzSha}  discogs_20261001_releases.xml.gz\n`,
    },
    "/bad/discogs_20261001_releases.xml.gz": { body: gz },
    "/bad/discogs_20261001_CHECKSUM.txt": {
      body: `${"0".repeat(64)}  discogs_20261001_releases.xml.gz\n`,
    },
  });
});

afterAll(async () => {
  await server.close();
});

describe("countCatalog", () => {
  it("counts a plain XML file", async () => {
    const r = await countCatalog({ source: FIXTURE });
    expect(r).toMatchObject({
      releasesScanned: 8,
      releasesWithYouTubeLinks: 5,
      youtubeLinks: 9,
      uniqueVideoIds: 8,
      embedFalse: { links: 1, uniqueVideoIds: 1, shareOfUniqueVideoIds: 0.125 },
      nonYouTubeLinks: 3,
      records: { withYouTubeLinks: 4 },
      bytesRead: xml.length,
      checksum: { expected: null, matches: null },
      parseErrors: { count: 0 },
    });
    expect(r.linked.byStyle["Deep House"]).toBe(2);
    expect(r.linked.byDecade).toEqual({ "1990s": 3, "1970s": 1, "1980s": 1 });
    expect(r.all.byDecade.unknown).toBe(1);
    expect(r.quota).toEqual({
      idsPerDailyUnit: 1500,
      unitsPerDayFor30DayRefresh: 1,
      dailyUnitBudget: 8000,
      fitsBudget: true,
    });
  });

  it("streams a gzipped dump over HTTP and verifies the published checksum", async () => {
    const r = await countCatalog({ source: `${server.url}${DUMP}`, verify: true });
    expect(r.releasesScanned).toBe(8);
    expect(r.bytesRead).toBe(gz.length);
    expect(r.sha256).toBe(gzSha);
    expect(r.checksum).toEqual({ expected: gzSha, matches: true });
  });

  it("flags a checksum mismatch", async () => {
    const r = await countCatalog({
      source: `${server.url}bad/discogs_20261001_releases.xml.gz`,
      verify: true,
    });
    expect(r.checksum.matches).toBe(false);
  });

  it("fails clearly on HTTP errors", async () => {
    await expect(countCatalog({ source: `${server.url}missing.xml.gz` })).rejects.toThrow(
      /HTTP 404/,
    );
  });

  it("checks the quota arithmetic against the budget", async () => {
    const r = await countCatalog({ source: FIXTURE, dailyUnitBudget: 0 });
    expect(r.quota.fitsBudget).toBe(false);
  });
});
