# Implementation plan

This plan turns `docs/SPEC.md` into work. It is also the progress tracker: tick a box
when the work is committed with `pnpm verify` green. A session that resumes work reads
this file first, then `docs/DECISIONS.md`.

The owner asked for the plans to be implemented end to end in one go, so gates are passed
provisionally using the defaults in the spec's "Open decisions" table. Anything that needs
the outside world (the live dump, a YouTube key, Supabase, Stripe, the stores, a lawyer)
is built and tested against fixtures, and listed under "Needs the owner" at each gate.

## Ground rules

- `.claude/rules/compliance.md` is binding. A task that seems to need breaking a rule stops.
- Pure logic lives in `packages/core` and is written test-first.
- Every boundary is validated with zod: HTTP, job payloads, WebView messages, external APIs.
- One logical change per commit, short imperative titles, `pnpm verify` green every commit.
- No code or fixtures from Digga or any other project. No Samplette names, copy or design.

## Architecture in one paragraph

`apps/worker` streams the monthly Discogs dump through `packages/discogs` (saxes over
zlib), COPYs slim facts and linked releases into `stg_*` tables, builds `stg_record_videos`
in SQL, and swaps it live in one transaction. It is the only process that calls YouTube
(`packages/youtube`, videos.list, 50 IDs per call, a Pacific-day unit budget kept in
Postgres) and the only one that writes catalog or YouTube-state tables. `apps/web`
(Next.js App Router) serves the UI and `/api/v1`; every handler validates its input against
the zod contracts in `packages/api-client` and builds catalog SQL only through the typed
filter builders in `packages/db`. `apps/mobile` (Expo) uses the same client and hosts the
player from `packages/player-html` in a WebView whose `baseUrl` is `https://` plus the app
ID. Video never passes through our servers.

## Phase 0: prove the catalog

- [x] Scaffold: pnpm workspaces, Turborepo, TypeScript 6 strict, Biome, Vitest, `pnpm verify`, CI.
- [x] `CLAUDE.md`, `.claude/rules/compliance.md`, `docs/{SPEC,DECISIONS,RUNBOOK}.md`, `docker-compose.yml`.
- [x] `packages/core` (test-first): text normalization, YouTube ID extraction, record keys and
      Discogs URLs, Discogs and ISO 8601 durations, artist display names, year parsing.
- [x] `packages/discogs`: dump discovery (HTML or S3 listing), CHECKSUM parsing, streaming
      release parser (every element optional, sub-tracks flattened), per-release video links.
      Hand-written fixtures under `fixtures/discogs/`.
- [x] `apps/worker` CLI `catalog:count <url|file>`: streams gzip or plain XML, hashes it,
      writes the JSON report (releases, linked releases, unique IDs, `embed="false"` share,
      counts by genre, style and decade, run time).
- [x] Synthetic dump generator for scale tests, since the live dump host is blocked here.
- [x] `packages/db`: Drizzle schema for every table in the data model, first migration,
      typed filter → SQL builders for the unseeded pick, count and seeded order.
- [x] `bench:shuffle`: loads N synthetic `record_videos` rows and records p50/p95 for no
      filter, one style, style plus decade, and a narrow combination.
- [x] `yt:sample`: validates a random sample of IDs (default 5,000) to estimate the playable share.
- [x] `docs/phase-0-report.md` with the numbers, the quota arithmetic and the open items.

Gate 1 (provisional): Free filters are genre, style, year, country and format, as in the spec.
Owed by the owner: the live `catalog:count` run, `yt:sample` with the API key, and `db:check`
on Supabase (see `docs/phase-0-report.md`).

## Phase 1: web app, Free tier

- [ ] Ingest end to end: discover → stream (hash + optional R2 multipart + parse) → COPY into
      `stg_release_facts`, `stg_releases`, `stg_release_videos` → build `stg_record_videos`
      (pressings, earliest year, country rule, unions, label sizes, deep-cut, track matches,
      carried `rand_key`, accepted suggestions, `playable` from `yt_videos`) → verify the
      checksum → swap with canonical index names → diff, census, changelog draft.
      `ingest:rollback` swaps `old_*` back.
- [ ] Fixture dump server (`DISCOGS_DUMPS_BASE_URL`) and an integration test that runs a
      fixture dump through stage, build, swap and diff, twice, checking carry-over.
- [ ] `packages/youtube`: videos.list client with injectable fetch, zod response schema,
      classification into statuses, quotaExceeded handling, recorded responses for tests.
- [ ] Jobs on pg-boss (singleton, rerunnable): `ingest`, `validate`, `recheck_reported`,
      `purge_yt_data`, `validate_link_suggestions`, `refresh_census`, `retry_account_deletions`.
- [ ] API: shuffle (narrow-filter cache, region, session, seen, history exclusions), records,
      styles, filters/count, plays, history, crates (+ items), changelog, me (GET, DELETE),
      video reports, link suggestions. Errors as `{error: {code, message}}`.
- [ ] Auth: Supabase cookies on web and Bearer tokens for mobile; a dev-only auth mode for
      local work and end-to-end tests that refuses to run in production.
- [ ] Rate limits in Postgres per IP or user, numbers in config. Sentry when a DSN is set.
- [ ] Dig screen: one compliant IFrame player, Shuffle, filter drawer (census counts, often
      tagged with, year histogram, country and format), record panel with generated sleeve,
      Discogs link and YouTube attribution, save to crate, shortcuts N, S, E and /.
- [ ] Crates (3 × 50 on Free), History (50), Changelog, Account (plan, deletion), Legal pages.
- [ ] Compliance tests in CI: one iframe, nothing on top, no inert or pointer-events none,
      ≥200×200 at 320 px wide, no `AIza` in bundles, no downloader in the lockfile, purge test,
      mobile `baseUrl`.
- [ ] Playwright end to end: shuffle, play with a stubbed IFrame API, save to crate.

Gate 2 (needs the owner): production ingest, a full validation pass, the rules review and
YouTube's API Compliance Audit.

## Phase 2: Pro on the web

- [ ] `subscriptions` gating; Stripe Checkout, Customer Portal and webhook; RevenueCat webhook.
- [ ] Pro filters: tempo range with half and double time, compatible Camelot keys, max views
      (YouTube's count, filter only, never a score), deep-cut, format notes, label and artist.
- [ ] `enrich_tempo` behind `FEATURE_GETSONGBPM` (2,500 requests an hour), `pick_audio_features`,
      community votes from tap tempo and key, tempo coverage per filter set and crate.
- [ ] AcousticBrainz spike write-up and an importer for a MusicBrainz-linked mapping file.
- [ ] Seeded crates and sequence paging (first 500 cached for 24 h), share links, daily dig,
      timestamped notes, 1,000-play history, crate sheet export (CSV, JSON, links only).
- [ ] Playwright: Pro gating and export.

Gate 3 (needs the owner): GetSongBPM's answer on caching. The flag stays off until then.

## Phase 3: mobile

- [ ] `packages/player-html`: the IFrame page as an HTML string, zod-validated bridge
      (`ready`, `load`, `play`, `pause`, `seek`, `state`, `error`), `playerBaseUrl(appId)`.
- [ ] Expo app: Dig, Crates, History, Account on `@app/api-client`; WebView with `baseUrl`,
      `allowsInlineMediaPlayback`; pause on background; swipe, long-press, haptics; offline state.
- [ ] RevenueCat purchases on the shared `pro` entitlement. Store listing copy and review notes.
- [ ] Maestro flows: launch, shuffle, save, sandbox purchase.

Gate 4 (needs the owner): App Review and Google Play review.

## Phase 4: cleared lane (behind `FEATURE_CLEARED_LANE`, unlisted)

- [ ] Rights rules in `packages/core` (US ≤ 1925 recordings with date evidence, CC0, CC BY,
      CC BY-SA, signed licence; never NC or ND), rights records per asset.
- [ ] Asset pipeline into R2: transcode, waveform peaks, tempo and key analysis hook.
- [ ] Cleared player with waveform and chop markers, WAV export, DAW folder export
      (`showDirectoryPicker`, ZIP fallback, `Artist - Title [96 BPM 8A].wav` plus JSON sidecar).
- [ ] `pd_rollover` job for January 1.

Gate before launch (needs the owner): the lawyer's review of the rights rules.
