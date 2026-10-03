# Decisions

Each entry records a choice that changes or fills in `docs/SPEC.md`. Newest last.
Entries are never edited after the fact; a later entry supersedes an earlier one.

## 1. Gates passed provisionally at the owner's request

The owner asked for the plans to be implemented end to end rather than one phase per
session. Each gate is passed provisionally with the defaults in the spec's "Open
decisions" table, and every gate item that needs the outside world (the live dump, the
YouTube key, Supabase, Stripe, the stores, a lawyer) is listed in `docs/PLAN.md` and the
phase reports as still owed. Nothing is launched or listed by this work.

## 2. TypeScript 6.0, not 7.0

TypeScript 7.0 (the native compiler) is `latest` on npm, but Next.js, drizzle-kit and Expo
still load the JavaScript compiler API, which 7.0 does not ship. The repo pins 6.0.x.
Revisit once those tools support 7.x.

## 3. Node 24 in CI and production, Node 22.12+ accepted locally

CI and the worker image use Node 24 LTS as specified. `engines` accepts 22.12 or later so
the code also runs in development containers that only have Node 22. No Node 24-only APIs
are used.

## 4. node-postgres everywhere

Drizzle, the COPY helpers (`pg-copy-streams`) and pg-boss all run on `pg`
(node-postgres), so there is one driver and one pool configuration.

## 5. Workspace packages ship TypeScript source

Internal packages point `exports` at `src/*.ts`. Next.js transpiles them
(`transpilePackages`), Metro and Vitest read them directly, and the worker is bundled with
esbuild for production. Only `packages/player-html` has a build step, because its page
script is bundled into an HTML string.

## 6. Shared pure helpers live in `packages/core`

YouTube URL → video ID extraction and the player error codes are needed by the worker
(dump parsing), the web app (link suggestions, player) and mobile (player), so they live in
`packages/core`. `packages/discogs` and `packages/youtube` re-export them.

## 7. Phase 0 benchmarks ran on a generated dump

The development sandbox's network policy blocks `data.discogs.com` and the S3 bucket
behind it, so `catalog:count` could not stream the newest dump from here. The command is
built and tested on fixtures, and the shuffle benchmarks ran on a generated catalog sized
from published Discogs totals. Running `catalog:count` on the live dump is listed as an
owner action in `docs/phase-0-report.md`.

## 8. Bookkeeping tables and columns beyond the data model

The spec's tables are all present as written. These additions carry state the spec
describes but gives no table for:

- `yt_quota_usage`: units spent per Pacific-time day, shared by every job that calls the
  Data API, plus an `exhausted` flag set on `quotaExceeded`.
- `video_reports`: player error reports. The web app writes them and the worker folds them
  into `yt_videos.error_reports` and rechecks, so the web app still writes user-facing
  tables only and never YouTube state.
- `account_deletions`: deletions whose external steps (Supabase auth user, billing) need a
  retry. User rows are deleted at request time; this row holds only the user ID until the
  retry succeeds.
- `rate_limits` and `pick_cache`: fixed-window counters and the narrow-filter and seeded
  caches, kept in Postgres so there is still no Redis.
- `record_videos.artist_ids` (GIN-indexed) for the Pro artist scope, `record_videos.tempo_source`
  for `ShufflePick.tempo.source`, and a `record_videos_label` index for the label scope.
- `subscriptions.stripe_customer_id` and `stripe_subscription_id`, `link_suggestions.reason`
  and `checked_at`, `crates.updated_at`, `ingest_runs.error`, `changelog_entries.created_at`.

## 9. Staging tables are derived from the live tables

`stg_releases` and `stg_record_videos` are created with `LIKE` from the live tables, and their
indexes are recreated from `pg_get_indexdef` after the bulk load. The Drizzle schema and its
migrations stay the single source of truth, a catalog migration flows into the next build
automatically, and the swap renames tables, constraints and indexes so live names never
drift. A rollback with `ingest:rollback` is only valid when no catalog migration ran since
the swap.
