# the-crate

A web and mobile app for digging through records at random. Discogs data (the monthly
CC0 dump) decides what plays; YouTube's official IFrame player plays it. Users set filters,
shuffle, listen, and save records to crates. Pro sells tools (filters, notes, export),
never listening. The working name is undecided: code uses the `APP_NAME` constant from
`@app/core` and the `@app/*` package scope.

The full spec is `docs/SPEC.md`. Read the section you are working on; don't load it whole.
Progress lives in `docs/PLAN.md` (checkboxes). Spec changes go in `docs/DECISIONS.md`,
one numbered entry each. Operations live in `docs/RUNBOOK.md`.

The rules in `.claude/rules/compliance.md` are non-negotiable. If a task seems to need
breaking one, stop and ask. Never work around one.

## Layout

```text
apps/web          Next.js App Router: UI and /api/v1 route handlers (writes user tables only)
apps/worker       Node CLI and pg-boss jobs: ingest, validate, purge, enrich (only YouTube caller,
                  only catalog writer)
apps/mobile       Expo app; YouTube player in a WebView from packages/player-html
packages/core     Pure domain logic. Imports nothing from Node, React or React Native
packages/db       Drizzle schema, SQL migrations, shuffle SQL builders, COPY helpers
packages/discogs  Dump discovery, checksum, streaming release parser, link extraction
packages/youtube  videos.list client, quota accounting, status classification
packages/api-client  zod contracts and the typed client shared by web and mobile
packages/player-html The WebView player page and its typed message protocol
fixtures/         Hand-written Discogs XML and recorded YouTube responses (never copied)
```

Apps depend on packages, never the reverse. Packages are consumed as TypeScript source
(`exports` points at `src/`), so there is no package build step except `player-html`.

## Commands

```bash
pnpm install
pnpm verify                  # Biome, typecheck, unit + integration tests, build, compliance
pnpm test                    # unit + integration tests (needs Postgres, see below)
pnpm fix                     # Biome autofix and format
pnpm db:up                   # docker compose Postgres 16 on localhost:5433
pnpm db:migrate              # apply migrations to DATABASE_URL
pnpm worker <command>        # worker CLI, e.g. `pnpm worker catalog:count fixtures/discogs/small.xml`
pnpm --filter @app/web dev   # web app on http://localhost:3000
pnpm --filter @app/web e2e   # Playwright end-to-end and compliance specs
```

Postgres: `postgres://crate:crate@localhost:5433/crate`. Integration tests create a fresh
database per file from `TEST_DATABASE_URL` (default
`postgres://crate:crate@localhost:5433/postgres`) and drop it afterwards.

## Conventions

- TypeScript 6, strict, no `any`, `noUncheckedIndexedAccess`. Biome formats and lints.
- zod validates every boundary: HTTP requests, job payloads, WebView messages, external APIs.
- Pure logic goes in `packages/core`, test-first: parsing helpers, link extraction,
  normalization, track matching, Camelot math, quota budgeting, plan limits, rights rules.
- Catalog SQL is built only from typed filter objects in `packages/db`. User input only ever
  goes in as parameters.
- Plan limits and rate limits live in `packages/core/src/plans.ts` and `config.ts`.
  Feature flags (`FEATURE_GETSONGBPM`, `FEATURE_PLAYLIST_EXPORT`, `FEATURE_CLEARED_LANE`,
  `FEATURE_ADS`) live in `packages/core/src/flags.ts`.
- Migrations only move forward. Never edit one that has been applied; add a new one with
  `pnpm --filter @app/db generate` or a hand-written SQL file.
- Catalog tables (`releases`, `record_videos`) are rebuilt monthly and swapped. User tables
  hold keys only, with no foreign keys into catalog tables.
- YouTube API data in `yt_videos` is refreshed or nulled within 30 days and never feeds a
  score. View counts are a filter only.
- No live YouTube or Discogs calls in tests: use `fixtures/` and the fixture dump server.
- Commits: one logical change each, short imperative title, `pnpm verify` green.
- Don't copy code from Digga or any other project. Don't use Samplette's name or design.

## Player rules (web and mobile)

One player per screen, created once from `https://www.youtube.com/iframe_api` and reused
with `loadVideoById`/`cueVideoById`. Only `playsinline`, `controls`, `rel: 0` and `origin`.
16:9, at least 480×270 on desktop, full width on phones, never under 200×200. Nothing over
the iframe, no `inert`, no `pointer-events: none`. Autoplay only when more than half of it is
visible. Report error codes 2, 5, 100, 101, 150 and skip. Log a play after 5 seconds.
The compliance specs in `apps/web/e2e/compliance.spec.ts` enforce this in CI.

## Environment

See `.env.example` in each app. Secrets (`YOUTUBE_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
Stripe and RevenueCat secrets, R2 keys) never reach a client bundle; CI scans the built
bundles for `AIza`. Local development without Supabase uses `AUTH_MODE=dev`, which refuses
to start in production.
