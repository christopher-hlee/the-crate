# Runbook

Operational steps for the-crate. Commands run from the repo root unless noted.

## Local Postgres

```bash
pnpm db:up                                   # docker compose, Postgres 16 on :5433
export DATABASE_URL=postgres://crate:crate@localhost:5433/crate
export DIRECT_DATABASE_URL=$DATABASE_URL
pnpm db:migrate
```

Without Docker, any Postgres 16 works: create a superuser `crate`/`crate` and point the
URLs at it. Integration tests need `TEST_DATABASE_URL` pointing at a database the user can
connect to (default `postgres://crate:crate@localhost:5433/postgres`); each test file
creates and drops its own database.

## Phase 0: count a dump

```bash
pnpm catalog:count https://data.discogs.com/... --out reports/count.json   # live dump URL
pnpm catalog:count path/to/discogs_YYYYMMDD_releases.xml.gz --out reports/count.json
pnpm worker discover                                                       # newest dump on the listing
```
