import { randomBytes } from "node:crypto";
import { UuidSchema } from "@app/api-client";
import { requireViewer } from "@/server/auth";
import { getCrate } from "@/server/crates";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { clientIp, json, notFound, proRequired, route } from "@/server/http";
import { planFor } from "@/server/plan";
import { rateLimit } from "@/server/rate-limit";

type Ctx = { params: Promise<{ id: string }> };

async function setup(req: Request, params: Ctx["params"]) {
  const id = UuidSchema.parse((await params).id);
  const viewer = await requireViewer(req);
  const pool = db();
  await rateLimit(pool, "write", { userId: viewer.userId, ip: clientIp(req) });
  if ((await planFor(pool, viewer.userId)).plan !== "pro") throw proRequired("Share links", true);
  return { id, viewer, pool };
}

/** Creates (or returns) the crate's share link. */
export const POST = route<Ctx>(async (req, { params }) => {
  const { id, viewer, pool } = await setup(req, params);
  const shareId = randomBytes(9).toString("base64url");
  const res = await pool.query<{ share_id: string }>(
    `update crates set share_id = coalesce(share_id, $3), updated_at = now()
      where id = $1 and user_id = $2 returning share_id`,
    [id, viewer.userId, shareId],
  );
  const row = res.rows[0];
  if (!row) throw notFound("That crate");
  const origin = env().NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
  return json({ shareId: row.share_id, url: `${origin}/shared/${row.share_id}` });
});

/** Revokes the share link; the old URL stops working. */
export const DELETE = route<Ctx>(async (req, { params }) => {
  const { id, viewer, pool } = await setup(req, params);
  await pool.query(
    "update crates set share_id = null, updated_at = now() where id = $1 and user_id = $2",
    [id, viewer.userId],
  );
  return json((await getCrate(pool, viewer.userId, id)).crate);
});
