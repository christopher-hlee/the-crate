import "server-only";
import type { SavedFilter } from "@app/api-client";
import {
  CHANNEL_SCOPE_NOT_SAVED,
  type Filters,
  FiltersSchema,
  hasChannelScope,
  limitsFor,
  normalizeFilters,
  type Plan,
  persistableFilters,
  proFiltersUsed,
} from "@app/core";
import { type Pool, withTransaction } from "@app/db";
import { badRequest, limitReached, notFound, PRO_FILTERS_MESSAGE, proRequired } from "./http";

type Row = { id: string; name: string; filters: unknown; created_at: Date };

const toSaved = (r: Row): SavedFilter | null => {
  const parsed = FiltersSchema.safeParse(r.filters);
  return parsed.success
    ? { id: r.id, name: r.name, filters: parsed.data, createdAt: r.created_at.toISOString() }
    : null;
};

export async function listSavedFilters(db: Pool, userId: string, plan: Plan) {
  const res = await db.query<Row>(
    "select id, name, filters, created_at from saved_filters where user_id = $1 order by name",
    [userId],
  );
  return {
    items: res.rows.map(toSaved).filter((x): x is SavedFilter => x !== null),
    max: limitsFor(plan).maxSavedFilters,
  };
}

/**
 * Saves (or replaces, by name) a filter preset. Presets with Pro filters need Pro. A channel
 * scope is refused rather than dropped (YouTube API data, kept 30 days at most), so a preset
 * never quietly means something broader than the dig it was saved from.
 */
export async function saveFilter(
  db: Pool,
  userId: string,
  plan: Plan,
  req: { name: string; filters: Filters },
): Promise<SavedFilter> {
  if (proFiltersUsed(normalizeFilters(req.filters)).length > 0 && !limitsFor(plan).proFilters)
    throw proRequired(PRO_FILTERS_MESSAGE, true);
  if (hasChannelScope(req.filters)) throw badRequest(CHANNEL_SCOPE_NOT_SAVED);
  const filters = persistableFilters(req.filters);
  const row = await withTransaction(db, async (client) => {
    await client.query("select pg_advisory_xact_lock(hashtextextended($1, 13))", [userId]);
    const existing = await client.query(
      "select 1 from saved_filters where user_id = $1 and name = $2",
      [userId, req.name],
    );
    if (!existing.rowCount) {
      const n = (
        await client.query<{ n: number }>(
          "select count(*)::int as n from saved_filters where user_id = $1",
          [userId],
        )
      ).rows[0]?.n;
      const max = limitsFor(plan).maxSavedFilters;
      if ((n ?? 0) >= max) throw limitReached(`You can keep up to ${max} saved filters.`);
    }
    const res = await client.query<Row>(
      `insert into saved_filters (user_id, name, filters) values ($1, $2, $3)
       on conflict (user_id, name) do update set filters = excluded.filters
       returning id, name, filters, created_at`,
      [userId, req.name, JSON.stringify(filters)],
    );
    return res.rows[0] as Row;
  });
  return toSaved(row) as SavedFilter;
}

export async function deleteSavedFilter(db: Pool, userId: string, id: string): Promise<void> {
  const res = await db.query("delete from saved_filters where id = $1 and user_id = $2", [
    id,
    userId,
  ]);
  if (!res.rowCount) throw notFound("That saved filter");
}
