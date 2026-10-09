import { UuidSchema } from "@app/api-client";
import { requireViewer } from "@/server/auth";
import { blockCommenter } from "@/server/community";
import { db } from "@/server/db";
import { clientIp, json, route } from "@/server/http";
import { rateLimit } from "@/server/rate-limit";

type Ctx = { params: Promise<{ id: string }> };

/** Blocks this comment's author for the viewer. The response names the block, not the user. */
export const POST = route<Ctx>(async (req, { params }) => {
  const id = UuidSchema.parse((await params).id);
  const viewer = await requireViewer(req);
  const pool = db();
  await rateLimit(pool, "write", { userId: viewer.userId, ip: clientIp(req) });
  return json(await blockCommenter(pool, viewer.userId, id));
});
