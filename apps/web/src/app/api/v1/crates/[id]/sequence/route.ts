import { UuidSchema } from "@app/api-client";
import { FiltersSchema } from "@app/core";
import { z } from "zod";
import { getViewer } from "@/server/auth";
import { db } from "@/server/db";
import { badRequest, clientIp, json, notFound, route } from "@/server/http";
import { rateLimit } from "@/server/rate-limit";
import { seededPage } from "@/server/sequence";

type Ctx = { params: Promise<{ id: string }> };
const Page = z.coerce.number().int().min(0).max(2000);

/** One page of a seeded crate's order. Its owner, or anyone once it's shared. */
export const GET = route<Ctx>(async (req, { params }) => {
  const id = UuidSchema.parse((await params).id);
  const pool = db();
  const viewer = await getViewer(req);
  await rateLimit(pool, "read", { userId: viewer?.userId, ip: clientIp(req) });
  const page = Page.parse(new URL(req.url).searchParams.get("page") ?? "0");
  const res = await pool.query<{
    user_id: string;
    filters: unknown;
    seed: number | null;
    share_id: string | null;
  }>("select user_id, filters, seed, share_id from crates where id = $1", [id]);
  const crate = res.rows[0];
  if (!crate || (crate.user_id !== viewer?.userId && !crate.share_id)) throw notFound("That crate");
  if (crate.seed === null) throw badRequest("This crate isn't seeded.");
  const filters = FiltersSchema.parse(crate.filters ?? {});
  return json(await seededPage(pool, filters, crate.seed, page));
});
