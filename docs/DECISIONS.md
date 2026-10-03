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

## 10. The checksum is verified before the build, and old_* survives failed runs

The spec lists "verify" after "build". The hash is known as soon as the stream ends, so the
ingest verifies right after staging and never builds from a bad download. Last month's `old_*`
tables are dropped inside the swap transaction, not at the start of the next run, so a failed
or rejected run never removes the ability to roll back.

## 11. The style census counts playable records, refreshed daily

The census counts records with at least one playable video, so the filter drawer's numbers
match what the shuffle can return. Before any video has been validated (the first ingest), it
counts every record and says so with `basis: "all"`. A daily `refresh_census` job recomputes
the newest dump's census as validation moves playability.

## 12. Player reports and link suggestions are rows, not web-enqueued jobs

The web app writes `video_reports` and `link_suggestions` rows; the worker's
`recheck_reported` and `validate_link_suggestions` jobs pick them up every 10 minutes. The web
app never needs a pg-boss connection, and a reported video is rechecked at most once an hour
however often it is reported.

## 13. A dev-only sign-in for local work and end-to-end tests

`AUTH_MODE=dev` signs a browser in as a made-up user through `/api/dev/session` (or a
`Bearer dev:<uuid>` token), so the app and its Playwright suite run without a Supabase project.
The web app refuses to start in this mode on Vercel (`VERCEL` set), and the route returns 404 in
every other mode. Production uses Supabase sessions: cookies on the web, Bearer tokens on mobile,
verified with `auth.getClaims()`.

## 14. Screens with a player use no overlays at all

Rule 3 forbids drawing over the player and making it or its ancestors `inert` or
`pointer-events: none`. Modal dialogs and floating menus (including Radix's) do both while open,
so screens with a player have none: the save-to-crate picker, notes and filters expand inline
in the page flow, notices render below the controls, and the header is not sticky. The
compliance specs check this after interactions, not only on load.

## 15. ShufflePick carries `thumbnailUrl`

The spec's `ShufflePick` gains a nullable `thumbnailUrl` from `yt_videos` (YouTube API data,
refreshed within 30 days) so clients can preload the next pick's thumbnail as player rule 7
describes. Saved-record lists show generated sleeves instead of thumbnails.

## 16. The bundle scan flags `AIza` followed by 30 or more key characters

Google API keys are `AIza` plus 35 characters. The compliance scan fails on `AIza` plus 30 or
more, so a truncated or mangled key fails too, without matching the bare four letters that can
occur inside unrelated base64.

## 17. Endpoints the API table implies but doesn't list

`POST /api/v1/billing/checkout` and `POST /api/v1/billing/portal` (Stripe Checkout and the
Customer Portal) and `GET /api/v1/daily` (the daily dig) are added. Seeded sequences
(`/crates/:id/sequence`, `/daily`) return full catalog items rather than bare keys so clients
can render a page without a second request, and `ShufflePick` gains `releaseId` because tempo
and key votes are keyed by (release, track position).

## 18. One `pro` entitlement across Stripe and the stores

Stripe webhooks and RevenueCat webhooks both write `subscriptions` through `mergeSubscription`:
an event from one source never ends an active Pro from another source that runs longer, and a
store cancellation keeps Pro until the paid period ends. RevenueCat's `app_user_id` is the
Supabase user ID (the app logs in to RevenueCat with it); anonymous IDs are ignored unless an
alias is a user ID. RevenueCat's own Stripe events are ignored because Stripe is handled
directly.

## 19. Tempo sources and community confidence

GetSongBPM rows carry confidence 0.8 and AcousticBrainz rows 0.5. Community estimates use the
median of listener votes (half and double time count as agreeing) with confidence
`0.3 + 0.15 × agreeing votes`, capped at 0.95, so four agreeing votes outrank GetSongBPM. A
voted key is used only once two votes agree. GetSongBPM requests are counted in `rate_limits`
under `svc:getsongbpm` per clock hour and stop at 2,500; a lookup that finds nothing is stored
with no BPM so it isn't repeated for 180 days. The job stays off until `FEATURE_GETSONGBPM` is
set at Gate 3.

## 20. YouTube playlist export is not built

The spec builds it only if the quota extension is granted. `FEATURE_PLAYLIST_EXPORT` exists and
stays off; nothing reads it yet.

## 21. NativeWind 4 on Tailwind 3 in the mobile app

NativeWind 4 is the stable release and runs on Tailwind CSS 3; the web app is on Tailwind 4.
The design tokens are repeated in `apps/mobile/tailwind.config.js` with the same names as the
web's CSS variables. Revisit when NativeWind 5 (Tailwind 4) is stable. Under pnpm the app
depends on `react-native-css-interop` directly so Metro can resolve NativeWind's JSX runtime.

## 22. Player bridge details

Both sides validate every message with zod (`zod/mini` inside the page, to keep the page script
small). Native code queues a `load` until the page says `ready`, and the page queues one until
the IFrame API is ready, so the first pick is never lost. While a video plays the page sends a
`state` message every second; native code counts those ticks toward the 5-second play log, so
paused or buffering time doesn't count. The page script is bundled to ES2022 for iOS 16 and
Android System WebView 110 or newer.

## 23. On mobile, Dig's player sits outside the scroll view

The spec asks for an IntersectionObserver before autoplay. On mobile the Dig and list screens
put the player above the scroll view, so whenever the screen is focused the whole player is on
screen and the 50% rule holds by construction. Playback still starts only on a tap or a swipe,
the first pick is cued, and the player pauses when the screen loses focus or the app leaves the
foreground. Gestures attach to the pick card below the player, never to the player.

## 24. Mobile exclusions are kept in memory

The session list and the signed-out seen list live in memory for the app's lifetime. The only
persistent store in the app is the keychain or keystore (for the session), which is meant for
secrets, not 200-entry lists. Signed-in users' seen list is their server-side history anyway.

## 25. Long-press saves to the last crate used

The first save opens the inline crate picker; after that a long-press on the pick card saves to
the crate used last in this session, with a success haptic.

## 26. Mobile billing is store-only

The apps sell Pro only through in-app purchase (RevenueCat), never link to Stripe Checkout, and
show "Restore purchases". A Pro bought on the web shows as Pro in the app through `/me`, with a
note that it is managed on the web.

## 27. CI exports the mobile bundles; Maestro runs on device builds

CI runs `expo export` for iOS and Android and scans the Hermes bundles for API keys. The Maestro
flows in `apps/mobile/.maestro` need a simulator or device build (EAS), so they run against
TestFlight and Play internal builds, which are owner actions at Gate 4.
