import { LinkSuggestionRequestSchema, RecordKeySchema } from "@app/api-client";
import { extractYouTubeId } from "@app/core";
import { requireViewer } from "@/server/auth";
import { db } from "@/server/db";
import { badRequest, clientIp, json, notFound, readJson, route } from "@/server/http";
import { rateLimit } from "@/server/rate-limit";

type Ctx = { params: Promise<{ recordKey: string }> };

/** Suggest a YouTube link for a record. The worker validates it with videos.list. */
export const POST = route<Ctx>(async (req, { params }) => {
  const recordKey = RecordKeySchema.parse(decodeURIComponent((await params).recordKey));
  const viewer = await requireViewer(req);
  const pool = db();
  await rateLimit(pool, "linkSuggestion", { userId: viewer.userId, ip: clientIp(req) });
  const { url } = await readJson(req, LinkSuggestionRequestSchema);
  const videoId = extractYouTubeId(url);
  if (!videoId) throw badRequest("That isn't a YouTube video link.");
  const exists = await pool.query("select 1 from record_videos where record_key = $1 limit 1", [
    recordKey,
  ]);
  if (!exists.rowCount) throw notFound("That record");
  const res = await pool.query<{ id: string; status: "pending" | "accepted" | "rejected" }>(
    `insert into link_suggestions (user_id, record_key, video_id) values ($1, $2, $3)
     on conflict (user_id, record_key, video_id) do update set user_id = excluded.user_id
     returning id, status`,
    [viewer.userId, recordKey, videoId],
  );
  const row = res.rows[0];
  return json({ id: row?.id, videoId, status: row?.status ?? "pending" }, { status: 202 });
});
