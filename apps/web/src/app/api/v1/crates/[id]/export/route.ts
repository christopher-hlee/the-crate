import { UuidSchema } from "@app/api-client";
import { z } from "zod";
import { requireViewer } from "@/server/auth";
import { db } from "@/server/db";
import { crateSheet } from "@/server/export";
import { clientIp, json, notFound, proRequired, route } from "@/server/http";
import { planFor } from "@/server/plan";
import { rateLimit } from "@/server/rate-limit";

type Ctx = { params: Promise<{ id: string }> };
const Format = z.enum(["csv", "json"]);

/** Crate sheet (Pro): links and record facts only. Never audio, video or thumbnails. */
export const GET = route<Ctx>(async (req, { params }) => {
  const id = UuidSchema.parse((await params).id);
  const viewer = await requireViewer(req);
  const pool = db();
  await rateLimit(pool, "read", { userId: viewer.userId, ip: clientIp(req) });
  if ((await planFor(pool, viewer.userId)).plan !== "pro") throw proRequired("Crate sheets", true);
  const format = Format.parse(new URL(req.url).searchParams.get("format") ?? "csv");
  const crate = await pool.query<{ name: string }>(
    "select name from crates where id = $1 and user_id = $2",
    [id, viewer.userId],
  );
  const name = crate.rows[0]?.name;
  if (!name) throw notFound("That crate");
  const sheet = await crateSheet(pool, viewer.userId, id);
  const file =
    name
      .replace(/[^\p{L}\p{N} _-]+/gu, "")
      .trim()
      .slice(0, 60) || "crate";
  if (format === "json") {
    return json(
      { crate: name, exportedAt: new Date().toISOString(), rows: sheet.rows },
      { headers: { "content-disposition": `attachment; filename="${file}.json"` } },
    );
  }
  return new Response(sheet.csv(), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${file}.csv"`,
    },
  });
});
