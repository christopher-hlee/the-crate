# Phase 0 report: prove the catalog

October 3, 2026. Raw numbers: `docs/phase-0/shuffle-bench-8m.json` (benchmark, with query
plans) and `docs/phase-0/catalog-count-synthetic-300k.json` (parser run).

## Summary

| Phase 0 item | Status |
| --- | --- |
| Monorepo scaffold, `pnpm verify`, CI | Done |
| `CLAUDE.md`, `.claude/rules/compliance.md`, docker-compose Postgres 16 | Done |
| `packages/discogs`: discovery, streaming parser, link extraction, fixtures | Done |
| `catalog:count` CLI (URL or file, JSON report) | Done, tested on fixtures and a 300k-release generated dump |
| Run it on the newest dump | **Owner action**: the build sandbox's network policy blocks `data.discogs.com` |
| Shuffle benchmark, four ways, p50/p95 | Done on an 8M-row generated catalog (plus a fifth, near-empty case) |
| Validate 5,000 sampled IDs | **Owner action**: `yt:sample` is built and tested on recorded responses; it needs `YOUTUBE_API_KEY` |
| `hashtextextended` on the managed Postgres | Confirmed on Postgres 16.14; **owner action** to run `db:check` on the Supabase project |

**Recommendation:** go, on the condition that the live `catalog:count` run keeps unique video IDs
under 12 million (the most the 8,000-unit budget can refresh every 30 days). Every common filter
picks in under 5 ms at p95, far under the 150 ms target, and narrow filters are covered by the
cached path the spec already plans for. Set `NARROW_FILTER_THRESHOLD` to **5,000**.

## catalog:count

`pnpm catalog:count <url|file> [--verify] --out reports/count.json` streams the dump once,
hashes it, and reports releases scanned, releases with YouTube links, unique video IDs, the
`embed="false"` share, counts by genre, style and decade, parse errors, run time and the quota
arithmetic. `--verify` fetches `discogs_YYYYMMDD_CHECKSUM.txt` next to the dump and compares.

On the hand-written fixture (`fixtures/discogs/releases-small.xml`) every count matches a hand
count: 8 releases, 5 with YouTube links, 9 links, 8 unique IDs, 1 `embed="false"` (12.5%), 4
records, 3 non-YouTube links dropped.

On a 300,000-release generated dump (31.5 MB gzipped, 374 MB of XML), the run took **19.5 s**:
about **19 MB/s of XML, or 15,400 releases a second**, single-threaded. saxes alone accounts for
about 10 s of that; the rest is element handling, link extraction and counting. The live dump
holds about 19 million releases with more elements per release (credits, companies, identifiers,
notes) that the parser skips but still has to read, so plan for **45 to 75 minutes** per monthly
run. That fits the worker on Fly.io as planned, not a serverless function.

## Shuffle benchmark

`pnpm worker bench:shuffle --rows 8000000 --iterations 500` loads a generated `record_videos`
table through COPY, rebuilds the production indexes, adds `yt_videos` rows (4% blocked in DE, 1%
allowed only in JP and KR) and a signed-in user with a full 1,000-play history, then times the
unseeded pick built by `packages/db`. Each signed-in pick also excludes 20 session record keys,
the user's history and videos blocked in the viewer's country (US). Signed-out picks exclude 20
session keys and 100 client-seen IDs instead. Timings are client-side, over a local connection,
on 4 vCPUs and 15 GB of RAM with the data in cache. 85% of the 8,000,000 rows are playable.

| Filter set | Matches | Pick p50 | Pick p95 | Pick p99 | Signed-out p95 |
| --- | ---: | ---: | ---: | ---: | ---: |
| No filter | 6,799,131 | 1.0 ms | 1.6 ms | 2.5 ms | 1.5 ms |
| One style (House) | 258,011 | 1.1 ms | 1.9 ms | 2.6 ms | 1.7 ms |
| Style + decade (Deep House, 1990s) | 49,572 | 1.7 ms | 4.1 ms | 6.1 ms | 3.8 ms |
| Narrow (Boogaloo, US, 1965–75, Vinyl) | 1,107 | 30 ms | 141 ms | 183 ms | 143 ms |
| Near-empty (Boogaloo, Japan, 1970–75, Cassette) | 24 | 140 ms | 174 ms | 204 ms | 174 ms |

What the plans show (`EXPLAIN ANALYZE` in the JSON):

- **Common filters** use the partial `record_videos_shuffle` index: seek to `rand_key >= r`,
  filter rows until one matches, then probe `yt_videos` and `history` by primary key. Under a
  millisecond in the database.
- **Narrow filters** make that seek walk thousands of rows (about total ÷ matches) before a hit, so
  p95 grows as matches shrink: 141 ms at 1,107 matches. At 24 matches the planner switches to a
  bitmap AND across the style, country and year indexes and sorts: a flat ~140 ms.
- **Proposed `NARROW_FILTER_THRESHOLD` = 5,000.** Seek cost scales with total ÷ matches, so at
  5,000 matches p95 should sit near 30 ms. Below it, the spec's cached path applies: fetch every
  matching `(record_key, video_id)` once (159–229 ms here), cache it for an hour under the filter
  hash and viewer country, and pick uniformly from it, which costs one primary-key read per pick.
  Whether a filter set is narrow is itself cached with the list, so the capped count runs once an
  hour per filter set, not per pick.

Other numbers that shape Phase 1:

- **Capped counts** (`limit 10001`, shown as "10,000+") took 157–472 ms at p95 with the region
  clause, because each counted row probes `yt_videos`. Without it, the unfiltered count takes
  2.7 ms and a one-style count 78 ms. Phase 1 therefore takes style and year counts from the style
  census, as the spec says, and runs capped counts for combined filters without the region
  clause. The count is an estimate shown in the drawer, so leaving out region blocks is fine.
- **Seeded order, first 500 picks:** 1.2–1.6 s for broad filter sets, because every matching row
  is hashed and sorted, and 136–223 ms for narrow ones. The spec's 24-hour cache of the first 500
  picks per filter hash and seed covers this. The daily dig computes once a day.

Caveats: the catalog is generated (genre mix, decades, country weights, pressings and link
counts are rough shapes of Discogs, not measurements), the machine is not the production
database, and client-side timings include a local round trip but no network. Supabase adds the
network round trip from Vercel, which is outside the "in the database" target. Rerun the
benchmark on the production instance after the first real ingest.

## Quota arithmetic

Refreshing every video within 30 days at 50 IDs per unit needs **unique IDs ÷ 1,500 units a
day**. With the default `YT_DAILY_UNIT_BUDGET` of 8,000:

| Unique video IDs | Units a day | Fits 8,000? |
| ---: | ---: | :---: |
| 4,000,000 | 2,667 | Yes |
| 8,000,000 | 5,334 | Yes |
| 12,000,000 | 8,000 | Exactly |
| 15,000,000 | 10,000 | No: needs the quota extension |

The generated dump has 0.43 unique IDs per release; at that rate 19 million releases would hold
about 8.2 million IDs, or roughly 5,460 units a day, which fits. The real figure comes from the live
`catalog:count` run. Until the quota extension, validation spends the budget evenly across the
Pacific day (`unitsForThisRun`), unchecked IDs first, and the purge job keeps the 30-day rule even
when validation falls behind: stale videos simply leave the shuffle until rechecked.

## Playable share

`pnpm worker yt:sample --from-dump <url|file> --size 5000 --out reports/yt-sample.json` takes a
uniform sample of distinct video IDs from a dump (a bottom-k hash sketch, so memory stays flat),
spends exactly 100 units on videos.list, and reports the share per status with a 95% Wilson
interval, the region-restricted share and the Made for Kids share. It runs against recorded
responses in tests. The benchmark assumed 85% playable; replace that with the measured share.

## hashtextextended

Confirmed on Postgres 16.14: equal for the same seed, different across seeds. The seeded-order
integration test checks stability for one seed and variation across seeds. To confirm on the
chosen managed database, run `DIRECT_DATABASE_URL=<supabase direct URL> pnpm worker db:check`.

## Owner actions for Gate 1

1. Run `pnpm catalog:count https://data.discogs.com/... --verify --out reports/count.json` from a
   machine that can reach data.discogs.com, or allow `data.discogs.com` and
   `discogs-data-dumps.s3.us-west-2.amazonaws.com` in this environment's network settings.
   Check unique IDs ÷ 1,500 against the budget.
2. Run `pnpm worker yt:sample --from-dump <same URL> --out reports/yt-sample.json` with
   `YOUTUBE_API_KEY` set (100 units).
3. Run `pnpm worker db:check` against the Supabase project.
4. Decide go or no-go, and the Free filters. Until then the build uses the spec's defaults:
   genre, style, year, country and format.
