import { UuidSchema } from "@app/api-client";
import { z } from "zod";
import { assetDownload, requireArchive } from "@/server/archive";
import { requireViewer } from "@/server/auth";
import { db } from "@/server/db";
import { clientIp, json, route } from "@/server/http";
import { rateLimit } from "@/server/rate-limit";

type Ctx = { params: Promise<{ id: string }> };

const ChopQuery = z
  .object({
    chop: z.coerce.number().int().min(1).max(100),
    start: z.coerce.number().min(0).max(86_400),
    end: z.coerce.number().min(0).max(86_400),
  })
  .refine((c) => c.end > c.start, "end must be after start");

export const GET = route<Ctx>(async (req, { params }) => {
  requireArchive();
  const id = UuidSchema.parse((await params).id);
  const viewer = await requireViewer(req);
  const pool = db();
  await rateLimit(pool, "read", { userId: viewer.userId, ip: clientIp(req) });
  const q = new URL(req.url).searchParams;
  const chop = q.has("chop")
    ? ChopQuery.parse({ chop: q.get("chop"), start: q.get("start"), end: q.get("end") })
    : null;
  return json(
    await assetDownload(
      pool,
      req.url,
      viewer.userId,
      id,
      chop ? { index: chop.chop, startSeconds: chop.start, endSeconds: chop.end } : null,
    ),
    { headers: { "cache-control": "no-store" } },
  );
});
