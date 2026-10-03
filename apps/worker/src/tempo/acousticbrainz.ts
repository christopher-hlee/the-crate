// AcousticBrainz import (Phase 2 spike). AcousticBrainz is frozen; its BPM and key reach a
// Discogs track through MusicBrainz's CC0 Discogs links (release → recording → AcousticBrainz).
// docs/spikes/acousticbrainz.md describes building the mapping; this imports the result.

import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { SOURCE_CONFIDENCE, toCamelot } from "@app/core";
import type { Queryable } from "@app/db";
import { z } from "zod";

const Row = z.object({
  discogs_release_id: z.coerce.number().int().positive(),
  track_position: z.string().min(1).max(20),
  bpm: z.coerce.number().min(20).max(400).optional(),
  key: z.string().optional(),
  scale: z.enum(["major", "minor"]).optional(),
});

export function parseMappingLine(header: string[], line: string): z.infer<typeof Row> | null {
  const cells = line.split(",");
  const obj: Record<string, string> = {};
  header.forEach((h, i) => {
    const v = cells[i]?.trim();
    if (v) obj[h] = v;
  });
  const parsed = Row.safeParse(obj);
  return parsed.success ? parsed.data : null;
}

/** Imports `discogs_release_id,track_position,bpm,key,scale` rows at AcousticBrainz confidence. */
export async function importAcousticBrainz(
  db: Queryable,
  file: string,
): Promise<{ imported: number; skipped: number }> {
  const lines = createInterface({
    input: createReadStream(file),
    crlfDelay: Number.POSITIVE_INFINITY,
  });
  let header: string[] | null = null;
  let imported = 0;
  let skipped = 0;
  for await (const line of lines) {
    if (!header) {
      header = line.split(",").map((h) => h.trim());
      continue;
    }
    const row = parseMappingLine(header, line);
    if (!row) {
      skipped++;
      continue;
    }
    const camelot = row.key ? toCamelot(`${row.key} ${row.scale ?? "major"}`) : null;
    await db.query(
      `insert into track_audio_features (release_id, track_position, source, bpm, camelot_key, confidence, updated_at)
       values ($1, $2, 'acousticbrainz', $3, $4, $5, now())
       on conflict (release_id, track_position, source) do update set bpm = excluded.bpm,
         camelot_key = excluded.camelot_key, confidence = excluded.confidence, updated_at = now()`,
      [
        row.discogs_release_id,
        row.track_position,
        row.bpm ?? null,
        camelot,
        SOURCE_CONFIDENCE.acousticbrainz,
      ],
    );
    imported++;
  }
  return { imported, skipped };
}
