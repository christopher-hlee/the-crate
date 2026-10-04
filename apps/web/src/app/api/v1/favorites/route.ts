import { ItemNoteRequestSchema, ItemRefSchema } from "@app/api-client";
import { requireViewer } from "@/server/auth";
import { db } from "@/server/db";
import { addFavorite, listFavorites, removeFavorite, setFavoriteNote } from "@/server/favorites";
import { clientIp, json, readJson, route } from "@/server/http";
import { planFor } from "@/server/plan";
import { rateLimit } from "@/server/rate-limit";

async function setup(req: Request, limit: "read" | "write") {
  const viewer = await requireViewer(req);
  const pool = db();
  await rateLimit(pool, limit, { userId: viewer.userId, ip: clientIp(req) });
  return { viewer, pool };
}

export const GET = route(async (req) => {
  const { viewer, pool } = await setup(req, "read");
  const { plan } = await planFor(pool, viewer.userId);
  const cursor = new URL(req.url).searchParams.get("cursor");
  return json(await listFavorites(pool, viewer.userId, plan, cursor), {
    headers: { "cache-control": "no-store" },
  });
});

export const POST = route(async (req) => {
  const { viewer, pool } = await setup(req, "write");
  const ref = await readJson(req, ItemRefSchema);
  const { plan } = await planFor(pool, viewer.userId);
  return json(await addFavorite(pool, viewer.userId, plan, ref), { status: 201 });
});

export const DELETE = route(async (req) => {
  const { viewer, pool } = await setup(req, "write");
  const q = new URL(req.url).searchParams;
  const ref = ItemRefSchema.parse({ recordKey: q.get("recordKey"), videoId: q.get("videoId") });
  return json(await removeFavorite(pool, viewer.userId, ref));
});

export const PATCH = route(async (req) => {
  const { viewer, pool } = await setup(req, "write");
  const { note, ...ref } = await readJson(req, ItemNoteRequestSchema);
  await setFavoriteNote(pool, viewer.userId, ref, note);
  return json({ ok: true });
});
