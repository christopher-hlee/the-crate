// cleared:import — rights first, then audio. An asset that fails the rules is never fetched;
// one held for a later public-domain year is processed now and released by pd_rollover.

import { dirname, isAbsolute, resolve } from "node:path";
import { type AssetStore, assetKeys } from "@app/assets";
import { checkRights } from "@app/core";
import type { Pool } from "@app/db";
import { type AudioTools, processAudio } from "./audio";
import type { Manifest, ManifestItem } from "./manifest";
import { cutoffInForce, runPdRollover, storedCutoff } from "./rules";

export type ImportResult = { slug: string; status: string; reason: string | null };

async function upsertAsset(
  pool: Pool,
  item: ManifestItem,
  now: Date,
): Promise<{ id: string; sha256: string | null; status: string }> {
  const { rows } = await pool.query<{ id: string; sha256: string | null; status: string }>(
    `insert into assets (slug, artist, title, year, label, catno, styles, bpm, camelot_key, status, updated_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending', $10)
     on conflict (slug) do update set artist = excluded.artist, title = excluded.title, year = excluded.year,
       label = excluded.label, catno = excluded.catno, styles = excluded.styles,
       bpm = coalesce(excluded.bpm, assets.bpm), camelot_key = coalesce(excluded.camelot_key, assets.camelot_key),
       updated_at = excluded.updated_at
     returning id, sha256, status`,
    [
      item.slug,
      item.artist,
      item.title,
      item.year,
      item.label,
      item.catno,
      item.styles,
      item.bpm,
      item.camelotKey,
      now,
    ],
  );
  const row = rows[0];
  if (!row) throw new Error(`Upsert of ${item.slug} returned nothing`);
  return row;
}

async function writeRights(
  pool: Pool,
  assetId: string,
  item: ManifestItem,
  now: Date,
  cutoff: number | null,
  problems: string[],
) {
  const r = item.rights;
  await pool.query(
    `insert into asset_rights (asset_id, basis, source_url, license_url, recording_year, date_evidence, attribution,
                               license_ref, license_expires_at, checked_at, rules_cutoff_year, problems)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     on conflict (asset_id) do update set basis = excluded.basis, source_url = excluded.source_url,
       license_url = excluded.license_url, recording_year = excluded.recording_year, date_evidence = excluded.date_evidence,
       attribution = excluded.attribution, license_ref = excluded.license_ref, license_expires_at = excluded.license_expires_at,
       checked_at = excluded.checked_at, rules_cutoff_year = excluded.rules_cutoff_year, problems = excluded.problems`,
    [
      assetId,
      r.basis,
      r.sourceUrl,
      r.licenseUrl,
      r.recordingYear,
      JSON.stringify(r.dateEvidence),
      r.attribution,
      r.licenseRef,
      r.licenseExpiresAt,
      now,
      cutoff,
      problems,
    ],
  );
}

export async function importManifest(
  deps: { pool: Pool; store: AssetStore; tools: AudioTools; log: (m: string) => void },
  manifest: Manifest,
  options: { baseDir: string; now?: Date; force?: boolean },
): Promise<ImportResult[]> {
  const now = options.now ?? new Date();
  const { pool, store, tools, log } = deps;
  // The first import initialises the rules row with the legal cutoff.
  if ((await storedCutoff(pool)).year === null) await runPdRollover(pool, now);
  const cutoff = await cutoffInForce(pool, now);
  const results: ImportResult[] = [];

  for (const item of manifest.assets) {
    const asset = await upsertAsset(pool, item, now);
    // A recording taken down by hand stays down until a forced re-import.
    if (asset.status === "withdrawn" && !options.force) {
      log(`- ${item.slug}: withdrawn, skipped`);
      results.push({ slug: item.slug, status: "withdrawn", reason: null });
      continue;
    }
    const check = checkRights(item.rights, { usPdCutoffYear: cutoff, now });
    await writeRights(pool, asset.id, item, now, cutoff, check.problems);
    const held = !check.ok && "held" in check;
    if (!check.ok && !held) {
      const reason = check.problems.join(" ");
      await pool.query("update assets set status = 'rejected', status_reason = $2 where id = $1", [
        asset.id,
        reason,
      ]);
      log(`✗ ${item.slug}: ${reason}`);
      results.push({ slug: item.slug, status: "rejected", reason });
      continue;
    }
    const status = held ? "held" : "ready";
    try {
      await pool.query(
        "update assets set status = 'processing', status_reason = null where id = $1",
        [asset.id],
      );
      const source =
        /^https?:\/\//i.test(item.audio) || isAbsolute(item.audio)
          ? item.audio
          : resolve(options.baseDir, item.audio);
      const audio = await processAudio(source, tools);
      if (audio.sha256 !== asset.sha256 || options.force) {
        const keys = assetKeys(asset.id, audio.preview.ext);
        await store.put(keys.wav, audio.wav, "audio/wav");
        await store.put(keys.preview, audio.preview.bytes, audio.preview.type);
        await store.put(
          keys.peaks,
          new TextEncoder().encode(JSON.stringify(audio.peaks)),
          "application/json",
        );
        await pool.query(
          `update assets set wav_key = $2, preview_key = $3, preview_type = $4, peaks_key = $5, sha256 = $6,
             duration_s = $7, sample_rate = $8, channels = $9,
             bpm = coalesce($10, bpm), camelot_key = coalesce($11, camelot_key)
           where id = $1`,
          [
            asset.id,
            keys.wav,
            keys.preview,
            audio.preview.type,
            keys.peaks,
            audio.sha256,
            audio.durationS,
            audio.sampleRate,
            audio.channels,
            item.bpm ?? audio.analysis.bpm,
            item.camelotKey ?? audio.analysis.camelotKey,
          ],
        );
      }
      const reason = held ? check.problems.join(" ") : null;
      await pool.query(
        "update assets set status = $2, status_reason = $3, updated_at = $4 where id = $1",
        [asset.id, status, reason, now],
      );
      log(`${held ? "…" : "✓"} ${item.slug}: ${status}`);
      results.push({ slug: item.slug, status, reason });
    } catch (err) {
      const reason = `Processing failed: ${err instanceof Error ? err.message : String(err)}`;
      await pool.query("update assets set status = 'pending', status_reason = $2 where id = $1", [
        asset.id,
        reason.slice(0, 1000),
      ]);
      log(`✗ ${item.slug}: ${reason}`);
      results.push({ slug: item.slug, status: "pending", reason });
    }
  }
  return results;
}

export function manifestBaseDir(manifestPath: string): string {
  return dirname(resolve(manifestPath));
}
