import "server-only";
// The archive: the spec's cleared lane (public-domain and Creative Commons recordings we host),
// behind FEATURE_CLEARED_LANE and unlisted. Only assets whose rights record passes the rules
// (status 'ready') are ever listed or served.

import type { Asset, AssetDownload } from "@app/api-client";
import { type AssetStore, assetStoreFromEnv } from "@app/assets";
import {
  canAddCrateItems,
  dawFileStem,
  limitsFor,
  normalizeChops,
  RIGHTS_BASIS_LABELS,
  type RightsBasis,
  sidecarFor,
} from "@app/core";
import { type Pool, withTransaction } from "@app/db";
import { ownCrate } from "./crates";
import { env } from "./env";
import { HttpError, limitReached, notFound, proRequired } from "./http";
import { planFor } from "./plan";

export function requireArchive(): void {
  if (!env().flags.FEATURE_CLEARED_LANE) throw notFound("That page");
}

let cachedStore: AssetStore | null | undefined;

export function archiveStore(): AssetStore {
  cachedStore ??= assetStoreFromEnv(env());
  if (!cachedStore)
    throw new HttpError(500, "internal", "The archive's file store isn't configured.");
  return cachedStore;
}

type AssetRow = {
  id: string;
  artist: string;
  title: string;
  year: number | null;
  label: string | null;
  catno: string | null;
  styles: string[];
  duration_s: number | null;
  bpm: number | null;
  camelot_key: string | null;
  wav_key: string;
  preview_key: string;
  preview_type: string;
  peaks_key: string;
  basis: RightsBasis;
  source_url: string;
  license_url: string | null;
  recording_year: number | null;
  date_evidence: Asset["rights"]["dateEvidence"];
  attribution: string | null;
  license_ref: string | null;
  license_expires_at: string | null;
  checked_at: Date;
};

const COLUMNS = `a.id, a.artist, a.title, a.year, a.label, a.catno, a.styles, a.duration_s, a.bpm, a.camelot_key,
  a.wav_key, a.preview_key, a.preview_type, a.peaks_key, r.basis, r.source_url, r.license_url, r.recording_year,
  r.date_evidence, r.attribution, r.license_ref, r.license_expires_at::text, r.checked_at`;

const READY = "a.status = 'ready' and a.wav_key is not null";

/** A browser-fetchable URL: presigned on R2, or the app's own file route for a local store. */
export async function fileUrl(key: string, origin: string, downloadName?: string): Promise<string> {
  const signed = await archiveStore().signedUrl(key, { expiresIn: 3600, downloadName });
  return signed ?? new URL(`/api/v1/archive/files/${key}`, origin).toString();
}

async function toAsset(r: AssetRow, origin: string): Promise<Asset> {
  return {
    id: r.id,
    artist: r.artist,
    title: r.title,
    year: r.year,
    label: r.label,
    catno: r.catno,
    styles: r.styles,
    durationS: r.duration_s,
    bpm: r.bpm,
    camelotKey: r.camelot_key,
    previewUrl: await fileUrl(r.preview_key, origin),
    previewType: r.preview_type,
    peaksUrl: await fileUrl(r.peaks_key, origin),
    rights: {
      basis: r.basis,
      basisLabel: RIGHTS_BASIS_LABELS[r.basis],
      sourceUrl: r.source_url,
      licenseUrl: r.license_url,
      recordingYear: r.recording_year,
      dateEvidence: r.date_evidence,
      attribution: r.attribution,
      checkedAt: r.checked_at.toISOString(),
    },
  };
}

const PAGE = 50;

export async function listAssets(
  pool: Pool,
  origin: string,
  params: { q?: string | null; cursor?: string | null },
): Promise<{ assets: Asset[]; nextCursor: string | null }> {
  const offset = Math.max(0, Number.parseInt(params.cursor ?? "0", 10) || 0);
  const q = params.q?.trim().slice(0, 100) || null;
  const res = await pool.query<AssetRow>(
    `select ${COLUMNS} from assets a join asset_rights r on r.asset_id = a.id
      where ${READY} and ($1::text is null or a.artist ilike '%' || $1 || '%' or a.title ilike '%' || $1 || '%')
      order by a.artist, a.title, a.id limit ${PAGE + 1} offset $2`,
    [q, offset],
  );
  const rows = res.rows.slice(0, PAGE);
  return {
    assets: await Promise.all(rows.map((r) => toAsset(r, origin))),
    nextCursor: res.rows.length > PAGE ? String(offset + PAGE) : null,
  };
}

async function readyRow(pool: Pool, id: string): Promise<AssetRow> {
  const res = await pool.query<AssetRow>(
    `select ${COLUMNS} from assets a join asset_rights r on r.asset_id = a.id where a.id = $1 and ${READY}`,
    [id],
  );
  const row = res.rows[0];
  if (!row) throw notFound("That recording");
  return row;
}

export async function getAsset(pool: Pool, origin: string, id: string): Promise<Asset> {
  return toAsset(await readyRow(pool, id), origin);
}

/** True when the key belongs to a listed asset; master WAVs also need Pro (checked by the caller). */
export async function isServableKey(pool: Pool, assetId: string): Promise<boolean> {
  const res = await pool.query(`select 1 from assets a where a.id = $1 and ${READY}`, [assetId]);
  return res.rowCount === 1;
}

/** Pro: the WAV master's URL, its DAW file name and the rights sidecar. */
export async function assetDownload(
  pool: Pool,
  origin: string,
  userId: string,
  id: string,
  chop: { index: number; startSeconds: number; endSeconds: number } | null,
): Promise<AssetDownload> {
  if ((await planFor(pool, userId)).plan !== "pro") throw proRequired("Downloading WAV files");
  const r = await readyRow(pool, id);
  const track = {
    artist: r.artist,
    title: r.title,
    bpm: r.bpm,
    camelotKey: r.camelot_key,
    year: r.year,
  };
  const fileStem = dawFileStem(track, chop?.index);
  const sidecar = sidecarFor({
    file: `${fileStem}.wav`,
    track,
    chop,
    now: new Date(),
    rights: {
      basis: r.basis,
      sourceUrl: r.source_url,
      licenseUrl: r.license_url,
      recordingYear: r.recording_year,
      dateEvidence: r.date_evidence,
      attribution: r.attribution,
      licenseRef: r.license_ref,
      licenseExpiresAt: r.license_expires_at,
      checkedAt: r.checked_at.toISOString(),
    },
  });
  return { wavUrl: await fileUrl(r.wav_key, origin, `${fileStem}.wav`), fileStem, sidecar };
}

export async function getChops(pool: Pool, userId: string, id: string): Promise<number[]> {
  const res = await pool.query<{ markers: number[] }>(
    "select markers from asset_chops where user_id = $1 and asset_id = $2",
    [userId, id],
  );
  return res.rows[0]?.markers ?? [];
}

export async function saveChops(
  pool: Pool,
  userId: string,
  id: string,
  markers: number[],
): Promise<number[]> {
  const r = await readyRow(pool, id);
  const clean = normalizeChops(markers, r.duration_s ?? Number.POSITIVE_INFINITY);
  await pool.query(
    `insert into asset_chops (user_id, asset_id, markers, updated_at) values ($1, $2, $3, now())
     on conflict (user_id, asset_id) do update set markers = excluded.markers, updated_at = now()`,
    [userId, id, clean],
  );
  return clean;
}

export async function crateAssets(pool: Pool, origin: string, userId: string, crateId: string) {
  await ownCrate(pool, userId, crateId);
  const res = await pool.query<AssetRow & { position: number; added_at: Date }>(
    `select ${COLUMNS}, c.position, c.added_at from crate_assets c
       join assets a on a.id = c.asset_id join asset_rights r on r.asset_id = a.id
      where c.crate_id = $1 and ${READY} order by c.position`,
    [crateId],
  );
  return {
    assets: await Promise.all(
      res.rows.map(async (r) => ({
        ...(await toAsset(r, origin)),
        position: r.position,
        addedAt: r.added_at.toISOString(),
      })),
    ),
  };
}

export async function addCrateAsset(
  pool: Pool,
  origin: string,
  userId: string,
  crateId: string,
  assetId: string,
) {
  await readyRow(pool, assetId);
  const { plan } = await planFor(pool, userId);
  await withTransaction(pool, async (client) => {
    const crate = await client.query(
      "select id from crates where id = $1 and user_id = $2 for update",
      [crateId, userId],
    );
    if (!crate.rowCount) throw notFound("That crate");
    const exists = await client.query(
      "select 1 from crate_assets where crate_id = $1 and asset_id = $2",
      [crateId, assetId],
    );
    if (exists.rowCount) return;
    // Free crate sizes count YouTube records and archive recordings together.
    const count = await client.query<{ n: number }>(
      `select (select count(*) from crate_items where crate_id = $1)::int
            + (select count(*) from crate_assets where crate_id = $1)::int as n`,
      [crateId],
    );
    if (limitsFor(plan).maxItemsPerCrate === 0) throw proRequired("Crates", true);
    if (!canAddCrateItems(plan, count.rows[0]?.n ?? 0))
      throw limitReached(`A crate holds up to ${limitsFor(plan).maxItemsPerCrate} records.`);
    await client.query(
      `insert into crate_assets (crate_id, asset_id, position)
       values ($1, $2, coalesce((select max(position) + 1 from crate_assets where crate_id = $1), 0))`,
      [crateId, assetId],
    );
    await client.query("update crates set updated_at = now() where id = $1", [crateId]);
  });
  return crateAssets(pool, origin, userId, crateId);
}

export async function removeCrateAsset(
  pool: Pool,
  origin: string,
  userId: string,
  crateId: string,
  assetId: string,
) {
  await ownCrate(pool, userId, crateId);
  await pool.query("delete from crate_assets where crate_id = $1 and asset_id = $2", [
    crateId,
    assetId,
  ]);
  return crateAssets(pool, origin, userId, crateId);
}
