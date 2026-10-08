import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { publicCrateItems, toCrate } from "@/server/crates";
import { db } from "@/server/db";
import { SharedCrateView } from "./SharedCrateView";

type Props = { params: Promise<{ shareId: string }> };

async function load(params: Props["params"]) {
  const { shareId } = await params;
  if (!/^[A-Za-z0-9_-]{8,40}$/.test(shareId)) notFound();
  const pool = db();
  const res = await pool.query(
    `select c.id, c.name, c.filters, c.seed, c.share_id, c.created_at, c.updated_at,
            (select count(*)::int from crate_items i where i.crate_id = c.id) as item_count
       from crates c where c.share_id = $1`,
    [shareId],
  );
  if (!res.rows[0]) notFound();
  const crate = toCrate(res.rows[0]);
  return { shareId, crate, items: await publicCrateItems(pool, crate.id) };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { crate } = await load(params);
  return { title: `${crate.name} (shared crate)` };
}

export default async function SharedCratePage({ params }: Props) {
  const { shareId, crate, items } = await load(params);
  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-ink-2">Shared crate</p>
        <h1 className="text-2xl font-semibold">{crate.name}</h1>
        <p className="text-sm text-ink-2">{crate.itemCount} records</p>
      </div>
      <SharedCrateView
        shareId={shareId}
        items={items}
        seeded={crate.seed !== null && crate.filters !== null}
      />
    </div>
  );
}
