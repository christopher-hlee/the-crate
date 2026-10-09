# the-crate

Dig through records at random. Discogs' monthly CC0 data dump decides what plays and
YouTube's official player plays it. Set filters, shuffle, listen, and keep what you like in
favorites or crates.

> Working name. The product name is still open, so code uses the `APP_NAME` constant.

## Status

Built phase by phase from [`docs/SPEC.md`](docs/SPEC.md). Progress is tracked in
[`docs/PLAN.md`](docs/PLAN.md) and spec changes in [`docs/DECISIONS.md`](docs/DECISIONS.md).

## Quick start

```bash
pnpm install
pnpm db:up            # Postgres 16 on localhost:5433 (docker compose)
pnpm verify           # lint, typecheck, unit + integration tests, build, compliance scan
```

Count what's in a Discogs dump (a URL or a local `.xml`/`.xml.gz` file):

```bash
pnpm catalog:count fixtures/discogs/releases-small.xml --out reports/count.json
```

Run the web app and the mobile app against it:

```bash
pnpm --filter @app/web dev                                   # http://localhost:3000
EXPO_PUBLIC_API_URL=http://<your-lan-ip>:3000 EXPO_PUBLIC_AUTH_MODE=dev \
  pnpm --filter @app/mobile start                            # needs a development build
```

## What's built

- **Catalog:** streaming ingest of the monthly Discogs dump into Postgres, staged and swapped
  live in one transaction, with rollback, a style census and a monthly changelog.
- **YouTube state:** the worker validates every linked video with the Data API inside a
  Pacific-day quota budget, rechecks reported videos and deletes stale API data after 30 days.
- **Free (signed in):** Dig with one compliant player, filters with census counts plus tempo,
  key and max views, favorites (heart or F, up to 10,000), 200 saved filter sets, timestamped
  notes, tap tempo and key votes, comments with display names and ranks, For you, Trending,
  a 50-play history, player settings (random start, next after N seconds, replays). Everything
  plays free, signed in or not; signing in keeps your lists.
- **Pro:** crates (200 of up to 1,000 records) with Play all, seeded crates and share links,
  keyword search over record names and video titles and tags, topic channels, "more from"
  this release, channel, label or artist, deep-cut and format-note filters, a 1,000-play
  history, crate sheets (CSV and JSON), "Open as YouTube playlist" links (50 videos each), no
  ads. Stripe and RevenueCat billing on one `pro` entitlement.
- **Mobile (Expo):** Dig, Favorites, Crates, History and Account; the player page from
  `packages/player-html` in a WebView whose `baseUrl` is the app ID; swipe for next,
  long-press to favorite (or save to the last crate on Pro), saved filters, comments,
  haptics, offline state, pause on background, RevenueCat purchases.
  Store copy and review notes are in [`docs/store-listing.md`](docs/store-listing.md).
- **Archive (Phase 4, flagged and unlisted):** public-domain and Creative Commons recordings we
  host ourselves, each with a rights record checked by rules in `packages/core`; a waveform
  player with chop markers; Pro WAV export and DAW folder export (folder picker or ZIP, with
  rights sidecars); the January 1 public-domain rollover. Off until the rights rules pass legal
  review.

See [`CLAUDE.md`](CLAUDE.md) for the layout and conventions and
[`docs/RUNBOOK.md`](docs/RUNBOOK.md) for operations.

## Rules this project never breaks

YouTube plays only in the official IFrame player, nothing ever downloads or records it,
nothing is drawn over it, and the API key stays on the server. The catalog comes only from
Discogs' CC0 dumps and every record links back to discogs.com. The full list is in
[`.claude/rules/compliance.md`](.claude/rules/compliance.md), and CI enforces what it can.
