import { UuidSchema } from "@app/api-client";
import { getAsset, requireArchive } from "@/server/archive";
import { getViewer } from "@/server/auth";
import { db } from "@/server/db";
import { clientIp, json, route } from "@/server/http";
import { rateLimit } from "@/server/rate-limit";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route<Ctx>(async (req, { params }) => {
  requireArchive();
  const id = UuidSchema.parse((await params).id);
  const pool = db();
  const viewer = await getViewer(req);
  await rateLimit(pool, "read", { userId: viewer?.userId, ip: clientIp(req) });
  return json(await getAsset(pool, req.url, id), { headers: { "cache-control": "no-store" } });
});
