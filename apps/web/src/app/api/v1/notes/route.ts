import { CreateNoteRequestSchema, VideoIdSchema } from "@app/api-client";
import { requireViewer } from "@/server/auth";
import { db } from "@/server/db";
import { clientIp, json, readJson, route } from "@/server/http";
import { addNote, listNotes, requireNotes } from "@/server/notes";
import { planFor } from "@/server/plan";
import { rateLimit } from "@/server/rate-limit";

export const GET = route(async (req) => {
  const viewer = await requireViewer(req);
  const pool = db();
  requireNotes((await planFor(pool, viewer.userId)).plan);
  const videoId = VideoIdSchema.parse(new URL(req.url).searchParams.get("videoId"));
  return json(
    { notes: await listNotes(pool, viewer.userId, videoId) },
    { headers: { "cache-control": "no-store" } },
  );
});

export const POST = route(async (req) => {
  const viewer = await requireViewer(req);
  const pool = db();
  const { plan } = await planFor(pool, viewer.userId);
  requireNotes(plan);
  await rateLimit(pool, "write", { userId: viewer.userId, ip: clientIp(req) });
  const body = await readJson(req, CreateNoteRequestSchema);
  return json(await addNote(pool, viewer.userId, plan, body), { status: 201 });
});
