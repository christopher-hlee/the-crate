// Crate sheets: CSV and JSON exports of a crate. Links only: no audio, video or thumbnails.

import { youtubeWatchUrl } from "./youtube-links";

export type CrateSheetRow = {
  artist: string;
  title: string;
  track: string;
  label: string;
  catno: string;
  year: number | null;
  country: string;
  styles: string[];
  bpm: number | null;
  camelotKey: string;
  youtubeUrl: string;
  discogsUrl: string;
  note: string;
};

export const CRATE_SHEET_COLUMNS: readonly (keyof CrateSheetRow)[] = [
  "artist",
  "title",
  "track",
  "label",
  "catno",
  "year",
  "country",
  "styles",
  "bpm",
  "camelotKey",
  "youtubeUrl",
  "discogsUrl",
  "note",
];

export function crateSheetRow(input: {
  artist?: string | null;
  title?: string | null;
  track?: { position: string; title: string } | null;
  label?: string | null;
  catno?: string | null;
  year?: number | null;
  country?: string | null;
  styles?: readonly string[] | null;
  bpm?: number | null;
  camelotKey?: string | null;
  videoId: string;
  discogsUrl: string;
  /** Notes on the video, earliest timestamp first; the first timestamp goes into the URL. */
  notes?: readonly { atSeconds: number | null; body: string }[];
}): CrateSheetRow {
  const stamped = input.notes?.find((n) => n.atSeconds !== null);
  return {
    artist: input.artist ?? "",
    title: input.title ?? "",
    track: input.track ? `${input.track.position}. ${input.track.title}` : "",
    label: input.label ?? "",
    catno: input.catno ?? "",
    year: input.year ?? null,
    country: input.country ?? "",
    styles: [...(input.styles ?? [])],
    bpm: input.bpm ?? null,
    camelotKey: input.camelotKey ?? "",
    youtubeUrl: youtubeWatchUrl(input.videoId, stamped?.atSeconds ?? null),
    discogsUrl: input.discogsUrl,
    note: (input.notes ?? []).map((n) => n.body).join(" | "),
  };
}

function csvCell(value: unknown): string {
  const s = Array.isArray(value)
    ? value.join("; ")
    : value === null || value === undefined
      ? ""
      : String(value);
  // Quote everything that needs it, and neutralise spreadsheet formulas.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) || safe !== s ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function crateSheetCsv(rows: readonly CrateSheetRow[]): string {
  const header = CRATE_SHEET_COLUMNS.join(",");
  const lines = rows.map((r) => CRATE_SHEET_COLUMNS.map((c) => csvCell(r[c])).join(","));
  return `${[header, ...lines].join("\r\n")}\r\n`;
}
