import { requireViewer } from "@/server/auth";
import { db } from "@/server/db";
import { forYou } from "@/server/for-you";
import { clientIp, json, route } from "@/server/http";
import { rateLimit } from "@/server/rate-limit";

export const GET = route(async (req) => {
  const viewer = await requireViewer(req);
  const pool = db();
  await rateLimit(pool, "read", { userId: viewer.userId, ip: clientIp(req) });
  const page = Math.max(
    0,
    Math.min(9, Number.parseInt(new URL(req.url).searchParams.get("page") ?? "0", 10) || 0),
  );
  return json(await forYou(pool, viewer.userId, page), {
    headers: { "cache-control": "no-store" },
  });
});
