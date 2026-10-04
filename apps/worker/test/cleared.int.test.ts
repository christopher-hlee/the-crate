import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { localAssetStore } from "@app/assets";
import { decodeWav, encodeWav } from "@app/core";
import { createTestDatabase, type TestDatabase } from "@app/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Manifest, ManifestSchema } from "../src/cleared/manifest";
import { importManifest } from "../src/cleared/pipeline";
import { recheckRights, runPdRollover } from "../src/cleared/rules";

let t: TestDatabase;
let dir: string;
const log = () => undefined;

function tone(seconds: number, hz: number, sampleRate = 22050): Uint8Array {
  const n = Math.round(seconds * sampleRate);
  return encodeWav({
    sampleRate,
    channels: [
      Float32Array.from(
        { length: n },
        (_, i) => 0.4 * Math.sin((2 * Math.PI * hz * i) / sampleRate),
      ),
    ],
  });
}

const evidence = [
  { kind: "discography" as const, citation: "DAHR matrix B-29999, recorded 1924", url: null },
];

function manifest(): Manifest {
  return ManifestSchema.parse({
    assets: [
      {
        slug: "pd-1924",
        artist: "Example Jazz Band",
        title: "Example Stomp",
        year: 1924,
        audio: "pd-1924.wav",
        bpm: 104,
        camelotKey: "8B",
        rights: {
          basis: "us_pd",
          sourceUrl: "https://archive.org/details/78_example",
          licenseUrl: null,
          recordingYear: 1924,
          dateEvidence: evidence,
          attribution: null,
          licenseRef: null,
          licenseExpiresAt: null,
        },
      },
      {
        slug: "pd-1930",
        artist: "Later Orchestra",
        title: "Not Yet",
        year: 1930,
        audio: "pd-1930.wav",
        rights: {
          basis: "us_pd",
          sourceUrl: "https://archive.org/details/78_later",
          licenseUrl: null,
          recordingYear: 1930,
          dateEvidence: evidence,
          attribution: null,
          licenseRef: null,
          licenseExpiresAt: null,
        },
      },
      {
        slug: "nc-track",
        artist: "Someone",
        title: "Non-commercial",
        audio: "missing.wav",
        rights: {
          basis: "cc_by",
          sourceUrl: "https://example.org/track",
          licenseUrl: "https://creativecommons.org/licenses/by-nc/4.0/",
          recordingYear: null,
          dateEvidence: [],
          attribution: "Someone",
          licenseRef: null,
          licenseExpiresAt: null,
        },
      },
    ],
  });
}

beforeAll(async () => {
  t = await createTestDatabase();
  dir = mkdtempSync(join(tmpdir(), "cleared-test-"));
  writeFileSync(join(dir, "pd-1924.wav"), tone(1.5, 440));
  writeFileSync(join(dir, "pd-1930.wav"), tone(1, 220));
});

afterAll(async () => {
  await t?.drop();
});

describe("cleared import", () => {
  it("checks rights first, processes what passes or is held, and never fetches a rejected asset", async () => {
    const store = localAssetStore(join(dir, "store"));
    const now = new Date("2026-10-04T12:00:00Z");
    const results = await importManifest(
      { pool: t.pool, store, tools: { ffmpeg: null, essentia: null }, log },
      manifest(),
      { baseDir: dir, now },
    );
    expect(results.map((r) => [r.slug, r.status])).toEqual([
      ["pd-1924", "ready"],
      ["pd-1930", "held"],
      ["nc-track", "rejected"],
    ]);
    expect(results[2]?.reason).toMatch(/NC and ND/);

    const { rows } = await t.pool.query(
      "select slug, status, wav_key, preview_key, preview_type, peaks_key, duration_s, sample_rate, channels, bpm, camelot_key from assets order by slug",
    );
    const ready = rows.find((r) => r.slug === "pd-1924");
    expect(ready).toMatchObject({
      status: "ready",
      preview_type: "audio/wav",
      sample_rate: 22050,
      channels: 1,
      bpm: 104,
      camelot_key: "8B",
    });
    expect(ready.duration_s).toBeCloseTo(1.5, 2);
    const wav = await store.get(ready.wav_key);
    expect(wav && decodeWav(wav).channels[0]?.length).toBe(33075);
    const peaks = JSON.parse(
      new TextDecoder().decode((await store.get(ready.peaks_key)) ?? new Uint8Array()),
    );
    expect(peaks.peaks.length).toBe(4000);
    expect(rows.find((r) => r.slug === "nc-track").wav_key).toBeNull();

    const rules = await t.pool.query("select us_pd_cutoff_year from rights_rules");
    expect(rules.rows[0].us_pd_cutoff_year).toBe(1925);
    const rights = await t.pool.query(
      "select basis, rules_cutoff_year, problems from asset_rights order by basis",
    );
    expect(rights.rows).toHaveLength(3);

    // Re-importing an unchanged file doesn't rewrite it.
    const again = await importManifest(
      { pool: t.pool, store, tools: { ffmpeg: null, essentia: null }, log },
      manifest(),
      { baseDir: dir, now },
    );
    expect(again.map((r) => r.status)).toEqual(["ready", "held", "rejected"]);
    const count = await t.pool.query("select count(*)::int as n from assets");
    expect(count.rows[0].n).toBe(3);

    // Withdrawn by hand: a plain re-import leaves it down.
    await t.pool.query("update assets set status = 'withdrawn' where slug = 'pd-1924'");
    const third = await importManifest(
      { pool: t.pool, store, tools: { ffmpeg: null, essentia: null }, log },
      manifest(),
      { baseDir: dir, now },
    );
    expect(third[0]?.status).toBe("withdrawn");
    await t.pool.query("update assets set status = 'ready' where slug = 'pd-1924'");
  });

  it("releases held recordings when their year enters the public domain, and drafts a changelog entry", async () => {
    expect(await runPdRollover(t.pool, new Date("2026-12-31T23:00:00Z"))).toMatchObject({
      advanced: null,
      released: 0,
    });
    const r = await runPdRollover(t.pool, new Date("2031-01-01T00:10:00Z"));
    expect(r).toMatchObject({ cutoff: 1930, advanced: { from: 1925, to: 1930 }, released: 1 });
    const held = await t.pool.query("select status from assets where slug = 'pd-1930'");
    expect(held.rows[0].status).toBe("ready");
    const log = await t.pool.query(
      "select title, draft from changelog_entries where kind = 'data'",
    );
    expect(log.rows).toEqual([
      { title: "Recordings from 1926–1930 are now in the US public domain", draft: true },
    ]);
  });

  it("leaves a cutoff held back by hand alone, and pulls assets whose licence expired", async () => {
    await t.pool.query("update rights_rules set us_pd_cutoff_year = 1924, auto_advance = false");
    const r = await runPdRollover(t.pool, new Date("2032-01-01T00:10:00Z"));
    expect(r.advanced).toBeNull();
    expect(r.pulled).toBe(1);
    const rows = await t.pool.query(
      "select slug, status from assets where slug like 'pd-%' order by slug",
    );
    expect(rows.rows).toEqual([
      { slug: "pd-1924", status: "ready" },
      { slug: "pd-1930", status: "held" },
    ]);

    const id = (await t.pool.query("select id from assets where slug = 'pd-1924'")).rows[0].id;
    await t.pool.query(
      "update asset_rights set basis = 'signed_license', license_ref = 'LIC-1', license_expires_at = '2032-06-01' where asset_id = $1",
      [id],
    );
    expect((await recheckRights(t.pool, new Date("2032-05-01T00:00:00Z"))).pulled).toBe(0);
    expect((await recheckRights(t.pool, new Date("2032-06-02T00:00:00Z"))).pulled).toBe(1);
    const after = await t.pool.query("select status, status_reason from assets where id = $1", [
      id,
    ]);
    expect(after.rows[0]).toMatchObject({
      status: "rejected",
      status_reason: "The signed licence has expired.",
    });
  });
});

const hasFfmpeg = (() => {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

describe.skipIf(!hasFfmpeg)("cleared import with ffmpeg", () => {
  it("makes a 44.1 kHz 16-bit master and an MP3 preview", async () => {
    const store = localAssetStore(join(dir, "store-ffmpeg"));
    const m = ManifestSchema.parse({
      assets: [{ ...manifest().assets[0], slug: "pd-1924-ffmpeg" }],
    });
    const [result] = await importManifest(
      { pool: t.pool, store, tools: { ffmpeg: "ffmpeg", essentia: null }, log },
      m,
      { baseDir: dir, now: new Date("2026-10-04T12:00:00Z") },
    );
    expect(result?.status).toBe("ready");
    const row = (
      await t.pool.query(
        "select wav_key, preview_key, preview_type, sample_rate from assets where slug = 'pd-1924-ffmpeg'",
      )
    ).rows[0];
    expect(row).toMatchObject({ preview_type: "audio/mpeg", sample_rate: 44100 });
    expect(row.preview_key).toMatch(/preview\.mp3$/);
    const preview = await store.get(row.preview_key);
    // An ID3 tag or an MPEG frame sync.
    expect(
      new TextDecoder().decode(preview?.slice(0, 3)) === "ID3" ||
        (preview?.[0] === 0xff && ((preview?.[1] ?? 0) & 0xe0) === 0xe0),
    ).toBe(true);
  });
});
