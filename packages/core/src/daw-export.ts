// File names and sidecars for the cleared-lane DAW folder export:
//   <chosen folder>/<crate name>/Artist - Title [96 BPM 8A].wav  (+ .json sidecar)

import { APP_NAME } from "./config";
import type { RightsRecord } from "./rights";

const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

/** Makes a string safe as one path segment on Windows, macOS and Linux. */
export function safeSegment(input: string, maxLength = 120): string {
  let s = Array.from(input.normalize("NFC"), (ch) =>
    ch.charCodeAt(0) < 32 || ch === "\u007f" ? " " : ch,
  ).join("");
  s = s
    .replace(/[/\\:*?"<>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/, "");
  if (s.length > maxLength)
    s = s
      .slice(0, maxLength)
      .trim()
      .replace(/[. ]+$/, "");
  if (!s) s = "Untitled";
  if (WINDOWS_RESERVED.test(s)) s = `_${s}`;
  return s;
}

export type DawTrack = {
  artist: string;
  title: string;
  bpm?: number | null;
  camelotKey?: string | null;
};

/** `Artist - Title [96 BPM 8A]`, without the extension. */
export function dawFileStem(t: DawTrack, chop?: number): string {
  const tags = [t.bpm ? `${Math.round(t.bpm)} BPM` : null, t.camelotKey || null]
    .filter(Boolean)
    .join(" ");
  const base = `${safeSegment(t.artist, 60)} - ${safeSegment(t.title, 80)}`;
  const withTags = tags ? `${base} [${tags}]` : base;
  return safeSegment(chop === undefined ? withTags : `${withTags} (chop ${chop})`, 180);
}

/** Appends " (2)", " (3)"… to repeated names, case-insensitively (macOS and Windows folders are). */
export function uniqueNames(names: readonly string[]): string[] {
  const seen = new Map<string, number>();
  return names.map((name) => {
    const key = name.toLowerCase();
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);
    if (n === 1) return name;
    let candidate = `${name} (${n})`;
    while (seen.has(candidate.toLowerCase())) candidate = `${candidate}*`;
    seen.set(candidate.toLowerCase(), 1);
    return candidate;
  });
}

export type Sidecar = {
  file: string;
  artist: string;
  title: string;
  year: number | null;
  bpm: number | null;
  camelotKey: string | null;
  chop: { index: number; startSeconds: number; endSeconds: number } | null;
  rights: RightsRecord & { checkedAt: string };
  exportedBy: string;
  exportedAt: string;
};

export function sidecarFor(input: {
  file: string;
  track: DawTrack & { year?: number | null };
  rights: RightsRecord & { checkedAt: string };
  chop?: Sidecar["chop"];
  now: Date;
}): Sidecar {
  return {
    file: input.file,
    artist: input.track.artist,
    title: input.track.title,
    year: input.track.year ?? null,
    bpm: input.track.bpm ?? null,
    camelotKey: input.track.camelotKey ?? null,
    chop: input.chop ?? null,
    rights: input.rights,
    exportedBy: APP_NAME,
    exportedAt: input.now.toISOString(),
  };
}
