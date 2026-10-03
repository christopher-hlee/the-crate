import { PlayRequestSchema } from "@app/api-client";
import { getViewer } from "@/server/auth";
import { db } from "@/server/db";
import { logPlay } from "@/server/history";
import { clientIp, json, readJson, route } from "@/server/http";
import { planFor } from "@/server/plan";
import { rateLimit } from "@/server/rate-limit";

/** Logs a play (after 5 s of playback). Writes history only when signed in. */
export const POST = route(async (req) => {
  const pool = db();
  const viewer = await getViewer(req);
  await rateLimit(pool, "write", { userId: viewer?.userId, ip: clientIp(req) });
  const play = await readJson(req, PlayRequestSchema);
  if (!viewer) return json({ logged: false });
  const { plan } = await planFor(pool, viewer.userId);
  await logPlay(pool, viewer.userId, plan, play);
  return json({ logged: true });
});
