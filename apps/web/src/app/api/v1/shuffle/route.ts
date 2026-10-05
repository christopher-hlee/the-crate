import { ShuffleExclusionsSchema } from "@app/api-client";
import { filtersFromSearchParams, proFiltersUsed } from "@app/core";
import { getViewer } from "@/server/auth";
import { db } from "@/server/db";
import { env } from "@/server/env";
import {
  badRequest,
  clientIp,
  filterError,
  json,
  PRO_FILTERS_MESSAGE,
  proRequired,
  queryAll,
  route,
  viewerCountry,
} from "@/server/http";
import { planFor } from "@/server/plan";
import { rateLimit } from "@/server/rate-limit";
import { pickNext } from "@/server/shuffle";

export const GET = route(async (req) => {
  const pool = db();
  const viewer = await getViewer(req);
  await rateLimit(pool, "shuffle", { userId: viewer?.userId, ip: clientIp(req) });
  const all = queryAll(req);
  const parsed = filtersFromSearchParams(all);
  if (!parsed.success) throw badRequest(filterError(parsed.error));
  const exclusions = ShuffleExclusionsSchema.parse({
    session: all("session"),
    seen: all("seen"),
    repeats: all("repeats")[0] === "1",
  });
  if (proFiltersUsed(parsed.data).length > 0) {
    const { plan } = await planFor(pool, viewer?.userId);
    if (plan !== "pro") throw proRequired(PRO_FILTERS_MESSAGE, true);
  }
  const result = await pickNext(pool, {
    filters: parsed.data,
    exclusions,
    userId: viewer?.userId ?? null,
    viewerCountry: viewerCountry(req),
    threshold: env().NARROW_FILTER_THRESHOLD,
  });
  return json(result, { headers: { "cache-control": "no-store" } });
});
