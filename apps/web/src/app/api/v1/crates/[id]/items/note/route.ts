import { ItemNoteRequestSchema, UuidSchema } from "@app/api-client";
import { requireViewer } from "@/server/auth";
import { setCrateItemNote } from "@/server/crates";
import { db } from "@/server/db";
import { clientIp, json, readJson, route } from "@/server/http";
import { rateLimit } from "@/server/rate-limit";

type Ctx = { params: Promise<{ id: string }> };

export const PUT = route<Ctx>(async (req, { params }) => {
  const id = UuidSchema.parse((await params).id);
  const viewer = await requireViewer(req);
  const pool = db();
  await rateLimit(pool, "write", { userId: viewer.userId, ip: clientIp(req) });
  const { note, ...ref } = await readJson(req, ItemNoteRequestSchema);
  await setCrateItemNote(pool, viewer.userId, id, ref, note);
  return json({ ok: true });
});
