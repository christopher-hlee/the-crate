// bench:shuffle — loads a synthetic record_videos table at catalog scale and times the
// shuffle query four ways (spec Phase 0): no filter, one style, style plus decade, and a
// narrow combination. Client-side timings over a local socket, p50/p95/p99.

import type { Filters } from "@app/core";
import { RAND_KEY_MAX } from "@app/core";
import {
  buildCandidateListQuery,
  buildCountQuery,
  buildPickQuery,
  buildSeededQuery,
  CopyWriter,
  type Exclusions,
  runMigrations,
} from "@app/db";
import pg from "pg";
import {
  COUNTRY_WEIGHTS,
  FORMATS,
  GENRE_WEIGHTS,
  pick,
  pickWeighted,
  RARE_DESCRIPTIONS,
  type Rng,
  seededRng,
  stylesFor,
  videoId,
  year,
} from "../synthetic";

const COLUMNS = [
  "record_key",
  "video_id",
  "release_id",
  "title",
  "artist_display",
  "artist_ids",
  "label_id",
  "label_name",
  "catno",
  "year",
  "country",
  "genres",
  "styles",
  "format_names",
  "format_descriptions",
  "pressings",
  "deep_cut",
  "rand_key",
  "playable",
  "added_in_dump",
];

const BENCH_USER = "00000000-0000-4000-8000-00000000bead";

export type Scenario = { name: string; filters: Filters };

export const SCENARIOS: Scenario[] = [
  { name: "no filter", filters: {} },
  { name: "one style (House)", filters: { styles: ["House"] } },
  {
    name: "style + decade (Deep House, 1990s)",
    filters: { styles: ["Deep House"], yearFrom: 1990, yearTo: 1999 },
  },
  {
    name: "narrow (Boogaloo, US, 1965–1975, Vinyl)",
    filters: {
      styles: ["Boogaloo"],
      countries: ["US"],
      yearFrom: 1965,
      yearTo: 1975,
      formats: ["Vinyl"],
    },
  },
  {
    name: "near-empty (Boogaloo, Japan, 1970–1975, Cassette)",
    filters: {
      styles: ["Boogaloo"],
      countries: ["Japan"],
      yearFrom: 1970,
      yearTo: 1975,
      formats: ["Cassette"],
    },
  },
];

type Stats = { n: number; p50: number; p95: number; p99: number; max: number; mean: number };

function stats(samples: number[]): Stats {
  const s = [...samples].sort((a, b) => a - b);
  const q = (p: number) => s[Math.min(s.length - 1, Math.floor(p * s.length))] ?? 0;
  const r = (x: number) => Math.round(x * 100) / 100;
  return {
    n: s.length,
    p50: r(q(0.5)),
    p95: r(q(0.95)),
    p99: r(q(0.99)),
    max: r(s[s.length - 1] ?? 0),
    mean: r(s.reduce((a, b) => a + b, 0) / Math.max(1, s.length)),
  };
}

async function timed<T>(fn: () => Promise<T>): Promise<[number, T]> {
  const t0 = performance.now();
  const out = await fn();
  return [performance.now() - t0, out];
}

async function ensureDatabase(adminUrl: string, name: string): Promise<string> {
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  try {
    const exists = await admin.query("select 1 from pg_database where datname = $1", [name]);
    if (exists.rowCount === 0) await admin.query(`create database ${name}`);
  } finally {
    await admin.end();
  }
  const u = new URL(adminUrl);
  u.pathname = `/${name}`;
  return u.toString();
}

function* syntheticRows(target: number, rng: Rng): Generator<unknown[]> {
  let produced = 0;
  let record = 1;
  let release = 1;
  while (produced < target) {
    const genre = pickWeighted(rng, GENRE_WEIGHTS);
    const styles = stylesFor(rng, genre);
    const y = rng() < 0.04 ? null : year(rng);
    const country = rng() < 0.03 ? null : pickWeighted(rng, COUNTRY_WEIGHTS);
    const fmt = pickWeighted(rng, FORMATS);
    const descs = [pick(rng, fmt.descriptions)];
    if (rng() < 0.06) descs.push(pick(rng, RARE_DESCRIPTIONS));
    const hasMaster = rng() < 0.6;
    const key = hasMaster ? `m:${record}` : `r:${release}`;
    let pressings = 1;
    if (hasMaster) while (rng() < 0.55 && pressings < 60) pressings++;
    const label = 1 + Math.floor(rng() ** 2 * 400_000);
    const videos = pickWeighted(rng, [
      [1, 45],
      [2, 25],
      [3, 15],
      [4, 8],
      [5, 7],
    ] as const);
    for (let v = 0; v < videos && produced < target; v++) {
      produced++;
      yield [
        key,
        videoId(rng),
        release,
        `Record ${record}`,
        `Artist ${record % 500_000}`,
        [record % 500_000],
        label,
        `Label ${label}`,
        `CAT-${release}`,
        y,
        country,
        [genre],
        styles,
        [fmt.name],
        descs,
        pressings,
        Math.round(rng() * 1000) / 1000,
        Math.floor(rng() * RAND_KEY_MAX),
        rng() < 0.85,
        "2026-10-01",
      ];
    }
    record++;
    release += pressings;
  }
}

async function load(
  pool: pg.Pool,
  rows: number,
  seed: number,
  log: (s: string) => void,
): Promise<void> {
  const client = await pool.connect();
  try {
    const defs = await client.query<{ indexname: string; indexdef: string }>(
      "select indexname, indexdef from pg_indexes where tablename = 'record_videos' and indexname <> 'record_videos_pkey'",
    );
    await client.query("truncate record_videos, yt_videos, history");
    for (const d of defs.rows) await client.query(`drop index if exists ${d.indexname}`);
    const t0 = performance.now();
    const writer = await CopyWriter.open(client, "record_videos", COLUMNS);
    for (const row of syntheticRows(rows, seededRng(seed))) {
      await writer.write(row as never);
      if (writer.count % 1_000_000 === 0)
        log(`  loaded ${writer.count.toLocaleString("en-US")} rows`);
    }
    await writer.end();
    log(`  COPY done in ${((performance.now() - t0) / 1000).toFixed(1)} s; building indexes`);
    for (const d of defs.rows) await client.query(d.indexdef);
    // YouTube state for region exclusions and the views filter: 5% carry region rules.
    await client.query(`
      insert into yt_videos (video_id, dump_embed_flag, status, view_count, region_blocked, region_allowed, checked_at, first_seen_dump)
      select video_id, true, case when playable then 'playable' else 'unavailable' end,
        (random() * 2000000)::bigint,
        case when random() < 0.04 then array['DE'] end,
        case when random() < 0.01 then array['JP','KR'] end,
        now(), '2026-10-01'
      from record_videos
      on conflict do nothing`);
    // A signed-in Pro user with a full 1,000-play history.
    await client.query(
      `insert into history (user_id, played_at, record_key, video_id)
       select $1, now() - (n || ' minutes')::interval, record_key, video_id
       from (select record_key, video_id, row_number() over () as n from record_videos where playable limit 1000) s`,
      [BENCH_USER],
    );
    await client.query("analyze record_videos");
    await client.query("analyze yt_videos");
    await client.query("analyze history");
  } finally {
    client.release();
  }
}

export type BenchReport = {
  rows: number;
  playableShare: number;
  postgres: string;
  iterations: number;
  context: string;
  scenarios: {
    name: string;
    filters: Filters;
    matches: number;
    pick: Stats;
    pickSignedOut: Stats;
    wrapArounds: number;
    count: Stats;
    candidateList: Stats | null;
    seededFirst500: Stats;
    plan: string;
  }[];
};

export async function benchShuffle(options: {
  adminUrl: string;
  database: string;
  rows: number;
  iterations: number;
  reload: boolean;
  seed: number;
  log?: (s: string) => void;
}): Promise<BenchReport> {
  const log = options.log ?? (() => undefined);
  const url = await ensureDatabase(options.adminUrl, options.database);
  const pool = new pg.Pool({ connectionString: url, max: 4 });
  try {
    await runMigrations(pool);
    const current = Number(
      (await pool.query("select count(*) as n from record_videos")).rows[0]?.n ?? 0,
    );
    if (options.reload || current !== options.rows) {
      log(`Loading ${options.rows.toLocaleString("en-US")} synthetic rows…`);
      await load(pool, options.rows, options.seed, log);
    }
    const meta = await pool.query<{ v: string; share: number }>(
      "select version() as v, avg(playable::int)::float as share from record_videos",
    );
    const rng = seededRng(options.seed + 1);
    const sessionKeys = (
      await pool.query<{ record_key: string }>(
        "select record_key from record_videos tablesample system (0.1) limit 20",
      )
    ).rows.map((r) => r.record_key);
    const report: BenchReport = {
      rows: options.rows,
      playableShare: Math.round((meta.rows[0]?.share ?? 0) * 1000) / 1000,
      postgres: meta.rows[0]?.v ?? "unknown",
      iterations: options.iterations,
      context:
        "Signed-in user with 1,000 history rows, 20 session record keys and viewer country US; signed-out runs send 20 session keys and 100 seen IDs instead.",
      scenarios: [],
    };
    const seenIds = (
      await pool.query<{ video_id: string }>(
        "select video_id from record_videos tablesample system (0.1) limit 100",
      )
    ).rows.map((r) => r.video_id);

    for (const scenario of SCENARIOS) {
      log(`Scenario: ${scenario.name}`);
      const countQ = buildCountQuery(scenario.filters, { cap: 1_000_000_000 });
      const matches = Number(
        (await pool.query<{ n: number }>(countQ.text, countQ.values)).rows[0]?.n ?? 0,
      );
      const signedIn: Exclusions = {
        sessionRecordKeys: sessionKeys,
        userId: BENCH_USER,
        viewerCountry: "US",
      };
      const signedOut: Exclusions = {
        sessionRecordKeys: sessionKeys,
        clientSeenIds: seenIds,
        viewerCountry: "US",
      };
      const pickTimes: number[] = [];
      const pickOutTimes: number[] = [];
      let wraps = 0;
      const pickOnce = async (ctx: Exclusions) => {
        const q = buildPickQuery(scenario.filters, { ...ctx, r: Math.floor(rng() * RAND_KEY_MAX) });
        const res = await pool.query(q.text, q.values);
        if (res.rowCount === 0) {
          wraps++;
          const q0 = buildPickQuery(scenario.filters, { ...ctx, r: 0 });
          await pool.query(q0.text, q0.values);
        }
      };
      for (let i = 0; i < 20; i++) await pickOnce(signedIn); // warm-up
      for (let i = 0; i < options.iterations; i++) {
        pickTimes.push((await timed(() => pickOnce(signedIn)))[0]);
        pickOutTimes.push((await timed(() => pickOnce(signedOut)))[0]);
      }
      const capped = buildCountQuery(scenario.filters, { viewerCountry: "US" });
      const countTimes: number[] = [];
      for (let i = 0; i < Math.min(50, options.iterations); i++) {
        countTimes.push((await timed(() => pool.query(capped.text, capped.values)))[0]);
      }
      let candidateList: Stats | null = null;
      if (matches < 20_000) {
        const listQ = buildCandidateListQuery(scenario.filters, {
          limit: 20_000,
          viewerCountry: "US",
        });
        const listTimes: number[] = [];
        for (let i = 0; i < 20; i++)
          listTimes.push((await timed(() => pool.query(listQ.text, listQ.values)))[0]);
        candidateList = stats(listTimes);
      }
      const seededTimes: number[] = [];
      for (let i = 0; i < 5; i++) {
        const sq = buildSeededQuery(scenario.filters, { seed: 1000 + i, limit: 500 });
        seededTimes.push((await timed(() => pool.query(sq.text, sq.values)))[0]);
      }
      const explainQ = buildPickQuery(scenario.filters, {
        ...signedIn,
        r: Math.floor(RAND_KEY_MAX / 2),
      });
      const plan = (
        await pool.query<{ "QUERY PLAN": string }>(
          `explain (analyze, buffers, costs off) ${explainQ.text}`,
          explainQ.values,
        )
      ).rows
        .map((r) => r["QUERY PLAN"])
        .join("\n");
      report.scenarios.push({
        name: scenario.name,
        filters: scenario.filters,
        matches,
        pick: stats(pickTimes),
        pickSignedOut: stats(pickOutTimes),
        wrapArounds: wraps,
        count: stats(countTimes),
        candidateList,
        seededFirst500: stats(seededTimes),
        plan,
      });
    }
    return report;
  } finally {
    await pool.end();
  }
}
