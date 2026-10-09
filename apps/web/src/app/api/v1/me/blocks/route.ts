import { requireViewer } from "@/server/auth";
import { listBlockedCommenters } from "@/server/community";
import { db } from "@/server/db";
import { clientIp, json, route } from "@/server/http";
import { rateLimit } from "@/server/rate-limit";

/** The commenters the viewer has blocked, by display name. */
export const GET = route(async (req) => {
  const viewer = await requireViewer(req);
  const pool = db();
  await rateLimit(pool, "read", { userId: viewer.userId, ip: clientIp(req) });
  return json(await listBlockedCommenters(pool, viewer.userId), {
    headers: { "cache-control": "no-store" },
  });
});
