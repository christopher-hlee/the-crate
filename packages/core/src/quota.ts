// YouTube Data API quota resets at midnight Pacific time. These helpers compute the Pacific
// calendar day without Intl (not reliable on every runtime) using the US DST rules:
// DST runs from 02:00 on the second Sunday of March to 02:00 on the first Sunday of November.

const HOUR_MS = 3_600_000;

function nthSundayUtc(year: number, month: number, n: number): number {
  const first = new Date(Date.UTC(year, month, 1));
  const offset = (7 - first.getUTCDay()) % 7;
  return Date.UTC(year, month, 1 + offset + (n - 1) * 7);
}

/** True when US Pacific time is on daylight saving time at this instant. */
export function isPacificDst(at: Date): boolean {
  const y = at.getUTCFullYear();
  // 02:00 PST = 10:00 UTC on the second Sunday of March.
  const start = nthSundayUtc(y, 2, 2) + 10 * HOUR_MS;
  // 02:00 PDT = 09:00 UTC on the first Sunday of November.
  const end = nthSundayUtc(y, 10, 1) + 9 * HOUR_MS;
  const t = at.getTime();
  return t >= start && t < end;
}

export function pacificOffsetHours(at: Date): number {
  return isPacificDst(at) ? -7 : -8;
}

/** The Pacific calendar day (YYYY-MM-DD) an instant falls in: the quota day. */
export function pacificDay(at: Date): string {
  const local = new Date(at.getTime() + pacificOffsetHours(at) * HOUR_MS);
  return local.toISOString().slice(0, 10);
}

/** The next midnight Pacific time after `at`, when the daily quota resets. */
export function nextPacificMidnight(at: Date): Date {
  const local = new Date(at.getTime() + pacificOffsetHours(at) * HOUR_MS);
  const midnightLocal = Date.UTC(
    local.getUTCFullYear(),
    local.getUTCMonth(),
    local.getUTCDate() + 1,
  );
  // Convert back using the offset in force at that local midnight (DST never switches at 00:00).
  const guess = new Date(midnightLocal + 8 * HOUR_MS);
  return new Date(midnightLocal - pacificOffsetHours(guess) * HOUR_MS);
}

/**
 * Units an hourly job may spend now so the day's budget spreads across the hours left.
 * Always allows at least one unit while any budget remains.
 */
export function unitsForThisRun(options: { budget: number; usedToday: number; at: Date }): number {
  const remaining = Math.max(0, options.budget - options.usedToday);
  if (remaining === 0) return 0;
  const hoursLeft = Math.max(
    1,
    Math.ceil((nextPacificMidnight(options.at).getTime() - options.at.getTime()) / HOUR_MS),
  );
  return Math.max(1, Math.floor(remaining / hoursLeft));
}

/** Daily units needed to refresh every ID within the 30-day window (50 IDs per unit). */
export function unitsPerDayForRefresh(uniqueIds: number, idsPerCall = 50, days = 30): number {
  return Math.ceil(uniqueIds / (idsPerCall * days));
}
