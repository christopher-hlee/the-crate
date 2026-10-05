import "server-only";
import type { Queryable } from "@app/db";
import type { MetadataRoute } from "next";
import { cacheGet, cacheSet } from "./cache";
import { db } from "./db";
import { env } from "./env";

// robots.txt and the sitemaps. Sitemaps list our own pages only: record pages by record key
// (Discogs data) and the static pages. No YouTube API data (titles, thumbnails, video IDs or
// view counts) ever goes in one (rule 7).

/** Search engines read at most 50,000 URLs per sitemap file. */
export const SITEMAP_MAX_URLS = 50_000;

export const STATIC_SITEMAP_PATHS = [
  "/",
  "/daily",
  "/changelog",
  "/legal/terms",
  "/legal/privacy",
  "/legal/attribution",
] as const;

export const ROBOTS_ALLOW = ["/", "/records/", "/daily", "/changelog", "/legal"];
export const ROBOTS_DISALLOW = [
  "/api",
  "/auth",
  "/account",
  "/login",
  "/crates",
  "/favorites",
  "/history",
  "/for-you",
];

/** File 0 also carries the static pages, so it holds that many fewer records. */
export const SITEMAP_LAYOUT = {
  first: SITEMAP_MAX_URLS - STATIC_SITEMAP_PATHS.length,
  size: SITEMAP_MAX_URLS,
} as const;

export type SitemapLayout = { first: number; size: number };

const STARTS_CACHE_KEY = "sitemap:starts:v1";
const STARTS_TTL_SECONDS = 6 * 60 * 60;

/** The public origin, from NEXT_PUBLIC_APP_URL, without a trailing slash. */
export function siteUrl(): string {
  return (env().NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}

/**
 * The first record key of each sitemap file, in record_key order. Each file is then one
 * keyset range on the record_videos primary key, with no OFFSET scans.
 */
export async function computeSitemapStarts(
  q: Queryable,
  layout: SitemapLayout = SITEMAP_LAYOUT,
): Promise<string[]> {
  const res = await q.query<{ record_key: string }>(
    `select record_key from (
       select record_key, row_number() over (order by record_key) - 1 as n
         from record_videos where playable group by record_key
     ) r
     where n = 0 or (n >= $1 and (n - $1) % $2 = 0)
     order by record_key`,
    [layout.first, layout.size],
  );
  return res.rows.map((r) => r.record_key);
}

/** The record keys in sitemap file `id`: playable records from its start to the next file's. */
export async function sitemapRecordKeys(
  q: Queryable,
  starts: readonly string[],
  id: number,
  layout: SitemapLayout = SITEMAP_LAYOUT,
): Promise<string[]> {
  const from = starts[id];
  if (from === undefined) return [];
  const res = await q.query<{ record_key: string }>(
    `select distinct record_key from record_videos
      where playable and record_key >= $1 and ($2::text is null or record_key < $2)
      order by record_key limit $3`,
    [from, starts[id + 1] ?? null, id === 0 ? layout.first : layout.size],
  );
  return res.rows.map((r) => r.record_key);
}

/**
 * Sitemap file starts, cached in Postgres for a few hours. Empty without a database (e.g. a
 * build with no DATABASE_URL) or when the catalog can't be read: then only the static pages
 * are listed.
 */
async function cachedStarts(): Promise<string[]> {
  if (!process.env.DATABASE_URL?.trim()) return [];
  try {
    const pool = db();
    const cached = await cacheGet<{ starts: string[] }>(pool, STARTS_CACHE_KEY);
    if (cached) return cached.starts;
    const starts = await computeSitemapStarts(pool);
    if (starts.length > 0) await cacheSet(pool, STARTS_CACHE_KEY, { starts }, STARTS_TTL_SECONDS);
    return starts;
  } catch (err) {
    console.error("sitemap: catalog unavailable, listing static pages only", err);
    return [];
  }
}

/** One id per sitemap file; there is always file 0, with the static pages. */
export async function sitemapIds(): Promise<{ id: number }[]> {
  const files = Math.max(1, (await cachedStarts()).length);
  return Array.from({ length: files }, (_, id) => ({ id }));
}

export async function sitemapEntries(id: number): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const out: MetadataRoute.Sitemap =
    id === 0 ? STATIC_SITEMAP_PATHS.map((p) => ({ url: `${base}${p}` })) : [];
  const starts = await cachedStarts();
  if (starts[id] === undefined) return out;
  try {
    for (const key of await sitemapRecordKeys(db(), starts, id)) {
      out.push({ url: `${base}/records/${encodeURIComponent(key)}` });
    }
  } catch (err) {
    console.error(`sitemap ${id}: catalog unavailable`, err);
  }
  return out;
}

export async function robotsFile(): Promise<MetadataRoute.Robots> {
  const base = siteUrl();
  return {
    rules: { userAgent: "*", allow: ROBOTS_ALLOW, disallow: ROBOTS_DISALLOW },
    sitemap: (await sitemapIds()).map(({ id }) => `${base}/sitemap/${id}.xml`),
  };
}
