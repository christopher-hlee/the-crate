import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

/** Seeds crate_e2e through the worker's ingest pipeline before the web server starts. */
export default function globalSetup() {
  if (process.env.E2E_SKIP_SEED) return;
  const root = fileURLToPath(new URL("../../..", import.meta.url));
  execSync("pnpm -s worker e2e:seed --database crate_e2e --releases 3000", {
    cwd: root,
    stdio: "inherit",
  });
}
