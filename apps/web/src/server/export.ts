import "server-only";
import { type CrateSheetRow, crateSheetCsv, crateSheetRow, discogsUrl } from "@app/core";
import type { Queryable } from "@app/db";
import { crateItems } from "./crates";

/** Crate sheet rows: links and Discogs facts only, never audio, video or thumbnails. */
export async function crateSheet(
  db: Queryable & Parameters<typeof crateItems>[0],
  userId: string,
  crateId: string,
) {
  const items = await crateItems(db, crateId);
  const notes = await db.query<{ video_id: string; at_seconds: number | null; body: string }>(
    `select video_id, at_seconds, body from notes where user_id = $1 and video_id = any($2::text[])
      order by at_seconds asc nulls last, created_at`,
    [userId, items.map((i) => i.videoId)],
  );
  const byVideo = new Map<string, { atSeconds: number | null; body: string }[]>();
  for (const n of notes.rows) {
    const list = byVideo.get(n.video_id) ?? [];
    list.push({ atSeconds: n.at_seconds, body: n.body });
    byVideo.set(n.video_id, list);
  }
  const rows: CrateSheetRow[] = items.map((i) =>
    crateSheetRow({
      artist: i.record?.artist,
      title: i.record?.title,
      track: i.record?.track,
      label: i.record?.label,
      catno: i.record?.catno,
      year: i.record?.year,
      country: i.record?.country,
      styles: i.record?.styles,
      bpm: i.record?.tempo?.bpm,
      camelotKey: i.record?.tempo?.camelotKey,
      videoId: i.videoId,
      discogsUrl: i.discogsUrl || discogsUrl(i.recordKey),
      notes: byVideo.get(i.videoId),
    }),
  );
  return { rows, csv: () => crateSheetCsv(rows) };
}
