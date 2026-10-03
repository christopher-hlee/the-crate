// Durations from Discogs ("4:45", "1:02:03") and YouTube (ISO 8601, "PT4M45S").

/** Parses a Discogs track duration. Returns null for empty or malformed values. */
export function parseDiscogsDuration(value: string | null | undefined): number | null {
  if (!value) return null;
  // Hand-rolled: this runs for every track in the dump. Accepts d{1,3}(:d{1,2}){1,2}.
  const v = value.trim();
  let total = 0;
  let field = 0;
  let digits = 0;
  let groups = 0;
  for (let i = 0; i < v.length; i++) {
    const c = v.charCodeAt(i);
    if (c >= 48 && c <= 57) {
      field = field * 10 + (c - 48);
      digits++;
      if (digits > (groups === 0 ? 3 : 2)) return null;
    } else if (c === 58 && digits > 0 && groups < 2) {
      total = total * 60 + field;
      field = 0;
      digits = 0;
      groups++;
    } else {
      return null;
    }
  }
  if (digits === 0 || groups === 0) return null;
  return total * 60 + field;
}

const ISO = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/;

/** Parses an ISO 8601 duration as returned by YouTube's contentDetails.duration. */
export function parseIsoDuration(value: string | null | undefined): number | null {
  if (!value) return null;
  const m = ISO.exec(value.trim());
  if (!m || value.trim() === "P" || value.trim().endsWith("T")) return null;
  const [, d, h, min, s] = m;
  return (
    Number(d ?? 0) * 86400 +
    Number(h ?? 0) * 3600 +
    Number(min ?? 0) * 60 +
    Math.round(Number(s ?? 0))
  );
}

/** "4:05" or "1:02:03" for display. */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}
