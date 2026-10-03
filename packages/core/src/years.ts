// Release years from Discogs' <released> element ("1999-03-00", "1999", "").

export const MIN_YEAR = 1860;
export const MAX_YEAR = 2100;

export function parseReleasedYear(value: string | null | undefined): number | null {
  if (!value) return null;
  const m = /^(\d{4})(?:$|-)/.exec(value.trim());
  if (!m) return null;
  const year = Number(m[1]);
  return year >= MIN_YEAR && year <= MAX_YEAR ? year : null;
}

export function decadeOf(year: number): number {
  return Math.floor(year / 10) * 10;
}

/** "1990s" for 1994. */
export function decadeLabel(year: number): string {
  return `${decadeOf(year)}s`;
}
