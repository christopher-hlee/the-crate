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

## 28. The cleared lane is called "Archive" in the product

Rule 20 forbids marketing anything as "cleared" before the lawyer's review, so users see an
unlisted "Archive (preview)" at `/archive` (no navigation link, `noindex`, 404 unless
`FEATURE_CLEARED_LANE` is on). Code and docs keep the spec's name, "cleared lane".

## 29. Rights rules as written in `packages/core/src/rights.ts`

- **US public domain** follows 17 U.S.C. § 1401 as amended by the Music Modernization Act:
  pre-1923 recordings from 2022, then 100 years after publication for 1923–1946 (so 1925 is the
  newest public-domain year in 2026, matching the spec), 110 years for 1947–1956, everything
  fixed before 15 February 1972 from 15 February 2067, and 95 years after that. A recording needs
  its publication year and at least one piece of date evidence (discography, label dating, a dated
  document or an archive catalogue entry).
- **Creative Commons** passes only for CC0 1.0, CC BY and CC BY-SA (any version or port),
  recognised from the licence URL, and BY and BY-SA need an attribution line. NC, ND and Sampling
  licences never pass, whatever basis the record claims. The Public Domain Mark is a label, not a
  licence, so it needs the US basis with date evidence.
- **Signed licences** need a contract reference and an unexpired term.

The stored year in `rights_rules` can be held back by hand (`auto_advance = false`) and is never
allowed past the legal year. US public domain is a US rule; whether the archive is geo-limited is
for the lawyer's review.

## 30. Archive storage and previews

Archive files live in R2 under `cleared/<asset id>/` (the dump bucket, as the spec's diagram
shows): a 44.1 kHz 16-bit WAV master, a 192 kbps MP3 preview and waveform peaks. MP3 rather than
AAC because every browser decodes it, including Chromium builds without proprietary codecs. The
web app hands out presigned GET URLs (an hour); in development and tests a local folder
(`ASSET_STORE_DIR`) is served by `/api/v1/archive/files/…` with byte ranges. Only assets with
status `ready` are listed or served, and WAV masters only to Pro.

## 31. Archive tables

`assets`, `asset_rights` (one rights record per asset with the problems and the cutoff year of
its last check), `rights_rules` (one row), `asset_chops` (per-user chop markers, deleted with the
account) and `crate_assets` (archive recordings in crates, counted against the Free crate size).
The web app writes only `asset_chops` and `crate_assets`.

## 32. Chops and exports

Chop markers are times in seconds, at most 64, kept per user. WAV export of a chop is cut in the
browser (or on the phone) from the master with the shared WAV code in `packages/core`, so the
server never transcodes on request. A single WAV export carries no sidecar; DAW folder exports
(Chrome and Edge folder picker, a stored ZIP elsewhere) write one `.json` rights sidecar per WAV.

## 33. Archive on mobile is a build option

Background playback is an app-wide capability (iOS `UIBackgroundModes`, Android's media-playback
foreground service), so only builds made with `FEATURE_CLEARED_LANE` get it, through the
`expo-audio` config plugin; default builds have neither, and the compliance test checks both
configurations. The YouTube WebView still pauses on any app-state change away from `active`.
Offline listening keeps the MP3 preview in the app's documents folder; Pro WAV export goes to the
share sheet ("Save to Files").

## 34. Dev auth needs an explicit opt-in in production; account deletion cancels Stripe

Supersedes part of 13. A production server (`NODE_ENV=production`) never falls back to dev auth:
without Supabase settings it refuses to start, and `AUTH_MODE=dev` also needs `ALLOW_DEV_AUTH=1`,
which only the end-to-end tests set. Vercel refuses dev auth outright. Deleting an account now
cancels its Stripe subscription first (the deletion stops if Stripe can't be reached), and a
late cancellation webhook for a user with no subscription row is ignored instead of recreating
data for a deleted account. Store subscriptions still have to be cancelled in the store.

## 35. Free and Pro follow the market's split; listening stays free

Supersedes the tier table in the spec's "Product scope" and the Free crate limits. The split
follows the leading crate-digging app's published tiers, with three tools moved down to Free
so the cheaper plan is also the more generous one:

- **Free (signed in):** 10,000 favorites, 200 saved filter sets, timestamped notes, tempo,
  key and max-views filters, tap tempo and tempo/key votes, comments, a 50-play history.
- **Pro:** crates (200 of up to 1,000 records), keyword search, topic channels, "more from"
  this release, channel, label or artist, deep-cut and format-note filters, a 1,000-play
  history, crate sheets (CSV/JSON), share links and seeded crates, YouTube playlist links
  (see 40), no ads.

Notes, tempo and key are Free here (the reference app keeps notes under Pro). Every record
plays free for everyone, signed in or not; Play all and the daily dig are free too (rule 6).
A lapsed Pro keeps read, play, trim and delete on their crates and can unshare them, but can't
create crates or add to them; notes are kept. The numbers live in `packages/core/src/plans.ts`.

## 36. Favorites are their own table

`favorites` holds keys only (user, record key, video ID, note, added at), capped at 10,000,
with no foreign keys into catalog tables. The heart or F toggles a favorite; S opens the crate
picker on Pro and favorites on Free. Favorites feed "For you" and Trending (41) and count
toward rank (37). Saved filter sets are stored as the same normalized filter object the URL
uses, so a preset that includes Pro filters stays visible but locked on Free.

## 37. Comments, display names and ranks

Comments are per record (record key), up to 1,000 characters, shown with the author's display
name, rank and a Pro badge. A display name is required before the first comment: 3 to 30
letters, numbers, spaces, dots, dashes or underscores, folded to NFKC, from one alphabet when
Latin, Cyrillic or Greek letters are involved (so lookalikes can't pass), unique ignoring case and
separators, with staff-like names reserved. Rank comes from contributions only (a favorite 1 point, a comment 3, a
tempo or key vote 2), never from plays or YouTube data. A comment that three different people
report is hidden until a moderator looks; authors see "Hidden after reports" on their own list.
Account deletion removes comments, reports and the profile.

## 38. Keyword search, topic channels and "more from"

Pro keyword search matches each word as a prefix, and every word must match within one source:
the Discogs side (record, artist, label, track and style names) or the YouTube side (video title
and tags). Two IMMUTABLE functions (`record_search_doc`, `video_search_doc`) back GIN expression
indexes. The query is built from sanitized terms in `packages/core/src/keywords.ts` and only ever
reaches SQL as a parameter. "Topic channels only" means YouTube's auto-generated
"<Artist> - Topic" uploads. "More from" scopes the shuffle to one record key, channel ID,
Discogs label ID or artist ID.

## 39. YouTube channel and tags are stored as API data under rule 7

The worker's existing `videos.list` call already returns `snippet.channelId`, `channelTitle` and
`tags`, so adding them costs no quota. They live in `yt_videos` with the other API data, are
refreshed with it and nulled by the purge within 30 days, and are used only as filters (topic
channels, more from this channel, keywords). They never feed a score, a rank or Trending.

## 40. YouTube playlists: a link out, Play all, and no API export yet

Supersedes 20. Three ways to hear a list as one run:

- **Play all** (free, every plan): the page's one player plays the list in order, advancing
  with `loadVideoById` when a video ends. It keeps our visibility rule, error skipping and play
  logging, which YouTube's own `loadPlaylist` would bypass.
- **Open as YouTube playlist** (Pro): a plain link to `youtube.com/watch_videos?video_ids=…`,
  up to 50 videos per link, so longer lists get several links. It opens an untitled, temporary
  playlist on YouTube. It makes no API call and brings no data back, so it uses no quota and
  needs no OAuth. The URL is not in Google's documentation. We read rule 9 as covering how we
  get YouTube data, not where we link people, so we treat the link as allowed, but the owner
  should confirm this before launch. Turning it off is one line in `plans.ts`.
- **Save to my YouTube account** (not built): `playlists.insert` plus one `playlistItems.insert`
  per video costs 50 units each, so 2,550 units for 50 videos. That is more than the share of the
  default 10,000-unit daily quota the worker leaves free. It needs the sensitive `youtube` OAuth
  scope, Google's verification, and a quota audit that names the feature. It stays behind
  `FEATURE_PLAYLIST_EXPORT`, which stays off.

## 41. Trending is built from favorites

Trending lists the playable records the most different people favorited in the last 7 days.
A record needs at least two fans to appear, so it never shows one person's taste. The top 50
are cached for 10 minutes. It reads favorites only: no view counts or other YouTube data
(rule 7). There is no "rising" list yet.

## 42. Dig player settings live on the device

The Dig settings are kept in `localStorage` and change only what plays next and where it starts:
- autoplay the next record when a video ends;
- start at the top, a fixed offset, or a random point between 0:10 and 1:15;
- move on after a set number of seconds heard (off, 0:30, 1:00, 1:30 or 2:00);
- let records already heard come round again (the shuffle's `repeats=1`, which keeps only
  this session's records out);
- hide comments.

Any automatic next pick autoplays only while more than half the player is visible; otherwise it
is cued.

## 43. On mobile, long-press favorites on Free

Supersedes 25 for Free accounts: a long-press on the pick card adds the record to favorites
(with a success haptic) because Free has no crates. Pro keeps the last-crate behaviour.

## 44. What the reference app has that we leave out

- Time signature: there's no allowed source. Its tempo, key and time-signature fields line up
  with Spotify's audio features, which rule 18 bars.
- Discogs cover art: barred by rule 16. We keep the generated sleeves.
- Bluetooth, headphone and CarPlay media controls: these need background playback of YouTube,
  which rule 2 bars.

## 45. Sign-in methods

Supabase mode on the web offers:
- email and password, plus sign-up with email confirmation;
- a magic link;
- a password reset that lands on `/account/password`;
- OAuth buttons for the providers listed in `NEXT_PUBLIC_AUTH_PROVIDERS`. Spotify is never one
  (rule 18).

Every sign-in path carries a `next` parameter. Only same-origin paths starting with `/` are
accepted; `//`, backslashes, control characters and `/login` or `/auth` targets all fall back to
`/`. Sessions persist until sign-out, which covers a "remember me" option. Dev auth is
unchanged.

## 46. Sitemaps and robots.txt

Record pages are listed in sitemaps of up to 50,000 URLs each, split by record-key ranges that
are cached for 6 hours. They are rendered per request, so a build never needs the database and
the files follow the monthly catalog. robots.txt allows the public pages (Dig, records, Daily,
Trending, Changelog, legal) and keeps search engines out of the API and personal pages. No
YouTube data appears in either.

## 47. Shared crates keep item notes private

A shared crate shows its records to anyone, but the owner's notes on items are left out of the
public response.

## 48. Comment moderation: blocks, a filter before posting, a contact point

Supersedes the reporting part of 37. Public comments put the apps under App Store guideline
1.2, which asks for a way to block abusive users, a filter for objectionable content, a way to
report it with a timely response, and a published contact point.

- **Blocks.** Anyone signed in can block a comment's author (`POST /api/v1/comments/:id/block`,
  with an inline confirm on web and mobile). `user_blocks` holds blocker, blocked and an opaque
  block ID; comment lists leave out blocked authors for the blocker only, and the blocked person
  isn't told. `GET /api/v1/me/blocks` lists blocks by display name and block ID, and
  `DELETE /api/v1/me/blocks/:id` unblocks, from the Account page and screen. User IDs never
  leave the server. Up to 1,000 blocks per account. Account deletion removes rows on either
  side.
- **Filter before posting.** A comment is refused with a 400 when it holds a link (a scheme,
  `www.`, or a bare domain: common endings anywhere, word-like endings such as `.me` or `.be`
  only with a path, and a capitalized ending after a dot reads as a missed space), or a term from
  the operator's `COMMENT_BLOCKED_TERMS` (comma separated, whole words or phrases, compared after
  NFKC, lowercasing and dropping invisible characters). The list lives in the deployment's
  settings, never in git. The matcher is `packages/core/src/moderation.ts`.
- **Reports.** Only accounts with a display name can report (409 otherwise). `report_count` and
  `hidden` are worked out from the live `comment_reports` rows (from reporters with a display
  name) inside the report transaction, and again when a reporter's account is deleted, so
  deleting and re-registering never stacks reports. `hidden` no longer doubles as a moderator
  flag: moderators remove a comment by deleting it (RUNBOOK, "Moderation"). Reports are reviewed
  within 24 hours.
- **Contact and rules.** `NEXT_PUBLIC_SUPPORT_EMAIL` and `EXPO_PUBLIC_SUPPORT_EMAIL` appear on
  the Terms, the Privacy policy, the site footer and the mobile Account screen. Until they are
  set, `support@example.com` shows, marked as a placeholder. The Terms gain "What you post": the
  rules, removal and suspension, how to report and block, and the contact.
