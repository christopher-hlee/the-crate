import "server-only";
import type { CatalogItem, SequenceResponse } from "@app/api-client";
import { CACHE_TTL, type Filters, filterHash, SEEDED_PAGE_SIZE } from "@app/core";
import { buildSeededQuery, type Queryable } from "@app/db";
import { cacheGet, cacheSet } from "./cache";
import { catalogItems } from "./records";

type Ref = [string, string];

/**
 * One page of a seeded order. The first 500 picks per filter hash and seed are cached for 24
 * hours (hashing a broad filter set takes a second or more); later pages run live.
 */
export async function seededPage(
  db: Queryable,
  filters: Filters,
  seed: number,
  page: number,
): Promise<SequenceResponse> {
  const start = page * SEEDED_PAGE_SIZE;
  let refs: Ref[];
  let hasMore: boolean;
  if (start + SEEDED_PAGE_SIZE <= CACHE_TTL.seededPicksCached) {
    const key = `seq:v1:${filterHash(filters)}:${seed}`;
    let head = (await cacheGet<{ items: Ref[] }>(db, key))?.items;
    if (!head) {
      const q = buildSeededQuery(filters, {
        seed,
        limit: CACHE_TTL.seededPicksCached + 1,
        offset: 0,
      });
      const res = await db.query<{ record_key: string; video_id: string }>(q.text, q.values);
      head = res.rows.map((r) => [r.record_key, r.video_id] as Ref);
      await cacheSet(db, key, { items: head }, CACHE_TTL.seededPicksSeconds);
    }
    refs = head.slice(start, start + SEEDED_PAGE_SIZE);
    hasMore = head.length > start + SEEDED_PAGE_SIZE;
  } else {
    const q = buildSeededQuery(filters, { seed, limit: SEEDED_PAGE_SIZE + 1, offset: start });
    const res = await db.query<{ record_key: string; video_id: string }>(q.text, q.values);
    refs = res.rows.slice(0, SEEDED_PAGE_SIZE).map((r) => [r.record_key, r.video_id] as Ref);
    hasMore = res.rows.length > SEEDED_PAGE_SIZE;
  }
  const items = await catalogItems(
    db,
    refs.map(([recordKey, videoId]) => ({ recordKey, videoId })),
  );
  return {
    items: refs
      .map(([rk, vid]) => items.get(`${rk}/${vid}`))
      .filter((x): x is CatalogItem => x !== undefined),
    page,
    hasMore,
    seed,
  };
}
