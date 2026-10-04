import { UpdateNoteRequestSchema, UuidSchema } from "@app/api-client";
import { requireViewer } from "@/server/auth";
import { db } from "@/server/db";
import { clientIp, json, notFound, readJson, route } from "@/server/http";
import { rateLimit } from "@/server/rate-limit";

type Ctx = { params: Promise<{ id: string }> };

async function setup(req: Request, params: Ctx["params"]) {
  const id = UuidSchema.parse((await params).id);
  const viewer = await requireViewer(req);
  const pool = db();
  await rateLimit(pool, "write", { userId: viewer.userId, ip: clientIp(req) });
  return { id, viewer, pool };
}

export const PATCH = route<Ctx>(async (req, { params }) => {
  const { id, viewer, pool } = await setup(req, params);
  const body = await readJson(req, UpdateNoteRequestSchema);
  const res = await pool.query(
    `update notes set body = coalesce($3, body),
            at_seconds = case when $4::boolean then $5::int else at_seconds end
      where id = $1 and user_id = $2`,
    [id, viewer.userId, body.body ?? null, body.atSeconds !== undefined, body.atSeconds ?? null],
  );
  if (!res.rowCount) throw notFound("That note");
  return json({ ok: true });
});

export const DELETE = route<Ctx>(async (req, { params }) => {
  const { id, viewer, pool } = await setup(req, params);
  const res = await pool.query("delete from notes where id = $1 and user_id = $2", [
    id,
    viewer.userId,
  ]);
  if (!res.rowCount) throw notFound("That note");
  return json({ deleted: true });
});
