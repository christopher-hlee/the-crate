import { filtersFromSearchParams, MATCH_COUNT_CAP, proFiltersUsed } from "@app/core";
import { buildCountQuery } from "@app/db";
import { getViewer } from "@/server/auth";
import { db } from "@/server/db";
import {
  badRequest,
  clientIp,
  filterError,
  json,
  proRequired,
  queryAll,
  route,
} from "@/server/http";
import { planFor } from "@/server/plan";
import { rateLimit } from "@/server/rate-limit";

export const GET = route(async (req) => {
  const pool = db();
  const viewer = await getViewer(req);
  await rateLimit(pool, "read", { userId: viewer?.userId, ip: clientIp(req) });
  const parsed = filtersFromSearchParams(queryAll(req));
  if (!parsed.success) throw badRequest(filterError(parsed.error));
  if (proFiltersUsed(parsed.data).length > 0) {
    const { plan } = await planFor(pool, viewer?.userId);
    if (plan !== "pro") throw proRequired("Counting with Pro filters");
  }
  // An estimate for the drawer: region blocks are left out (they cost a probe per row).
  const q = buildCountQuery(parsed.data, { cap: MATCH_COUNT_CAP });
  const row = (await pool.query<{ n: number; with_tempo: number }>(q.text, q.values)).rows[0];
  const n = row?.n ?? 0;
  const capped = n > MATCH_COUNT_CAP;
  return json({
    count: Math.min(n, MATCH_COUNT_CAP),
    capped,
    display: capped ? `${MATCH_COUNT_CAP.toLocaleString("en-US")}+` : n.toLocaleString("en-US"),
    tempoCoverage: n === 0 ? null : Math.round(((row?.with_tempo ?? 0) / n) * 1000) / 1000,
  });
});
