#!/usr/bin/env node
// Static compliance checks that run after the build (see docs/SPEC.md, "Compliance tests").
//   4. Built web and mobile bundles contain no Google API key (the `AIza` prefix).
//   5. No lockfile or manifest pulls in a YouTube downloader, a YouTube scraper or the
//      Spotify Web API.
// The browser checks (1–3), the purge check (6) and the WebView baseUrl check (7) live in
// apps/web/e2e, apps/worker and apps/mobile respectively.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = new URL("../..", import.meta.url).pathname;

export const BANNED_PACKAGES = [
  // Downloaders (rule 2)
  "ytdl-core",
  "@distube/ytdl-core",
  "@ybd-project/ytdl-core",
  "ytdl-core-discord",
  "yt-dlp",
  "yt-dlp-wrap",
  "yt-dlp-exec",
  "youtube-dl",
  "youtube-dl-exec",
  "youtube-dl-wrap",
  "play-dl",
  "ytdl",
  // Scrapers and undocumented endpoints (rule 9)
  "youtubei.js",
  "youtubei",
  "ytsr",
  "ytpl",
  "youtube-sr",
  "scrape-youtube",
  // Spotify Web API (rule 18)
  "spotify-web-api-node",
  "spotify-web-api-js",
  "@spotify/web-api-ts-sdk",
];

const KEY_PATTERN = /AIza[0-9A-Za-z_-]{30,}/;
const TEXT_EXTENSIONS = new Set([
  ".js",
  ".mjs",
  ".cjs",
  ".html",
  ".json",
  ".txt",
  ".rsc",
  ".css",
  ".body",
  ".meta",
  ".hbc",
  ".bundle",
]);

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function findBannedInLockfile(text) {
  const hits = [];
  for (const name of BANNED_PACKAGES) {
    const re = new RegExp(`(^|[\\s'"/(])${escapeRegExp(name)}@`, "m");
    if (re.test(text)) hits.push(name);
  }
  return hits;
}

function* walk(dir, skip) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (skip.has(entry)) continue;
    const st = statSync(full);
    if (st.isDirectory()) yield* walk(full, skip);
    else yield full;
  }
}

function extOf(file) {
  const i = file.lastIndexOf(".");
  return i === -1 ? "" : file.slice(i);
}

export function scanBundles(dirs) {
  const hits = [];
  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    for (const file of walk(dir, new Set(["cache", "node_modules"]))) {
      if (!TEXT_EXTENSIONS.has(extOf(file))) continue;
      const text = readFileSync(file, "utf8");
      const m = KEY_PATTERN.exec(text);
      if (m) hits.push(`${relative(root, file)}: ${m[0].slice(0, 8)}…`);
    }
  }
  return hits;
}

function selfTest() {
  const lock =
    "packages:\n\n  /ytdl-core@4.11.5:\n  '@distube/ytdl-core@4.16.0':\n  my-ytdl-core@1.0.0:\n";
  const hits = findBannedInLockfile(lock);
  const ok =
    hits.includes("ytdl-core") &&
    hits.includes("@distube/ytdl-core") &&
    findBannedInLockfile("  my-ytdl-core@1.0.0:\n").length === 0 &&
    KEY_PATTERN.test(`const k = "AIza${"x".repeat(35)}";`) &&
    !KEY_PATTERN.test("AIzaShort");
  if (!ok) {
    console.error("✗ Compliance scanner self-test failed");
    process.exit(1);
  }
}

function main() {
  selfTest();
  let failed = false;

  const lockfile = join(root, "pnpm-lock.yaml");
  const lockText = existsSync(lockfile) ? readFileSync(lockfile, "utf8") : "";
  const banned = findBannedInLockfile(lockText);
  if (banned.length > 0) {
    failed = true;
    console.error(`✗ Banned packages in pnpm-lock.yaml: ${banned.join(", ")}`);
  } else {
    console.log("✓ No YouTube downloader, scraper or Spotify Web API package in the lockfile");
  }

  const bundleDirs = [
    join(root, "apps/web/.next"),
    join(root, "apps/mobile/dist"),
    join(root, "packages/player-html/generated"),
  ];
  const builtDirs = bundleDirs.filter((d) => existsSync(d));
  const keyHits = scanBundles(builtDirs);
  if (keyHits.length > 0) {
    failed = true;
    console.error(`✗ Google API key found in built bundles:\n  ${keyHits.join("\n  ")}`);
  } else {
    console.log(`✓ No Google API key in ${builtDirs.length} built bundle folder(s)`);
  }

  // In CI a missing bundle is a failure, not a pass: COMPLIANCE_REQUIRE names the bundles a
  // job must have built (default "web"; the mobile job sets "mobile").
  const requiredDirs = { web: "apps/web/.next", mobile: "apps/mobile/dist" };
  const required = (process.env.COMPLIANCE_REQUIRE ?? (process.env.CI ? "web" : ""))
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const name of required) {
    const dir = requiredDirs[name];
    if (!dir) {
      failed = true;
      console.error(`✗ Unknown COMPLIANCE_REQUIRE entry: ${name}`);
    } else if (!existsSync(join(root, dir))) {
      failed = true;
      console.error(`✗ ${dir} is missing: build it before the compliance scan`);
    }
  }

  process.exit(failed ? 1 : 0);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
