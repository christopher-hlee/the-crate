// Integration: sitemap files split the playable records into keyset ranges.

import { type CopyValue, copyRows } from "@app/db";
import { createTestDatabase, type TestDatabase } from "@app/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { computeSitemapStarts, type SitemapLayout, sitemapRecordKeys } from "./seo";

let t: TestDatabase;

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

function row(key: string, video: string, playable: boolean): CopyValue[] {
  const id = Number(key.slice(2));
  return [key, video, id, "T", "A", ["Jazz"], [], ["Vinyl"], [], 1, id, playable, "2026-10-01"];
}

// 12 playable records (two with two videos each), plus one with no playable video.
const PLAYABLE = Array.from({ length: 12 }, (_, i) => `r:${100 + i}`);

beforeAll(async () => {
  t = await createTestDatabase();
  const rows = PLAYABLE.map((k, i) => row(k, `vid${String(i).padStart(8, "0")}`, true));
  rows.push(row("r:100", "vidextra0001", true), row("r:105", "vidextra0002", false));
  rows.push(row("r:999", "vidgone00001", false));
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

describe("sitemap files", () => {
  const layout: SitemapLayout = { first: 3, size: 4 };

  it("covers every playable record once, in order, without unplayable ones", async () => {
    const starts = await computeSitemapStarts(t.pool, layout);
    expect(starts).toEqual(["r:100", "r:103", "r:107", "r:111"]);
    const files = await Promise.all(
      starts.map((_, id) => sitemapRecordKeys(t.pool, starts, id, layout)),
    );
    expect(files.map((f) => f.length)).toEqual([3, 4, 4, 1]);
    expect(files.flat()).toEqual([...PLAYABLE].sort());
    expect(files.flat()).not.toContain("r:999");
  });

  it("returns nothing for a file past the end", async () => {
    const starts = await computeSitemapStarts(t.pool, layout);
    expect(await sitemapRecordKeys(t.pool, starts, starts.length, layout)).toEqual([]);
  });
});
