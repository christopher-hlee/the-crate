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
