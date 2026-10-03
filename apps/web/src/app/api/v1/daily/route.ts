import { dailyDig } from "@app/core";
import { z } from "zod";
import { db } from "@/server/db";
import { json, route } from "@/server/http";
import { seededPage } from "@/server/sequence";

const Page = z.coerce.number().int().min(0).max(200);

/** Today's dig: the same seeded order for everyone over a curated preset. Free to play. */
export const GET = route(async (req) => {
  const page = Page.parse(new URL(req.url).searchParams.get("page") ?? "0");
  const today = dailyDig(new Date());
  const seq = await seededPage(db(), today.preset.filters, today.seed, page);
  return json(
    { ...seq, date: today.date, preset: { name: today.preset.name, blurb: today.preset.blurb } },
    { headers: { "cache-control": "public, max-age=300, s-maxage=600" } },
  );
});
