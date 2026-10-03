# the-crate

Dig through records at random. Discogs' monthly CC0 data dump decides what plays and
YouTube's official player plays it. Set filters, shuffle, listen, and save what you like to
a crate.

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
- **Web (Free):** Dig with one compliant player, filters with census counts, record panel with
  a generated sleeve, crates, history, changelog, account deletion, legal pages.
- **Web (Pro):** tempo, key, deep-cut, label and artist filters; seeded crates and share links;
  the daily dig; timestamped notes; tap tempo and key votes; crate sheets (CSV and JSON);
  Stripe and RevenueCat billing on one `pro` entitlement.
- **Mobile (Expo):** Dig, Crates, History and Account; the player page from
  `packages/player-html` in a WebView whose `baseUrl` is the app ID; swipe for next,
  long-press to save, haptics, offline state, pause on background, RevenueCat purchases.
  Store copy and review notes are in [`docs/store-listing.md`](docs/store-listing.md).

See [`CLAUDE.md`](CLAUDE.md) for the layout and conventions and
[`docs/RUNBOOK.md`](docs/RUNBOOK.md) for operations.

## Rules this project never breaks

YouTube plays only in the official IFrame player, nothing ever downloads or records it,
nothing is drawn over it, and the API key stays on the server. The catalog comes only from
Discogs' CC0 dumps and every record links back to discogs.com. The full list is in
[`.claude/rules/compliance.md`](.claude/rules/compliance.md), and CI enforces what it can.
