// The ingest job end to end: discover → stream (hash, R2 snapshot, parse) → stage → verify
// → build → index → diff → swap → census → changelog draft. Safe to rerun from the start;
// any failure before the swap leaves the live tables untouched.

import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { createStaging, dropStaging, indexStaging, type Pool, swapCatalog } from "@app/db";
import { checksumFor, type DumpFile, discoverLatestDump, fileNameOf } from "@app/discogs";
import { syncPlayable } from "../jobs/youtube-state";
import { isUrl, looksGzipped, newTap, openSource, tapStream } from "../source";
import { buildRecordVideos, diffCatalog, dropBuildTemps } from "./build";
import { computeCensus, storeCensus } from "./census";
import { draftDataChangelog } from "./changelog";
import { type SnapshotStore, snapshotKey } from "./snapshot";
import { stageReleases } from "./stage";
import { tee } from "./tee";

export const INGEST_LOCK = 4_242_001;

export class ChecksumError extends Error {
  override name = "ChecksumError";
}

export type IngestDeps = {
  pool: Pool;
  baseUrl: string;
  fetch?: typeof fetch;
  snapshots?: SnapshotStore | null;
  log?: (msg: string) => void;
  /** Clock for discovery (which year's listing to read). */
  now?: () => Date;
};

export type IngestRequest = {
  /** Ingest a specific listed dump instead of discovering the newest. */
  dump?: DumpFile;
  /** Ingest a local file (development, fixtures). */
  file?: string;
  dumpDate?: string;
  checksumText?: string;
  /** Local files only: proceed without a published checksum. */
  allowUnverified?: boolean;
  force?: boolean;
};

export type IngestOutcome =
  | { status: "skipped"; reason: string; dumpDate?: string }
  | {
      status: "succeeded";
      dumpDate: string;
      sha256: string;
      releasesSeen: number;
      records: number;
      recordVideos: number;
      addedRecords: number;
      removedRecords: number;
      newVideoIds: number;
      seconds: number;
    };

function dateFromName(name: string): string | null {
  const m = /discogs_(\d{4})(\d{2})(\d{2})_releases/.exec(name);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

type Source = {
  location: string;
  fileName: string;
  dumpDate: string;
  checksumText: () => Promise<string | null>;
};

async function resolveSource(deps: IngestDeps, req: IngestRequest): Promise<Source | null> {
  const doFetch = deps.fetch ?? fetch;
  if (req.file) {
    const fileName = basename(req.file);
    const dumpDate = req.dumpDate ?? dateFromName(fileName);
    if (!dumpDate)
      throw new Error("Pass --dump-date for a file whose name has no discogs_YYYYMMDD_ prefix");
    return {
      location: req.file,
      fileName,
      dumpDate,
      async checksumText() {
        if (req.checksumText) return req.checksumText;
        const stamp = dumpDate.replace(/-/g, "");
        const sibling = join(dirname(req.file as string), `discogs_${stamp}_CHECKSUM.txt`);
        return existsSync(sibling) ? readFileSync(sibling, "utf8") : null;
      },
    };
  }
  const dump =
    req.dump ??
    (await discoverLatestDump({ baseUrl: deps.baseUrl, fetch: doFetch, now: deps.now?.() }));
  if (!dump) return null;
  return {
    location: dump.releasesUrl,
    fileName: fileNameOf(dump.releasesUrl),
    dumpDate: dump.dumpDate,
    async checksumText() {
      if (req.checksumText) return req.checksumText;
      const res = await doFetch(dump.checksumUrl);
      return res.ok ? res.text() : null;
    },
  };
}

export async function runIngest(deps: IngestDeps, req: IngestRequest = {}): Promise<IngestOutcome> {
  const log = deps.log ?? (() => undefined);
  const { pool } = deps;
  const t0 = performance.now();
  const lock = await pool.connect();
  try {
    const got = await lock.query<{ ok: boolean }>("select pg_try_advisory_lock($1) as ok", [
      INGEST_LOCK,
    ]);
    if (!got.rows[0]?.ok) return { status: "skipped", reason: "another ingest is running" };

    const source = await resolveSource(deps, req);
    if (!source) return { status: "skipped", reason: "no releases dump listed" };
    const { dumpDate } = source;

    const done = await pool.query(
      "select 1 from ingest_runs where dump_date = $1 and status = 'succeeded'",
      [dumpDate],
    );
    if ((done.rowCount ?? 0) > 0 && !req.force) {
      return { status: "skipped", reason: "dump already ingested", dumpDate };
    }

    await pool.query(
      `insert into ingest_runs (dump_date, status, started_at) values ($1, 'running', now())
       on conflict (dump_date) do update set status = 'running', started_at = now(), finished_at = null, error = null`,
      [dumpDate],
    );
    log(`Ingesting ${source.fileName} (${dumpDate})`);

    const client = await pool.connect();
    const key = snapshotKey(source.fileName);
    let snapshotted = false;
    try {
      // old_* (last month) stays until the swap replaces it, so a failed run never costs the
      // ability to roll back.
      await createStaging(client);
      const keep = await client.query<{ record_key: string }>(
        "select distinct record_key from link_suggestions where status = 'accepted'",
      );
      const keepRecordKeys = new Set(keep.rows.map((r) => r.record_key));

      // 1. Stream once: hash, snapshot to R2, and parse into staging.
      const tap = newTap();
      const raw = await openSource(source.location, deps.fetch ?? fetch);
      const tapped = raw.pipe(tapStream(tap));
      raw.on("error", (err) => tapped.destroy(err));
      const [parseBranch, snapshotBranch] = tee(
        tapped,
        deps.snapshots ? [{ optional: false }, { optional: true }] : [{ optional: false }],
      );
      const snapshot =
        deps.snapshots && snapshotBranch
          ? deps.snapshots.upload(key, snapshotBranch).then(
              () => {
                snapshotted = true;
              },
              (err: unknown) => log(`R2 snapshot failed, continuing without it: ${String(err)}`),
            )
          : Promise.resolve();
      const counts = await stageReleases({
        pool,
        bytes: parseBranch as NonNullable<typeof parseBranch>,
        gzip: looksGzipped(source.location),
        keepRecordKeys,
        log,
      });
      await snapshot;
      const sha256 = tap.hash.digest("hex");
      log(`Staged ${counts.releasesSeen} releases, ${counts.linksStaged} links; sha256 ${sha256}`);

      // 2. Verify before building anything from it.
      const checksumText = await source.checksumText();
      const expected = checksumText ? checksumFor(checksumText, source.fileName) : null;
      if (expected === null && !(req.allowUnverified && !isUrl(source.location))) {
        throw new ChecksumError(`No published checksum for ${source.fileName}`);
      }
      if (expected !== null && expected !== sha256) {
        throw new ChecksumError(
          `Checksum mismatch for ${source.fileName}: expected ${expected}, got ${sha256}`,
        );
      }

      // 3. Build, index, diff and swap.
      const built = await buildRecordVideos(client, dumpDate);
      await indexStaging(client);
      const diff = await diffCatalog(client);
      await swapCatalog(client);
      // Validation may have changed statuses while the build ran; catch up now.
      await syncPlayable(pool);
      log(`Swapped: ${diff.records} records, ${diff.recordVideos} record videos`);
      await dropBuildTemps(client);
      await client.query("drop table if exists stg_release_facts, stg_release_videos");

      // 4. Report: census and a changelog draft.
      const census = await computeCensus(pool);
      await storeCensus(pool, dumpDate, census);
      const entry = draftDataChangelog({
        dumpDate,
        ...diff,
        newVideoIds: built.newVideoIds,
        census,
      });
      await pool.query(
        "insert into changelog_entries (kind, title, body, draft) values ('data', $1, $2, true)",
        [entry.title, entry.body],
      );
      await pool.query(
        `update ingest_runs set status = 'succeeded', sha256 = $2, releases_seen = $3, records = $4,
           record_videos = $5, added_records = $6, removed_records = $7, new_video_ids = $8, finished_at = now()
         where dump_date = $1`,
        [
          dumpDate,
          sha256,
          counts.releasesSeen,
          diff.records,
          diff.recordVideos,
          diff.addedRecords,
          diff.removedRecords,
          built.newVideoIds,
        ],
      );
      return {
        status: "succeeded",
        dumpDate,
        sha256,
        releasesSeen: counts.releasesSeen,
        ...diff,
        newVideoIds: built.newVideoIds,
        seconds: Math.round((performance.now() - t0) / 100) / 10,
      };
    } catch (err) {
      await pool
        .query(
          "update ingest_runs set status = 'failed', error = $2, finished_at = now() where dump_date = $1",
          [dumpDate, err instanceof Error ? err.message : String(err)],
        )
        .catch(() => undefined);
      await dropBuildTemps(client).catch(() => undefined);
      await dropStaging(client).catch(() => undefined);
      if (snapshotted && deps.snapshots) await deps.snapshots.delete(key).catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  } finally {
    await lock.query("select pg_advisory_unlock($1)", [INGEST_LOCK]).catch(() => undefined);
    lock.release();
  }
}
