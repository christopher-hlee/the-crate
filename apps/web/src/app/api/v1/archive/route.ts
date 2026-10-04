import { listAssets, requireArchive } from "@/server/archive";
import { getViewer } from "@/server/auth";
import { db } from "@/server/db";
import { clientIp, json, route } from "@/server/http";
import { rateLimit } from "@/server/rate-limit";

export const GET = route(async (req) => {
  requireArchive();
  const pool = db();
  const viewer = await getViewer(req);
  await rateLimit(pool, "read", { userId: viewer?.userId, ip: clientIp(req) });
  const q = new URL(req.url).searchParams;
  return json(await listAssets(pool, req.url, { q: q.get("q"), cursor: q.get("cursor") }), {
    headers: { "cache-control": "no-store" },
  });
});
