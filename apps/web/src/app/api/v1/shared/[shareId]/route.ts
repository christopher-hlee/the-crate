import { z } from "zod";
import { crateItems, toCrate } from "@/server/crates";
import { db } from "@/server/db";
import { json, notFound, route } from "@/server/http";

type Ctx = { params: Promise<{ shareId: string }> };
const ShareId = z.string().regex(/^[A-Za-z0-9_-]{8,40}$/);

/** A shared crate: anyone can play it. The owner's item notes stay private. */
export const GET = route<Ctx>(async (_req, { params }) => {
  const shareId = ShareId.parse((await params).shareId);
  const pool = db();
  const res = await pool.query(
    `select c.id, c.name, c.filters, c.seed, c.share_id, c.created_at, c.updated_at,
            (select count(*)::int from crate_items i where i.crate_id = c.id) as item_count
       from crates c where c.share_id = $1`,
    [shareId],
  );
  const row = res.rows[0];
  if (!row) throw notFound("That shared crate");
  const crate = toCrate(row);
  return json(
    {
      crate: {
        name: crate.name,
        shareId,
        filters: crate.filters,
        seed: crate.seed,
        itemCount: crate.itemCount,
      },
      items: (await crateItems(pool, crate.id)).map((item) => ({ ...item, note: null })),
    },
    { headers: { "cache-control": "public, max-age=30, s-maxage=60" } },
  );
});
