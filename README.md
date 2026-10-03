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

See [`CLAUDE.md`](CLAUDE.md) for the layout and conventions and
[`docs/RUNBOOK.md`](docs/RUNBOOK.md) for operations.

## Rules this project never breaks

YouTube plays only in the official IFrame player, nothing ever downloads or records it,
nothing is drawn over it, and the API key stays on the server. The catalog comes only from
Discogs' CC0 dumps and every record links back to discogs.com. The full list is in
[`.claude/rules/compliance.md`](.claude/rules/compliance.md), and CI enforces what it can.
