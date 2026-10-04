import { ChopsSchema, UuidSchema } from "@app/api-client";
import { getChops, requireArchive, saveChops } from "@/server/archive";
import { requireViewer } from "@/server/auth";
import { db } from "@/server/db";
import { clientIp, json, readJson, route } from "@/server/http";
import { rateLimit } from "@/server/rate-limit";

type Ctx = { params: Promise<{ id: string }> };

async function setup(req: Request, params: Ctx["params"], limit: "read" | "write") {
  requireArchive();
  const id = UuidSchema.parse((await params).id);
  const viewer = await requireViewer(req);
  const pool = db();
  await rateLimit(pool, limit, { userId: viewer.userId, ip: clientIp(req) });
  return { id, viewer, pool };
}

export const GET = route<Ctx>(async (req, { params }) => {
  const { id, viewer, pool } = await setup(req, params, "read");
  return json(
    { markers: await getChops(pool, viewer.userId, id) },
    { headers: { "cache-control": "no-store" } },
  );
});

export const PUT = route<Ctx>(async (req, { params }) => {
  const { id, viewer, pool } = await setup(req, params, "write");
  const { markers } = await readJson(req, ChopsSchema);
  return json({ markers: await saveChops(pool, viewer.userId, id, markers) });
});
