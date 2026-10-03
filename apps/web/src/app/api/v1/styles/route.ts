import { stylesResponse } from "@/server/census";
import { db } from "@/server/db";
import { json, route } from "@/server/http";

export const GET = route(async () => {
  return json(await stylesResponse(db()), {
    headers: { "cache-control": "public, max-age=300, s-maxage=600, stale-while-revalidate=3600" },
  });
});
