// Seeds for seeded crates and the daily dig.

const DAY_MS = 86_400_000;

/** Days since 1970-01-01 UTC: the daily dig's seed. */
export function dailySeed(at: Date): number {
  return Math.floor(at.getTime() / DAY_MS);
}

/** The UTC date a daily seed belongs to, as YYYY-MM-DD. */
export function dailySeedDate(seed: number): string {
  return new Date(seed * DAY_MS).toISOString().slice(0, 10);
}

/** A fresh seed for a new seeded crate: a positive 48-bit integer. */
export function newSeed(random: () => number = Math.random): number {
  return Math.floor(random() * 2 ** 48) + 1;
}

/** Seeds are stored as bigint; keep them inside JavaScript's safe integer range. */
export function isValidSeed(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
