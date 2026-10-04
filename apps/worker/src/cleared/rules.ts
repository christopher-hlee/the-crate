// The rights rules in force, the January 1 rollover, and rechecks of every listed asset.

import {
  checkRights,
  effectivePdCutoff,
  type RightsRecord,
  usRecordingPdCutoffYear,
} from "@app/core";
import type { Pool } from "@app/db";

export async function storedCutoff(
  pool: Pool,
): Promise<{ year: number | null; autoAdvance: boolean }> {
  const { rows } = await pool.query<{ us_pd_cutoff_year: number | null; auto_advance: boolean }>(
    "select us_pd_cutoff_year, auto_advance from rights_rules where id = 1",
  );
  const row = rows[0];
  return { year: row?.us_pd_cutoff_year ?? null, autoAdvance: row?.auto_advance ?? true };
}

export async function cutoffInForce(pool: Pool, now: Date): Promise<number | null> {
  return effectivePdCutoff((await storedCutoff(pool)).year, now);
}

type RightsRow = {
  asset_id: string;
  status: string;
  wav_key: string | null;
  basis: RightsRecord["basis"];
  source_url: string;
  license_url: string | null;
  recording_year: number | null;
  date_evidence: RightsRecord["dateEvidence"];
  attribution: string | null;
  license_ref: string | null;
  license_expires_at: string | null;
};

export function rightsFromRow(r: RightsRow): RightsRecord {
  return {
    basis: r.basis,
    sourceUrl: r.source_url,
    licenseUrl: r.license_url,
    recordingYear: r.recording_year,
    dateEvidence: r.date_evidence,
    attribution: r.attribution,
    licenseRef: r.license_ref,
    licenseExpiresAt: r.license_expires_at,
  };
}

/** Re-applies the rules to every ready or held asset: held ones that now pass are released, ready ones that fail are pulled. */
export async function recheckRights(
  pool: Pool,
  now: Date,
): Promise<{ released: number; pulled: number; checked: number }> {
  const cutoff = await cutoffInForce(pool, now);
  const { rows } = await pool.query<RightsRow>(
    `select a.id as asset_id, a.status, a.wav_key, r.basis, r.source_url, r.license_url, r.recording_year,
            r.date_evidence, r.attribution, r.license_ref, r.license_expires_at::text
       from assets a join asset_rights r on r.asset_id = a.id
      where a.status in ('ready', 'held')`,
  );
  let released = 0;
  let pulled = 0;
  for (const row of rows) {
    const result = checkRights(rightsFromRow(row), { usPdCutoffYear: cutoff, now });
    const next = result.ok
      ? row.wav_key
        ? "ready"
        : "pending"
      : "held" in result
        ? "held"
        : "rejected";
    await pool.query(
      "update asset_rights set checked_at = $2, rules_cutoff_year = $3, problems = $4 where asset_id = $1",
      [row.asset_id, now, cutoff, result.problems],
    );
    if (next !== row.status) {
      await pool.query(
        "update assets set status = $2, status_reason = $3, updated_at = $4 where id = $1",
        [row.asset_id, next, result.problems.join(" ") || null, now],
      );
      if (next === "ready") released++;
      else pulled++;
    }
  }
  return { released, pulled, checked: rows.length };
}

/**
 * pd_rollover: on January 1 a new year of US recordings enters the public domain. Advances the
 * stored cutoff to the legal one (unless it is held back by hand), releases held assets from
 * that year, and drafts a changelog entry. Safe to run any day: it only ever moves forward.
 */
export async function runPdRollover(pool: Pool, now: Date) {
  const legal = usRecordingPdCutoffYear(now);
  const stored = await storedCutoff(pool);
  let advanced: { from: number | null; to: number } | null = null;
  if (stored.autoAdvance && legal !== null && (stored.year === null || stored.year < legal)) {
    await pool.query(
      `insert into rights_rules (id, us_pd_cutoff_year, updated_at) values (1, $1, $2)
       on conflict (id) do update set us_pd_cutoff_year = excluded.us_pd_cutoff_year, updated_at = excluded.updated_at`,
      [legal, now],
    );
    advanced = { from: stored.year, to: legal };
  }
  const recheck = await recheckRights(pool, now);
  // The first run only initialises the rules; later advances are news.
  if (advanced && advanced.from !== null) {
    const years =
      advanced.to - advanced.from === 1
        ? String(advanced.to)
        : `${advanced.from + 1}–${advanced.to}`;
    await pool.query(
      "insert into changelog_entries (kind, title, body, draft) values ('data', $1, $2, true)",
      [
        `Recordings from ${years} are now in the US public domain`,
        `US sound recordings published in ${years} entered the public domain on January 1. ${recheck.released} held recording${recheck.released === 1 ? "" : "s"} joined the cleared lane.`,
      ],
    );
  }
  return { cutoff: await cutoffInForce(pool, now), advanced, ...recheck };
}
