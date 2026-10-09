import { ItemRefSchema } from "@app/api-client";
import { requireViewer } from "@/server/auth";
import { db } from "@/server/db";
import { favoriteStatus } from "@/server/favorites";
import { clientIp, json, route } from "@/server/http";
import { rateLimit } from "@/server/rate-limit";

export const GET = route(async (req) => {
  const viewer = await requireViewer(req);
  const pool = db();
  await rateLimit(pool, "read", { userId: viewer.userId, ip: clientIp(req) });
  const q = new URL(req.url).searchParams;
  const ref = ItemRefSchema.parse({ recordKey: q.get("recordKey"), videoId: q.get("videoId") });
  return json(await favoriteStatus(pool, viewer.userId, ref), {
    headers: { "cache-control": "no-store" },
  });
});
