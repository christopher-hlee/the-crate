import { CrateAssetRequestSchema, UuidSchema } from "@app/api-client";
import { addCrateAsset, crateAssets, removeCrateAsset, requireArchive } from "@/server/archive";
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
  return json(await crateAssets(pool, req.url, viewer.userId, id), {
    headers: { "cache-control": "no-store" },
  });
});

export const POST = route<Ctx>(async (req, { params }) => {
  const { id, viewer, pool } = await setup(req, params, "write");
  const { assetId } = await readJson(req, CrateAssetRequestSchema);
  return json(await addCrateAsset(pool, req.url, viewer.userId, id, assetId), { status: 201 });
});

export const DELETE = route<Ctx>(async (req, { params }) => {
  const { id, viewer, pool } = await setup(req, params, "write");
  const assetId = UuidSchema.parse(new URL(req.url).searchParams.get("assetId"));
  return json(await removeCrateAsset(pool, req.url, viewer.userId, id, assetId));
});
