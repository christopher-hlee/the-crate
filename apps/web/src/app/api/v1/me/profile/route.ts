import { ProfileRequestSchema } from "@app/api-client";
import { displayNameProblem } from "@app/core";
import { requireViewer } from "@/server/auth";
import { setDisplayName } from "@/server/community";
import { db } from "@/server/db";
import { badRequest, clientIp, json, readJson, route } from "@/server/http";
import { rateLimit } from "@/server/rate-limit";

export const PUT = route(async (req) => {
  const viewer = await requireViewer(req);
  const pool = db();
  await rateLimit(pool, "write", { userId: viewer.userId, ip: clientIp(req) });
  const raw = await req
    .clone()
    .json()
    .catch(() => null);
  const problem = displayNameProblem(
    String((raw as { displayName?: unknown } | null)?.displayName ?? ""),
  );
  if (problem) throw badRequest(problem);
  const { displayName } = await readJson(req, ProfileRequestSchema);
  return json(await setDisplayName(pool, viewer.userId, displayName));
});
