import { CreateNoteRequestSchema, VideoIdSchema } from "@app/api-client";
import { limitsFor } from "@app/core";
import { requireViewer } from "@/server/auth";
import { db } from "@/server/db";
import { clientIp, json, proRequired, readJson, route } from "@/server/http";
import { planFor } from "@/server/plan";
import { rateLimit } from "@/server/rate-limit";

type NoteRow = {
  id: string;
  record_key: string;
  video_id: string;
  at_seconds: number | null;
  body: string;
  created_at: Date;
};

const toNote = (r: NoteRow) => ({
  id: r.id,
  recordKey: r.record_key,
  videoId: r.video_id,
  atSeconds: r.at_seconds,
  body: r.body,
  createdAt: r.created_at.toISOString(),
});

async function requireNotes(req: Request) {
  const viewer = await requireViewer(req);
  const pool = db();
  if (!limitsFor((await planFor(pool, viewer.userId)).plan).notes)
    throw proRequired("Timestamped notes", true);
  return { viewer, pool };
}

export const GET = route(async (req) => {
  const { viewer, pool } = await requireNotes(req);
  const videoId = VideoIdSchema.parse(new URL(req.url).searchParams.get("videoId"));
  const res = await pool.query<NoteRow>(
    `select id, record_key, video_id, at_seconds, body, created_at from notes
      where user_id = $1 and video_id = $2 order by at_seconds asc nulls last, created_at desc`,
    [viewer.userId, videoId],
  );
  return json({ notes: res.rows.map(toNote) }, { headers: { "cache-control": "no-store" } });
});

export const POST = route(async (req) => {
  const { viewer, pool } = await requireNotes(req);
  await rateLimit(pool, "write", { userId: viewer.userId, ip: clientIp(req) });
  const body = await readJson(req, CreateNoteRequestSchema);
  const res = await pool.query<NoteRow>(
    `insert into notes (user_id, record_key, video_id, at_seconds, body) values ($1, $2, $3, $4, $5)
     returning id, record_key, video_id, at_seconds, body, created_at`,
    [viewer.userId, body.recordKey, body.videoId, body.atSeconds ?? null, body.body],
  );
  return json(toNote(res.rows[0] as NoteRow), { status: 201 });
});
