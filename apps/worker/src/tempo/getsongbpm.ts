// GetSongBPM lookups by artist and title. Off unless FEATURE_GETSONGBPM is set: GetSongBPM must
// first confirm that caching is allowed (Gate 3). Once its data appears, the site and both
// store listings link to getsongbpm.com (rule 19), and requests stay under 3,000 an hour.

import { normalizeText, SOURCE_CONFIDENCE, toCamelot } from "@app/core";
import { z } from "zod";

export const GETSONGBPM_SEARCH_URL = "https://api.getsong.co/search/";

const Result = z.object({
  id: z.string().optional(),
  title: z.string(),
  tempo: z.union([z.string(), z.number()]).nullable().optional(),
  key_of: z.string().nullable().optional(),
  artist: z.object({ name: z.string() }).partial().optional(),
});

export const SearchResponseSchema = z.object({
  search: z.union([z.array(Result), z.object({ error: z.string() })]),
});

export type TempoLookup = { bpm: number | null; camelotKey: string | null; confidence: number };

export type FetchJson = (
  url: string,
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export function searchUrl(apiKey: string, artist: string, title: string): string {
  const lookup = `song:${title} artist:${artist}`;
  return `${GETSONGBPM_SEARCH_URL}?api_key=${encodeURIComponent(apiKey)}&type=both&lookup=${encodeURIComponent(lookup)}`;
}

/** Picks the result whose title and artist match the track; null when none does. */
export function pickResult(
  body: z.infer<typeof SearchResponseSchema>,
  artist: string,
  title: string,
): TempoLookup | null {
  if (!Array.isArray(body.search)) return null;
  const t = normalizeText(title);
  const a = normalizeText(artist);
  for (const r of body.search) {
    const rt = normalizeText(r.title);
    const ra = normalizeText(r.artist?.name ?? "");
    const titleOk =
      rt === t || (t.length >= 4 && (rt.startsWith(`${t} `) || t.startsWith(`${rt} `)));
    const artistOk = a !== "" && ra !== "" && (ra === a || ra.includes(a) || a.includes(ra));
    if (!titleOk || !artistOk) continue;
    const bpm = Number(r.tempo);
    return {
      bpm: Number.isFinite(bpm) && bpm >= 20 && bpm <= 400 ? bpm : null,
      camelotKey: toCamelot(r.key_of ?? null),
      confidence: SOURCE_CONFIDENCE.getsongbpm,
    };
  }
  return null;
}

export async function lookupTempo(
  apiKey: string,
  artist: string,
  title: string,
  doFetch: FetchJson = (url) => fetch(url),
): Promise<TempoLookup | null> {
  const res = await doFetch(searchUrl(apiKey, artist, title));
  if (res.status === 429) throw new Error("GetSongBPM rate limit reached");
  if (!res.ok) throw new Error(`GetSongBPM returned HTTP ${res.status}`);
  const parsed = SearchResponseSchema.safeParse(await res.json());
  return parsed.success ? pickResult(parsed.data, artist, title) : null;
}
