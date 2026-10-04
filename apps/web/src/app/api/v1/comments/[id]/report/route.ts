import { UuidSchema } from "@app/api-client";
import { requireViewer } from "@/server/auth";
import { reportComment } from "@/server/community";
import { db } from "@/server/db";
import { clientIp, json, route } from "@/server/http";
import { rateLimit } from "@/server/rate-limit";

type Ctx = { params: Promise<{ id: string }> };

export const POST = route<Ctx>(async (req, { params }) => {
  const id = UuidSchema.parse((await params).id);
  const viewer = await requireViewer(req);
  const pool = db();
  await rateLimit(pool, "report", { userId: viewer.userId, ip: clientIp(req) });
  await reportComment(pool, viewer.userId, id);
  return json({ ok: true });
});
