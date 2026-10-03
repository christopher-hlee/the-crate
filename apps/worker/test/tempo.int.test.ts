// Integration: tempo enrichment, community votes and copying the best tempo onto the catalog.

import { createTestDatabase, type TestDatabase } from "@app/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  reserveGetSongBpm,
  runEnrichTempo,
  runPickAudioFeatures,
  tempoCoverage,
} from "../src/tempo/jobs";

let t: TestDatabase;

beforeAll(async () => {
  t = await createTestDatabase();
  await t.pool.query(`
    insert into releases (id, record_key, title, artists, artist_display, labels, genres, styles, formats, tracklist)
    values (10, 'r:10', 'Record', '[]', 'Marlo Venn', '[]', '{}', '{House}', '[]',
            '[{"position":"A1","title":"Night Ferry","duration_s":300,"artists":[]}]')`);
  await t.pool.query(`
    insert into record_videos (record_key, video_id, release_id, track_position, track_title, title, artist_display,
      genres, styles, format_names, format_descriptions, pressings, rand_key, playable, added_in_dump)
    values ('r:10', 'vid00000010', 10, 'A1', 'Night Ferry', 'Record', 'Marlo Venn', '{Electronic}', '{House}',
            '{Vinyl}', '{LP}', 1, 1, true, '2026-10-01'),
           ('r:11', 'vid00000011', 11, null, null, 'Other', 'X', '{Jazz}', '{Fusion}', '{CD}', '{}', 1, 2, true, '2026-10-01')`);
});

afterAll(async () => {
  await t?.drop();
});

describe("enrich_tempo", () => {
  it("does nothing while the GetSongBPM flag is off", async () => {
    expect(await runEnrichTempo(t.pool, { enabled: false, apiKey: "k" })).toMatchObject({
      looked: 0,
      skipped: expect.any(String),
    });
  });

  it("looks up untempo'd tracks, stores the result and copies it to the catalog", async () => {
    const urls: string[] = [];
    const res = await runEnrichTempo(t.pool, {
      enabled: true,
      apiKey: "k",
      fetch: async (url) => {
        urls.push(url);
        return {
          ok: true,
          status: 200,
          json: async () => ({
            search: [
              { title: "Night Ferry", tempo: "123", key_of: "Am", artist: { name: "Marlo Venn" } },
            ],
          }),
        };
      },
    });
    expect(res).toEqual({ looked: 1, found: 1 });
    expect(urls).toHaveLength(1);
    const [rv] = (
      await t.pool.query(
        "select bpm, camelot_key, tempo_source from record_videos where video_id = 'vid00000010'",
      )
    ).rows;
    expect(rv).toEqual({ bpm: 123, camelot_key: "8A", tempo_source: "getsongbpm" });
    // Already enriched: nothing left to look up.
    expect(
      (
        await runEnrichTempo(t.pool, {
          enabled: true,
          apiKey: "k",
          fetch: async () => {
            throw new Error("no");
          },
        })
      ).looked,
    ).toBe(0);
  });

  it("caps requests at 2,500 an hour", async () => {
    await t.pool.query(
      "insert into rate_limits (key, window_start, count) values ('svc:getsongbpm', date_trunc('hour', now()), 2500) on conflict (key, window_start) do update set count = 2500",
    );
    expect(await reserveGetSongBpm(t.pool)).toBe(false);
  });
});

describe("pick_audio_features", () => {
  it("lets enough agreeing community votes outrank GetSongBPM", async () => {
    for (let i = 0; i < 4; i++) {
      await t.pool.query(
        "insert into tempo_votes (user_id, release_id, track_position, bpm, camelot_key) values ($1, 10, 'A1', $2, '9A')",
        [`00000000-0000-4000-8000-00000000000${i}`, 125 + (i % 2)],
      );
    }
    const res = await runPickAudioFeatures(t.pool);
    expect(res.community).toBe(1);
    const [rv] = (
      await t.pool.query(
        "select bpm, camelot_key, tempo_source from record_videos where video_id = 'vid00000010'",
      )
    ).rows;
    expect(rv).toMatchObject({ tempo_source: "community", camelot_key: "9A" });
    expect(rv?.bpm).toBeCloseTo(125.5);
  });

  it("measures tempo coverage per style", async () => {
    const c = await tempoCoverage(t.pool);
    expect(c.overall).toEqual({ records: 2, withTempo: 1, share: 0.5 });
    expect(c.byStyle.find((s) => s.style === "House")).toEqual({
      style: "House",
      records: 1,
      withTempo: 1,
      share: 1,
    });
  });
});
