import { getViewer } from "@/server/auth";
import { db } from "@/server/db";
import { clientIp, json, route } from "@/server/http";
import { rateLimit } from "@/server/rate-limit";
import { trending } from "@/server/trending";

export const GET = route(async (req) => {
  const pool = db();
  const viewer = await getViewer(req);
  await rateLimit(pool, "read", { userId: viewer?.userId, ip: clientIp(req) });
  return json(await trending(pool), { headers: { "cache-control": "no-store" } });
});
