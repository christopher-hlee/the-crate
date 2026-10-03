import "server-only";
import type { CatalogItem, RecordDetail, RecordSummary } from "@app/api-client";
import { discogsUrl, stripDiscogsSuffix } from "@app/core";
import type { ArtistJson, FormatJson, LabelJson, Queryable, TrackJson } from "@app/db";

type ReleaseRow = {
  id: number;
  title: string;
  artists: ArtistJson[];
  artist_display: string;
  labels: LabelJson[];
  formats: FormatJson[];
  tracklist: TrackJson[];
};

type RvRow = {
  video_id: string;
  track_position: string | null;
  track_title: string | null;
  bpm: number | null;
  camelot_key: string | null;
  tempo_source: string | null;
  pressings: number;
  year: number | null;
  country: string | null;
  genres: string[];
  styles: string[];
  playable: boolean;
};

function tempo(r: { bpm: number | null; camelot_key: string | null; tempo_source: string | null }) {
  return r.bpm !== null
    ? {
        bpm: Math.round(r.bpm * 10) / 10,
        camelotKey: r.camelot_key,
        source: r.tempo_source ?? "unknown",
      }
    : null;
}

function track(r: { track_position: string | null; track_title: string | null }) {
  return r.track_position && r.track_title
    ? { position: r.track_position, title: r.track_title }
    : null;
}

/** The record panel: release details, tracklist and the record's playable videos. */
export async function getRecord(db: Queryable, recordKey: string): Promise<RecordDetail | null> {
  const [rel, rvs] = await Promise.all([
    db.query<ReleaseRow>(
      `select id, title, artists, artist_display, labels, formats, tracklist from releases
        where record_key = $1 order by is_main_release desc, year asc nulls last, id limit 1`,
      [recordKey],
    ),
    db.query<RvRow>(
      `select video_id, track_position, track_title, bpm, camelot_key, tempo_source, pressings, year,
              country, genres, styles, playable
         from record_videos where record_key = $1
        order by track_position asc nulls last, video_id`,
      [recordKey],
    ),
  ]);
  const release = rel.rows[0];
  const facts = rvs.rows[0];
  if (!release || !facts) return null;
  return {
    recordKey,
    discogsUrl: discogsUrl(recordKey),
    title: release.title,
    artist: release.artist_display,
    artists: release.artists.map((a) => ({ id: a.id, name: a.anv || stripDiscogsSuffix(a.name) })),
    labels: release.labels.map((l) => ({
      id: l.id,
      name: stripDiscogsSuffix(l.name),
      catno: l.catno,
    })),
    year: facts.year,
    country: facts.country,
    genres: facts.genres,
    styles: facts.styles,
    formats: release.formats.map((f) => ({ name: f.name, descriptions: f.descriptions })),
    pressings: facts.pressings,
    tracklist: release.tracklist.map((t) => ({
      position: t.position,
      title: t.title,
      durationS: t.duration_s,
    })),
    videos: rvs.rows
      .filter((r) => r.playable)
      .map((r) => ({ videoId: r.video_id, track: track(r), tempo: tempo(r) })),
  };
}

type SummaryRow = {
  record_key: string;
  video_id: string;
  title: string;
  artist_display: string;
  label_name: string | null;
  catno: string | null;
  year: number | null;
  country: string | null;
  styles: string[];
  track_position: string | null;
  track_title: string | null;
  bpm: number | null;
  camelot_key: string | null;
  tempo_source: string | null;
  playable: boolean;
};

function summary(r: SummaryRow, withTrack: boolean): RecordSummary {
  return {
    title: r.title,
    artist: r.artist_display,
    label: r.label_name,
    catno: r.catno,
    year: r.year,
    country: r.country,
    styles: r.styles,
    track: withTrack ? track(r) : null,
    tempo: withTrack ? tempo(r) : null,
  };
}

/**
 * Summaries for saved (record, video) pairs. Crates and history keep keys only, so a pair
 * whose record left the catalog comes back with `available: false` and no summary.
 */
export async function catalogItems(
  db: Queryable,
  refs: readonly { recordKey: string; videoId: string }[],
): Promise<Map<string, CatalogItem>> {
  const out = new Map<string, CatalogItem>();
  if (refs.length === 0) return out;
  const keys = refs.map((r) => r.recordKey);
  const vids = refs.map((r) => r.videoId);
  const exact = await db.query<SummaryRow>(
    `select rv.record_key, rv.video_id, rv.title, rv.artist_display, rv.label_name, rv.catno, rv.year,
            rv.country, rv.styles, rv.track_position, rv.track_title, rv.bpm, rv.camelot_key,
            rv.tempo_source, rv.playable
       from record_videos rv
       join unnest($1::text[], $2::text[]) as ref(record_key, video_id)
         on ref.record_key = rv.record_key and ref.video_id = rv.video_id`,
    [keys, vids],
  );
  for (const r of exact.rows) {
    out.set(`${r.record_key}/${r.video_id}`, {
      recordKey: r.record_key,
      videoId: r.video_id,
      discogsUrl: discogsUrl(r.record_key),
      available: r.playable,
      record: summary(r, true),
    });
  }
  const missing = refs.filter((r) => !out.has(`${r.recordKey}/${r.videoId}`));
  if (missing.length > 0) {
    // The video left but the record may still be here: show the record, marked unavailable.
    const records = await db.query<SummaryRow>(
      `select distinct on (record_key) record_key, video_id, title, artist_display, label_name, catno,
              year, country, styles, track_position, track_title, bpm, camelot_key, tempo_source, playable
         from record_videos where record_key = any($1::text[]) order by record_key, video_id`,
      [[...new Set(missing.map((m) => m.recordKey))]],
    );
    const byRecord = new Map(records.rows.map((r) => [r.record_key, r]));
    for (const m of missing) {
      const r = byRecord.get(m.recordKey);
      out.set(`${m.recordKey}/${m.videoId}`, {
        recordKey: m.recordKey,
        videoId: m.videoId,
        discogsUrl: discogsUrl(m.recordKey),
        available: false,
        record: r ? summary(r, false) : null,
      });
    }
  }
  return out;
}
