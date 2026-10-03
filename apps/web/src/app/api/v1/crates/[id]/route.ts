import { UpdateCrateRequestSchema, UuidSchema } from "@app/api-client";
import { requireViewer } from "@/server/auth";
import { deleteCrate, getCrate, updateCrate } from "@/server/crates";
import { db } from "@/server/db";
import { clientIp, json, readJson, route } from "@/server/http";
import { planFor } from "@/server/plan";
import { rateLimit } from "@/server/rate-limit";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route<Ctx>(async (req, { params }) => {
  const id = UuidSchema.parse((await params).id);
  const viewer = await requireViewer(req);
  return json(await getCrate(db(), viewer.userId, id), {
    headers: { "cache-control": "no-store" },
  });
});

export const PATCH = route<Ctx>(async (req, { params }) => {
  const id = UuidSchema.parse((await params).id);
  const viewer = await requireViewer(req);
  const pool = db();
  await rateLimit(pool, "write", { userId: viewer.userId, ip: clientIp(req) });
  const body = await readJson(req, UpdateCrateRequestSchema);
  const { plan } = await planFor(pool, viewer.userId);
  return json(await updateCrate(pool, viewer.userId, plan, id, body));
});

export const DELETE = route<Ctx>(async (req, { params }) => {
  const id = UuidSchema.parse((await params).id);
  const viewer = await requireViewer(req);
  const pool = db();
  await rateLimit(pool, "write", { userId: viewer.userId, ip: clientIp(req) });
  await deleteCrate(pool, viewer.userId, id);
  return json({ deleted: true });
});
