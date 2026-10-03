// e2e:seed — a fresh database with a small catalog for Playwright: the hand-written fixture
// plus a generated dump, ingested through the real pipeline, then every video marked
// playable as if validation had run (no YouTube calls in tests).

import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPool } from "@app/db";
import { runMigrations } from "@app/db/migrate";
import pg from "pg";
import { refreshLatestCensus } from "../ingest/census";
import { runIngest } from "../ingest/run";
import { syncPlayable } from "../jobs/youtube-state";
import { generateDump } from "./dump-generate";

export async function e2eSeed(options: {
  adminUrl: string;
  database: string;
  releases: number;
  log?: (m: string) => void;
}) {
  const log = options.log ?? (() => undefined);
  const admin = new pg.Client({ connectionString: options.adminUrl });
  await admin.connect();
  try {
    await admin.query(`drop database if exists ${options.database} with (force)`);
    await admin.query(`create database ${options.database}`);
  } finally {
    await admin.end();
  }
  const u = new URL(options.adminUrl);
  u.pathname = `/${options.database}`;
  const url = u.toString();
  const pool = createPool(url, { max: 6 });
  try {
    await runMigrations(pool);
    const dir = await mkdtemp(join(tmpdir(), "crate-e2e-"));
    // Month 1: the generated dump with the hand-written fixture's releases spliced in.
    const generated = join(dir, "generated.xml");
    await generateDump({ releases: options.releases, out: generated, seed: 11 });
    const fixture = await readFile(
      new URL("../../../../fixtures/discogs/releases-small.xml", import.meta.url),
      "utf8",
    );
    const body = (await readFile(generated, "utf8")).replace("</releases>", "");
    // Offset generated IDs so they never collide with the fixture's.
    const shifted = body.replace(
      /<release id="(\d+)"/g,
      (_m, id: string) => `<release id="${Number(id) + 100000}"`,
    );
    const merged = `${shifted}${fixture.replace("<releases>", "")}`;
    const file = join(dir, "discogs_20261001_releases.xml");
    await writeFile(file, merged);
    const outcome = await runIngest(
      { pool, baseUrl: "http://127.0.0.1:9/", log },
      { file, allowUnverified: true },
    );
    log(JSON.stringify(outcome));
    // Pretend validation ran: most videos playable with stored YouTube data; a few not.
    await pool.query(
      `update yt_videos set status = case when video_id in ('LowTideDub9', 'CalleOcho_1') then 'not_embeddable' else 'playable' end,
              title = 'Video ' || video_id, duration_s = 240, view_count = (abs(hashtext(video_id)) % 50000),
              thumbnail_url = null, checked_at = now()`,
    );
    await syncPlayable(pool);
    await refreshLatestCensus(pool);
    await pool.query("update changelog_entries set draft = false, published_at = now()");
    const n = await pool.query<{ n: number }>(
      "select count(*)::int as n from record_videos where playable",
    );
    log(`Seeded ${options.database}: ${n.rows[0]?.n} playable record videos`);
    return { url, playable: n.rows[0]?.n ?? 0 };
  } finally {
    await pool.end();
  }
}
