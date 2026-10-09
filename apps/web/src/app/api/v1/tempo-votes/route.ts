import { TempoVoteRequestSchema } from "@app/api-client";
import { limitsFor } from "@app/core";
import { requireViewer } from "@/server/auth";
import { db } from "@/server/db";
import { clientIp, json, notFound, proRequired, readJson, route } from "@/server/http";
import { planFor } from "@/server/plan";
import { rateLimit } from "@/server/rate-limit";

/** Tap-tempo or key vote for a track (Pro). pick_audio_features turns votes into estimates. */
export const POST = route(async (req) => {
  const viewer = await requireViewer(req);
  const pool = db();
  await rateLimit(pool, "tempoVote", { userId: viewer.userId, ip: clientIp(req) });
  if (!limitsFor((await planFor(pool, viewer.userId)).plan).tempoVotes)
    throw proRequired("Tempo and key votes", true);
  const vote = await readJson(req, TempoVoteRequestSchema);
  const track = await pool.query(
    "select 1 from record_videos where release_id = $1 and track_position = $2 limit 1",
    [vote.releaseId, vote.trackPosition],
  );
  if (!track.rowCount) throw notFound("That track");
  await pool.query(
    `insert into tempo_votes (user_id, release_id, track_position, bpm, camelot_key) values ($1, $2, $3, $4, $5)
     on conflict (user_id, release_id, track_position)
       do update set bpm = coalesce(excluded.bpm, tempo_votes.bpm),
                     camelot_key = coalesce(excluded.camelot_key, tempo_votes.camelot_key),
                     created_at = now()`,
    [viewer.userId, vote.releaseId, vote.trackPosition, vote.bpm ?? null, vote.camelotKey ?? null],
  );
  return json({ ok: true }, { status: 202 });
});
