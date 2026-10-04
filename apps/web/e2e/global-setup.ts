import { execSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { encodeWav } from "@app/core";

const evidence = [
  { kind: "discography", citation: "Test discography entry, recorded 1924", url: null },
];

/** Short test tones standing in for archive recordings. */
function tone(seconds: number, hz: number): Uint8Array {
  const rate = 22050;
  const n = Math.round(seconds * rate);
  const ch = Float32Array.from(
    { length: n },
    (_, i) => 0.3 * Math.sin((2 * Math.PI * hz * i) / rate),
  );
  return encodeWav({ sampleRate: rate, channels: [ch] });
}

/** An archive manifest: two recordings that pass the rights rules, one held, one rejected. */
function writeArchiveFixtures(dir: string): string {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "stomp.wav"), tone(4, 330));
  writeFileSync(join(dir, "waltz.wav"), tone(3, 262));
  writeFileSync(join(dir, "later.wav"), tone(2, 196));
  const pd = (year: number) => ({
    basis: "us_pd",
    sourceUrl: "https://archive.org/details/78_e2e",
    licenseUrl: null,
    recordingYear: year,
    dateEvidence: evidence,
    attribution: null,
    licenseRef: null,
    licenseExpiresAt: null,
  });
  const manifest = {
    assets: [
      {
        slug: "e2e-stomp",
        artist: "Example Jazz Band",
        title: "Example Stomp",
        year: 1924,
        audio: "stomp.wav",
        bpm: 104,
        camelotKey: "8B",
        rights: pd(1924),
      },
      {
        slug: "e2e-waltz",
        artist: "Open Ensemble",
        title: "Free Waltz",
        audio: "waltz.wav",
        rights: {
          basis: "cc_by",
          sourceUrl: "https://example.org/waltz",
          licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
          recordingYear: null,
          dateEvidence: [],
          attribution: "Open Ensemble, CC BY 4.0",
          licenseRef: null,
          licenseExpiresAt: null,
        },
      },
      {
        slug: "e2e-held",
        artist: "Later Orchestra",
        title: "Not Yet Public",
        year: 1990,
        audio: "later.wav",
        rights: pd(1990),
      },
      {
        slug: "e2e-nc",
        artist: "Somebody",
        title: "Non-commercial",
        audio: "later.wav",
        rights: {
          ...pd(1924),
          basis: "cc_by",
          licenseUrl: "https://creativecommons.org/licenses/by-nc/4.0/",
          attribution: "x",
        },
      },
    ],
  };
  const file = join(dir, "manifest.json");
  writeFileSync(file, JSON.stringify(manifest, null, 2));
  return file;
}

/** Seeds crate_e2e through the worker's ingest and archive import before the tests run. */
export default function globalSetup() {
  if (process.env.E2E_SKIP_SEED) return;
  const root = fileURLToPath(new URL("../../..", import.meta.url));
  execSync(
    `pnpm -s worker e2e:seed --database ${process.env.E2E_DB_NAME ?? "crate_e2e"} --releases 3000`,
    {
      cwd: root,
      stdio: "inherit",
    },
  );
  const assetDir = process.env.E2E_ASSET_DIR;
  if (!assetDir) throw new Error("E2E_ASSET_DIR is set by playwright.config.ts");
  const manifest = writeArchiveFixtures(join(assetDir, "..", "crate-e2e-archive-src"));
  rmSync(assetDir, { recursive: true, force: true });
  const admin = new URL(
    process.env.TEST_DATABASE_URL ?? "postgres://crate:crate@localhost:5433/postgres",
  );
  admin.pathname = `/${process.env.E2E_DB_NAME ?? "crate_e2e"}`;
  execSync(`pnpm -s worker cleared:import ${JSON.stringify(manifest)}`, {
    cwd: root,
    stdio: "inherit",
    env: {
      ...process.env,
      DIRECT_DATABASE_URL: admin.toString(),
      ASSET_STORE_DIR: assetDir,
      R2_ACCOUNT_ID: "",
    },
  });
}
