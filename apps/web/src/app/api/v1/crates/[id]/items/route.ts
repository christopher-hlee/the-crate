import {
  AddCrateItemRequestSchema,
  ItemRefSchema,
  ReorderCrateItemsRequestSchema,
  UuidSchema,
} from "@app/api-client";
import { requireViewer } from "@/server/auth";
import { addItem, removeItem, reorderItems } from "@/server/crates";
import { db } from "@/server/db";
import { clientIp, json, readJson, route } from "@/server/http";
import { planFor } from "@/server/plan";
import { rateLimit } from "@/server/rate-limit";

type Ctx = { params: Promise<{ id: string }> };

async function setup(req: Request, params: Ctx["params"]) {
  const id = UuidSchema.parse((await params).id);
  const viewer = await requireViewer(req);
  const pool = db();
  await rateLimit(pool, "write", { userId: viewer.userId, ip: clientIp(req) });
  return { id, viewer, pool };
}

export const POST = route<Ctx>(async (req, { params }) => {
  const { id, viewer, pool } = await setup(req, params);
  const ref = await readJson(req, AddCrateItemRequestSchema);
  const { plan } = await planFor(pool, viewer.userId);
  return json(await addItem(pool, viewer.userId, plan, id, ref), { status: 201 });
});

export const PATCH = route<Ctx>(async (req, { params }) => {
  const { id, viewer, pool } = await setup(req, params);
  const { order } = await readJson(req, ReorderCrateItemsRequestSchema);
  return json(await reorderItems(pool, viewer.userId, id, order));
});

export const DELETE = route<Ctx>(async (req, { params }) => {
  const { id, viewer, pool } = await setup(req, params);
  const q = new URL(req.url).searchParams;
  const ref = ItemRefSchema.parse({ recordKey: q.get("recordKey"), videoId: q.get("videoId") });
  return json(await removeItem(pool, viewer.userId, id, ref));
});
