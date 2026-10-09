// Integration: the archive's server logic (listing, Pro downloads, chops, crate limits).

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTestDatabase, type TestDatabase } from "@app/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

process.env.ASSET_STORE_DIR = mkdtempSync(join(tmpdir(), "archive-int-"));
process.env.FEATURE_CLEARED_LANE = "1";

const { addCrateAsset, assetDownload, crateAssets, listAssets, saveChops } = await import(
  "./archive"
);

let t: TestDatabase;
const FREE = "55555555-5555-4555-8555-555555555555";
const PRO = "66666666-6666-4666-8666-666666666666";
const ORIGIN = "http://localhost:3000/api/v1/archive";
let ready: string;
let held: string;

async function asset(slug: string, status: string): Promise<string> {
  const { rows } = await t.pool.query<{ id: string }>(
    `insert into assets (slug, artist, title, year, status, duration_s, bpm, camelot_key)
     values ($1, 'Example Band', $2, 1924, $3, 10, 96, '8A') returning id`,
    [slug, `Title ${slug}`, status],
  );
  const id = rows[0]?.id as string;
  await t.pool.query(
    `update assets set wav_key = $2, preview_key = $3, preview_type = 'audio/mpeg', peaks_key = $4 where id = $1`,
    [id, `cleared/${id}/master.wav`, `cleared/${id}/preview.mp3`, `cleared/${id}/peaks.json`],
  );
  await t.pool.query(
    `insert into asset_rights (asset_id, basis, source_url, recording_year, date_evidence)
     values ($1, 'us_pd', 'https://archive.org/details/x', 1924, '[{"kind":"discography","citation":"DAHR","url":null}]')`,
    [id],
  );
  return id;
}

beforeAll(async () => {
  t = await createTestDatabase();
  ready = await asset("ready-one", "ready");
  held = await asset("held-one", "held");
  await t.pool.query(
    "insert into subscriptions (user_id, plan, source) values ($1, 'pro', 'stripe')",
    [PRO],
  );
});

afterAll(async () => {
  await t?.drop();
});

describe("archive", () => {
  it("lists only ready recordings, with app-served URLs for a local store", async () => {
    const { assets, nextCursor } = await listAssets(t.pool, ORIGIN, {});
    expect(assets.map((a) => a.id)).toEqual([ready]);
    expect(nextCursor).toBeNull();
    expect(assets[0]?.previewUrl).toBe(
      `http://localhost:3000/api/v1/archive/files/cleared/${ready}/preview.mp3`,
    );
    expect(assets[0]?.rights).toMatchObject({
      basis: "us_pd",
      basisLabel: "US public domain (recording)",
    });
    expect((await listAssets(t.pool, ORIGIN, { q: "nothing like this" })).assets).toEqual([]);
  });

  it("gives Pro the WAV with its DAW name and sidecar, and refuses Free and unlisted recordings", async () => {
    await expect(assetDownload(t.pool, ORIGIN, FREE, ready, null)).rejects.toMatchObject({
      code: "pro_required",
    });
    await expect(assetDownload(t.pool, ORIGIN, PRO, held, null)).rejects.toMatchObject({
      code: "not_found",
    });
    const d = await assetDownload(t.pool, ORIGIN, PRO, ready, {
      index: 2,
      startSeconds: 1,
      endSeconds: 3,
    });
    expect(d.fileStem).toBe("Example Band - Title ready-one [96 BPM 8A] (chop 2)");
    expect(d.wavUrl).toMatch(/\/master\.wav$/);
    expect(d.sidecar).toMatchObject({
      file: `${d.fileStem}.wav`,
      chop: { index: 2 },
      rights: { basis: "us_pd" },
    });
  });

  it("normalises chop markers to the recording", async () => {
    expect(await saveChops(t.pool, FREE, ready, [5, 2, 2.004, 11, -1])).toEqual([2, 5]);
  });

  it("adds archive recordings to Pro crates once, within the crate size", async () => {
    const crate = (
      await t.pool.query<{ id: string }>(
        "insert into crates (user_id, name) values ($1, 'Mix') returning id",
        [PRO],
      )
    ).rows[0]?.id as string;
    expect((await addCrateAsset(t.pool, ORIGIN, PRO, crate, ready)).assets).toHaveLength(1);
    expect((await addCrateAsset(t.pool, ORIGIN, PRO, crate, ready)).assets).toHaveLength(1);
    await expect(addCrateAsset(t.pool, ORIGIN, FREE, crate, ready)).rejects.toMatchObject({
      code: "not_found",
    });

    // Free accounts have no crates to add to; a lapsed Pro crate can't grow.
    const lapsed = (
      await t.pool.query<{ id: string }>(
        "insert into crates (user_id, name) values ($1, 'Old') returning id",
        [FREE],
      )
    ).rows[0]?.id as string;
    await expect(addCrateAsset(t.pool, ORIGIN, FREE, lapsed, ready)).rejects.toMatchObject({
      code: "pro_required",
    });

    const full = (
      await t.pool.query<{ id: string }>(
        "insert into crates (user_id, name) values ($1, 'Full') returning id",
        [PRO],
      )
    ).rows[0]?.id as string;
    await t.pool.query(
      `insert into crate_items (crate_id, record_key, video_id, position)
       select $1, 'r:' || g, 'abcdefghijk', g from generate_series(1, 1000) g`,
      [full],
    );
    await expect(addCrateAsset(t.pool, ORIGIN, PRO, full, ready)).rejects.toMatchObject({
      code: "limit_reached",
    });
    expect((await crateAssets(t.pool, ORIGIN, PRO, full)).assets).toEqual([]);
  });
});
