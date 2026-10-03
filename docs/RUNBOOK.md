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

## Web app locally

```bash
cp apps/web/.env.example apps/web/.env.local   # AUTH_MODE=dev unless Supabase is configured
pnpm worker e2e:seed --database crate_dev       # a small catalog through the real ingest
DATABASE_URL=postgres://crate:crate@localhost:5433/crate_dev pnpm --filter @app/web dev
```

## End-to-end and compliance specs

```bash
pnpm turbo run build --filter=@app/web
pnpm --filter @app/web e2e                      # seeds crate_e2e, starts next on :3100
# In a sandbox whose preinstalled Chromium differs from Playwright's pinned build:
PW_CHROMIUM_PATH=/opt/pw-browsers/chromium pnpm --filter @app/web e2e
```

The YouTube IFrame API is stubbed in `apps/web/e2e/youtube-stub.ts`; no test calls YouTube.

## Changelog

The ingest drafts a data entry each month. Review and publish it:

```bash
pnpm worker changelog:list
pnpm worker changelog:publish <id>
```

## Billing (Pro)

Stripe (web):

1. Create a product "Pro" with a monthly and a yearly recurring price. Set `STRIPE_SECRET_KEY`,
   `STRIPE_PRICE_MONTH` and `STRIPE_PRICE_YEAR` on the web app.
2. Add a webhook endpoint `https://<domain>/api/v1/webhooks/stripe` for
   `checkout.session.completed` and `customer.subscription.created|updated|deleted`. Set its
   signing secret as `STRIPE_WEBHOOK_SECRET`.
3. Turn on the Customer Portal (cancel, update payment method, switch monthly/yearly).

RevenueCat (stores): one entitlement named `pro`. The app calls `Purchases.logIn(<Supabase user
id>)`. Add the webhook `https://<domain>/api/v1/webhooks/revenuecat` with an Authorization header
value; set the same value as `REVENUECAT_WEBHOOK_SECRET`.

Give someone Pro by hand (support, testing):

```sql
insert into subscriptions (user_id, plan, source, expires_at) values ('<uuid>', 'pro', null, '2027-01-01')
on conflict (user_id) do update set plan = 'pro', expires_at = excluded.expires_at;
```

## Tempo and key data

```bash
pnpm worker job enrich_tempo        # needs FEATURE_GETSONGBPM=1 and GETSONGBPM_API_KEY (Gate 3)
pnpm worker job pick_audio_features # community votes → estimates → record_videos
pnpm worker tempo:coverage --out reports/tempo-coverage.json
pnpm worker acousticbrainz:import mapping.csv   # see docs/spikes/acousticbrainz.md
```
