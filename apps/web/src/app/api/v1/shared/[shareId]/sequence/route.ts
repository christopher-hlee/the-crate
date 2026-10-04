import { FiltersSchema } from "@app/core";
import { z } from "zod";
import { db } from "@/server/db";
import { clientIp, json, notFound, route } from "@/server/http";
import { rateLimit } from "@/server/rate-limit";
import { seededPage } from "@/server/sequence";

type Ctx = { params: Promise<{ shareId: string }> };
const ShareId = z.string().regex(/^[A-Za-z0-9_-]{8,40}$/);

/** A shared seeded crate's order: anyone can dig the same sequence. */
export const GET = route<Ctx>(async (req, { params }) => {
  const shareId = ShareId.parse((await params).shareId);
  const pool = db();
  await rateLimit(pool, "read", { ip: clientIp(req) });
  const res = await pool.query<{ filters: unknown; seed: number | null }>(
    "select filters, seed from crates where share_id = $1",
    [shareId],
  );
  const row = res.rows[0];
  const filters = row?.filters ? FiltersSchema.safeParse(row.filters) : null;
  if (!row || row.seed === null || !filters?.success) throw notFound("That shared sequence");
  const page = Math.max(
    0,
    Math.min(9, Number.parseInt(new URL(req.url).searchParams.get("page") ?? "0", 10) || 0),
  );
  return json(await seededPage(pool, filters.data, row.seed, page), {
    headers: { "cache-control": "public, max-age=60" },
  });
});
