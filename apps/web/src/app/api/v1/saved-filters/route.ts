import { SaveFilterRequestSchema } from "@app/api-client";
import { requireViewer } from "@/server/auth";
import { db } from "@/server/db";
import { clientIp, json, readJson, route } from "@/server/http";
import { planFor } from "@/server/plan";
import { rateLimit } from "@/server/rate-limit";
import { listSavedFilters, saveFilter } from "@/server/saved-filters";

export const GET = route(async (req) => {
  const viewer = await requireViewer(req);
  const pool = db();
  await rateLimit(pool, "read", { userId: viewer.userId, ip: clientIp(req) });
  const { plan } = await planFor(pool, viewer.userId);
  return json(await listSavedFilters(pool, viewer.userId, plan), {
    headers: { "cache-control": "no-store" },
  });
});

export const POST = route(async (req) => {
  const viewer = await requireViewer(req);
  const pool = db();
  await rateLimit(pool, "write", { userId: viewer.userId, ip: clientIp(req) });
  const body = await readJson(req, SaveFilterRequestSchema);
  const { plan } = await planFor(pool, viewer.userId);
  return json(await saveFilter(pool, viewer.userId, plan, body), { status: 201 });
});
