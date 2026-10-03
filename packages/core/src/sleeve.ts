// Generated sleeves: label, catalog number, year and styles hashed into a palette and a
// pattern. Records never show Discogs images (rule 16); this gives each one a stable face.

import { hash32 } from "./hash";

export const SLEEVE_PATTERNS = ["rings", "stripes", "grid", "dots", "waves", "blocks"] as const;
export type SleevePattern = (typeof SLEEVE_PATTERNS)[number];

export type SleeveSpec = {
  background: string;
  ink: string;
  accent: string;
  pattern: SleevePattern;
  /** Rotation in degrees for stripes and waves. */
  angle: number;
  /** 3..9: how busy the pattern is. */
  density: number;
  seed: number;
};

export type SleeveInput = {
  label?: string | null;
  catno?: string | null;
  year?: number | null;
  styles?: readonly string[] | null;
};

const hsl = (h: number, s: number, l: number) =>
  `hsl(${Math.round(h) % 360} ${Math.round(s)}% ${Math.round(l)}%)`;

export function sleeveFor(input: SleeveInput): SleeveSpec {
  const key = [
    input.label ?? "",
    input.catno ?? "",
    input.year ?? "",
    ...(input.styles ?? []),
  ].join("|");
  const a = hash32(key, 1);
  const b = hash32(key, 2);
  const hue = a % 360;
  const dark = (b & 1) === 1;
  const sat = 35 + ((a >>> 9) % 35);
  // Decades shift the palette: older records get warmer, dustier sleeves.
  const decadeShift = input.year ? Math.max(-20, Math.min(20, (input.year - 1990) / 2)) : 0;
  const bgL = dark ? 16 + ((b >>> 3) % 14) : 74 + ((b >>> 3) % 14);
  return {
    background: hsl(hue, sat - decadeShift / 2, bgL),
    ink: hsl(hue + 20, sat / 2, dark ? 88 : 14),
    accent: hsl(hue + 150 + ((b >>> 5) % 60), Math.min(90, sat + 25), dark ? 60 : 42),
    pattern: SLEEVE_PATTERNS[(b >>> 8) % SLEEVE_PATTERNS.length] as SleevePattern,
    angle: ((b >>> 12) % 12) * 15,
    density: 3 + ((b >>> 16) % 7),
    seed: a,
  };
}
