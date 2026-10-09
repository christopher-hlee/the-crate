import { requireViewer } from "@/server/auth";
import { myComments } from "@/server/community";
import { db } from "@/server/db";
import { clientIp, json, route } from "@/server/http";
import { rateLimit } from "@/server/rate-limit";

export const GET = route(async (req) => {
  const viewer = await requireViewer(req);
  const pool = db();
  await rateLimit(pool, "read", { userId: viewer.userId, ip: clientIp(req) });
  return json(
    { comments: await myComments(pool, viewer.userId) },
    { headers: { "cache-control": "no-store" } },
  );
});
