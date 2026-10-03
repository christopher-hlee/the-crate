import { CreateCrateRequestSchema } from "@app/api-client";
import { limitsFor } from "@app/core";
import { requireViewer } from "@/server/auth";
import { createCrate, listCrates } from "@/server/crates";
import { db } from "@/server/db";
import { clientIp, json, readJson, route } from "@/server/http";
import { planFor } from "@/server/plan";
import { rateLimit } from "@/server/rate-limit";

export const GET = route(async (req) => {
  const viewer = await requireViewer(req);
  const pool = db();
  const { plan } = await planFor(pool, viewer.userId);
  const l = limitsFor(plan);
  return json(
    {
      crates: await listCrates(pool, viewer.userId),
      limits: {
        maxCrates: l.maxCrates,
        maxItemsPerCrate: l.maxItemsPerCrate,
        historyWindow: l.historyWindow,
      },
    },
    { headers: { "cache-control": "no-store" } },
  );
});

export const POST = route(async (req) => {
  const viewer = await requireViewer(req);
  const pool = db();
  await rateLimit(pool, "write", { userId: viewer.userId, ip: clientIp(req) });
  const body = await readJson(req, CreateCrateRequestSchema);
  const { plan } = await planFor(pool, viewer.userId);
  return json(await createCrate(pool, viewer.userId, plan, body), { status: 201 });
});
