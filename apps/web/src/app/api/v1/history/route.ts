import { requireViewer } from "@/server/auth";
import { db } from "@/server/db";
import { listHistory } from "@/server/history";
import { badRequest, clientIp, json, route } from "@/server/http";
import { planFor } from "@/server/plan";
import { rateLimit } from "@/server/rate-limit";

export const GET = route(async (req) => {
  const viewer = await requireViewer(req);
  const pool = db();
  await rateLimit(pool, "read", { userId: viewer.userId, ip: clientIp(req) });
  const cursor = new URL(req.url).searchParams.get("cursor");
  if (cursor !== null && Number.isNaN(Date.parse(cursor))) throw badRequest("Invalid cursor");
  const { plan } = await planFor(pool, viewer.userId);
  return json(await listHistory(pool, viewer.userId, plan, cursor), {
    headers: { "cache-control": "no-store" },
  });
});
