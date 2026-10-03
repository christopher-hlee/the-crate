// Finds the newest releases dump on the Discogs data listing. data.discogs.com has no JSON
// index, so this reads whatever the listing returns (an HTML page with links, or the S3
// bucket's XML listing) and pulls out `discogs_YYYYMMDD_releases.xml.gz` names.

export type DumpFile = {
  /** YYYYMMDD as in the file name. */
  stamp: string;
  /** YYYY-MM-DD, the key used by ingest_runs. */
  dumpDate: string;
  releasesUrl: string;
  checksumUrl: string;
};

export const DEFAULT_DUMPS_BASE_URL = "https://data.discogs.com/";

const RELEASES_FILE = /discogs_(\d{8})_releases\.xml\.gz/g;

function ensureTrailingSlash(url: string): string {
  return url.endsWith("/") ? url : `${url}/`;
}

/** The listing page for a year: `?prefix=data/YYYY/` on the dumps site. */
export function listingUrl(baseUrl: string, year: number): string {
  return `${ensureTrailingSlash(baseUrl)}?prefix=data/${year}/`;
}

function resolveFileUrl(body: string, baseUrl: string, year: number, file: string): string {
  const escaped = file.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const linked = new RegExp(`(?:href=["']|<Key>)([^"'<>\\s]*${escaped})`).exec(body);
  const ref = linked?.[1];
  if (ref) return new URL(ref, ensureTrailingSlash(baseUrl)).toString();
  return `${ensureTrailingSlash(baseUrl)}data/${year}/${file}`;
}

function isRealDate(stamp: string): boolean {
  const y = Number(stamp.slice(0, 4));
  const m = Number(stamp.slice(4, 6));
  const d = Number(stamp.slice(6, 8));
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** Every releases dump named in a listing body, newest first. */
export function parseListing(body: string, baseUrl: string, year: number): DumpFile[] {
  const stamps = new Set<string>();
  for (const m of body.matchAll(RELEASES_FILE)) {
    const stamp = m[1];
    if (stamp && isRealDate(stamp)) stamps.add(stamp);
  }
  return [...stamps]
    .sort()
    .reverse()
    .map((stamp) => ({
      stamp,
      dumpDate: `${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)}`,
      releasesUrl: resolveFileUrl(body, baseUrl, year, `discogs_${stamp}_releases.xml.gz`),
      checksumUrl: resolveFileUrl(body, baseUrl, year, `discogs_${stamp}_CHECKSUM.txt`),
    }));
}

export type FetchText = (
  url: string,
) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

/**
 * The newest dump listed for the current year, falling back to the previous year in early
 * January before the first dump of the year appears.
 */
export async function discoverLatestDump(options: {
  baseUrl?: string;
  now?: Date;
  fetch?: FetchText;
}): Promise<DumpFile | null> {
  const baseUrl = options.baseUrl ?? DEFAULT_DUMPS_BASE_URL;
  const now = options.now ?? new Date();
  const doFetch: FetchText = options.fetch ?? ((url) => fetch(url));
  const year = now.getUTCFullYear();
  for (const y of [year, year - 1]) {
    const res = await doFetch(listingUrl(baseUrl, y));
    if (!res.ok) {
      if (res.status === 404) continue;
      throw new Error(`Dump listing for ${y} returned HTTP ${res.status}`);
    }
    const files = parseListing(await res.text(), baseUrl, y);
    if (files[0]) return files[0];
  }
  return null;
}
