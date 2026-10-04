import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig, devices } from "@playwright/test";

// End-to-end and compliance specs. The global setup seeds a fresh database through the
// worker's real ingest pipeline; the web server runs the production build in dev-auth mode.
// YouTube is stubbed (e2e/youtube-stub.ts): no live YouTube calls in tests.

const PORT = Number(process.env.E2E_PORT ?? 3100);
const ADMIN = process.env.TEST_DATABASE_URL ?? "postgres://crate:crate@localhost:5433/postgres";
const E2E_DB = (() => {
  const u = new URL(ADMIN);
  u.pathname = `/${process.env.E2E_DB_NAME ?? "crate_e2e"}`;
  return u.toString();
})();
const executablePath = process.env.PW_CHROMIUM_PATH || undefined;
// Archive (cleared-lane) files for the e2e run: written by globalSetup's import, served by the app.
const ASSET_DIR = process.env.E2E_ASSET_DIR ?? join(tmpdir(), "crate-e2e-assets");
process.env.E2E_ASSET_DIR = ASSET_DIR;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    launchOptions: executablePath ? { executablePath } : {},
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } },
    },
    // The smallest supported screen: the player must still be at least 200×200.
    {
      name: "small-phone",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 320, height: 568 },
        isMobile: false,
        hasTouch: true,
      },
    },
  ],
  webServer: {
    command: `pnpm exec next start -p ${PORT}`,
    // A static page: the database is seeded by globalSetup, which runs after the server starts.
    url: `http://localhost:${PORT}/legal/terms`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      DATABASE_URL: E2E_DB,
      AUTH_MODE: "dev",
      ALLOW_DEV_AUTH: "1",
      NARROW_FILTER_THRESHOLD: "100",
      FEATURE_CLEARED_LANE: "1",
      ASSET_STORE_DIR: ASSET_DIR,
    },
  },
});
