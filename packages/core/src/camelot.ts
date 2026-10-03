// Camelot wheel: key names ↔ "8A"-style codes, and harmonically compatible keys.

export type CamelotKey = `${number}${"A" | "B"}`;
export type Mode = "major" | "minor";

export const CAMELOT_PATTERN = /^(1[0-2]|[1-9])([AB])$/;

const PITCH_CLASSES: Record<string, number> = {
  C: 0,
  "B#": 0,
  "C#": 1,
  Db: 1,
  D: 2,
  "D#": 3,
  Eb: 3,
  E: 4,
  Fb: 4,
  "E#": 5,
  F: 5,
  "F#": 6,
  Gb: 6,
  G: 7,
  "G#": 8,
  Ab: 8,
  A: 9,
  "A#": 10,
  Bb: 10,
  B: 11,
  Cb: 11,
};

const MAJOR_NAMES = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
const MINOR_NAMES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "G#", "A", "Bb", "B"];

export function isCamelotKey(value: string): value is CamelotKey {
  return CAMELOT_PATTERN.test(value);
}

function majorNumber(pc: number): number {
  return ((((pc * 7) % 12) + 7) % 12) + 1;
}

/** Camelot code for a tonic pitch class (0 = C) and mode. */
export function camelotFromPitchClass(pitchClass: number, mode: Mode): CamelotKey {
  const pc = ((Math.round(pitchClass) % 12) + 12) % 12;
  if (mode === "major") return `${majorNumber(pc)}B` as CamelotKey;
  return `${majorNumber((pc + 3) % 12)}A` as CamelotKey;
}

function parseCamelot(key: string): { n: number; letter: "A" | "B" } | null {
  const m = CAMELOT_PATTERN.exec(key);
  if (!m) return null;
  return { n: Number(m[1]), letter: m[2] as "A" | "B" };
}

/** Pitch class and mode for a Camelot code. */
export function pitchClassOf(key: CamelotKey): { pitchClass: number; mode: Mode } {
  const parsed = parseCamelot(key);
  if (!parsed) throw new Error(`Invalid Camelot key: ${key}`);
  // Invert majorNumber: n = ((pc*7) % 12 + 7) % 12 + 1  →  pc*7 ≡ n - 8 (mod 12); 7⁻¹ ≡ 7.
  const majorPc = ((((parsed.n - 8) * 7) % 12) + 12) % 12;
  if (parsed.letter === "B") return { pitchClass: majorPc, mode: "major" };
  return { pitchClass: (majorPc + 9) % 12, mode: "minor" };
}

/** "8A" → "A minor", "3B" → "Db major". */
export function camelotToKeyName(key: CamelotKey): string {
  const { pitchClass, mode } = pitchClassOf(key);
  const names = mode === "major" ? MAJOR_NAMES : MINOR_NAMES;
  return `${names[pitchClass]} ${mode}`;
}

/**
 * Parses a musical key name or a Camelot code: "8A", "Am", "A minor", "C#m", "D♭ major",
 * "F♯", "Bbm", "e minor". Returns null when unrecognised.
 */
export function toCamelot(input: string | null | undefined): CamelotKey | null {
  if (!input) return null;
  const raw = input.trim();
  const upper = raw.toUpperCase();
  if (isCamelotKey(upper)) return upper;
  const s = raw.replace(/♯/g, "#").replace(/♭/g, "b").replace(/\s+/g, " ");
  const m = /^([A-Ga-g])([#b]?)\s*(m|M|[Mm]in(?:or)?|[Mm]aj(?:or)?)?$/.exec(s);
  if (!m) return null;
  const note = `${(m[1] ?? "").toUpperCase()}${m[2] ?? ""}`;
  const pc = PITCH_CLASSES[note];
  if (pc === undefined) return null;
  const q = m[3];
  const mode: Mode = q === "m" || /^min/i.test(q ?? "") ? "minor" : "major";
  return camelotFromPitchClass(pc, mode);
}

/** The key itself, its neighbours on the wheel, and its relative major or minor. */
export function compatibleKeys(key: CamelotKey): CamelotKey[] {
  const parsed = parseCamelot(key);
  if (!parsed) throw new Error(`Invalid Camelot key: ${key}`);
  const { n, letter } = parsed;
  const wrap = (x: number) => ((((x - 1) % 12) + 12) % 12) + 1;
  const other = letter === "A" ? "B" : "A";
  return [
    `${n}${letter}`,
    `${wrap(n - 1)}${letter}`,
    `${wrap(n + 1)}${letter}`,
    `${n}${other}`,
  ] as CamelotKey[];
}

export type BpmRange = readonly [number, number];

/**
 * BPM ranges to match. With half/double time on, the range halved and doubled are added,
 * so a 170 BPM drum & bass search also finds 85 BPM entries. Overlapping ranges merge.
 */
export function bpmRanges(from: number, to: number, halfDouble: boolean): BpmRange[] {
  const lo = Math.min(from, to);
  const hi = Math.max(from, to);
  const ranges: BpmRange[] = halfDouble
    ? [
        [lo / 2, hi / 2],
        [lo, hi],
        [lo * 2, hi * 2],
      ]
    : [[lo, hi]];
  const merged: [number, number][] = [];
  for (const [a, b] of [...ranges].sort((x, y) => x[0] - y[0])) {
    const last = merged[merged.length - 1];
    if (last && a <= last[1]) last[1] = Math.max(last[1], b);
    else merged.push([a, b]);
  }
  return merged;
}
