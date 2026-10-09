import { UuidSchema } from "@app/api-client";
import { requireViewer } from "@/server/auth";
import { db } from "@/server/db";
import { clientIp, json, route } from "@/server/http";
import { rateLimit } from "@/server/rate-limit";
import { deleteSavedFilter } from "@/server/saved-filters";

type Ctx = { params: Promise<{ id: string }> };

export const DELETE = route<Ctx>(async (req, { params }) => {
  const id = UuidSchema.parse((await params).id);
  const viewer = await requireViewer(req);
  const pool = db();
  await rateLimit(pool, "write", { userId: viewer.userId, ip: clientIp(req) });
  await deleteSavedFilter(pool, viewer.userId, id);
  return json({ deleted: true });
});
