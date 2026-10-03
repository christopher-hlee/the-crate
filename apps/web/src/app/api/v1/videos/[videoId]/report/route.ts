import { ReportRequestSchema, VideoIdSchema } from "@app/api-client";
import { getViewer } from "@/server/auth";
import { db } from "@/server/db";
import { clientIp, json, readJson, route } from "@/server/http";
import { rateLimit } from "@/server/rate-limit";

type Ctx = { params: Promise<{ videoId: string }> };

/** A player error code for a video. The worker's recheck_reported job takes it from here. */
export const POST = route<Ctx>(async (req, { params }) => {
  const videoId = VideoIdSchema.parse((await params).videoId);
  const pool = db();
  const viewer = await getViewer(req);
  await rateLimit(pool, "report", { userId: viewer?.userId, ip: clientIp(req) });
  const { code } = await readJson(req, ReportRequestSchema);
  await pool.query("insert into video_reports (video_id, code, user_id) values ($1, $2, $3)", [
    videoId,
    code,
    viewer?.userId ?? null,
  ]);
  return json({ ok: true }, { status: 202 });
});
