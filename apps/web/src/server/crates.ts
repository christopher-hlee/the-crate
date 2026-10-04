import "server-only";
import type { Crate, CrateDetail, CrateItem } from "@app/api-client";
import {
  canAddCrateItems,
  canCreateCrate,
  type Filters,
  FiltersSchema,
  limitsFor,
  type Plan,
} from "@app/core";
import { type Pool, withTransaction } from "@app/db";
import { limitReached, notFound, proRequired } from "./http";
import { catalogItems } from "./records";

type CrateRow = {
  id: string;
  name: string;
  filters: unknown;
  seed: number | null;
  share_id: string | null;
  created_at: Date;
  updated_at: Date;
  item_count: number;
};

const CRATE_COLUMNS = `c.id, c.name, c.filters, c.seed, c.share_id, c.created_at, c.updated_at,
  (select count(*)::int from crate_items i where i.crate_id = c.id) as item_count`;

export function toCrate(r: CrateRow): Crate {
  const filters = r.filters ? FiltersSchema.safeParse(r.filters) : null;
  return {
    id: r.id,
    name: r.name,
    filters: filters?.success ? filters.data : null,
    seed: r.seed,
    shareId: r.share_id,
    itemCount: r.item_count,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  };
}

export async function listCrates(db: Pool, userId: string): Promise<Crate[]> {
  const res = await db.query<CrateRow>(
    `select ${CRATE_COLUMNS} from crates c where c.user_id = $1 order by c.created_at`,
    [userId],
  );
  return res.rows.map(toCrate);
}

export async function ownCrate(db: Pool, userId: string, id: string): Promise<CrateRow> {
  const res = await db.query<CrateRow>(
    `select ${CRATE_COLUMNS} from crates c where c.id = $1 and c.user_id = $2`,
    [id, userId],
  );
  const row = res.rows[0];
  if (!row) throw notFound("That crate");
  return row;
}

export async function crateItems(db: Pool, crateId: string): Promise<CrateItem[]> {
  const res = await db.query<{
    record_key: string;
    video_id: string;
    position: number;
    note: string | null;
    added_at: Date;
  }>(
    "select record_key, video_id, position, note, added_at from crate_items where crate_id = $1 order by position, added_at",
    [crateId],
  );
  const items = await catalogItems(
    db,
    res.rows.map((r) => ({ recordKey: r.record_key, videoId: r.video_id })),
  );
  return res.rows.map((r) => {
    const item = items.get(`${r.record_key}/${r.video_id}`);
    return {
      recordKey: r.record_key,
      videoId: r.video_id,
      discogsUrl: item?.discogsUrl ?? "",
      available: item?.available ?? false,
      record: item?.record ?? null,
      position: r.position,
      note: r.note,
      addedAt: r.added_at.toISOString(),
    };
  });
}

export async function getCrate(db: Pool, userId: string, id: string): Promise<CrateDetail> {
  const crate = await ownCrate(db, userId, id);
  return { crate: toCrate(crate), items: await crateItems(db, id) };
}

export async function createCrate(
  db: Pool,
  userId: string,
  plan: Plan,
  req: { name: string; filters?: Filters | undefined; seed?: number | undefined },
): Promise<Crate> {
  if ((req.filters || req.seed !== undefined) && !limitsFor(plan).createShared) {
    throw proRequired("Seeded crates");
  }
  return withTransaction(db, async (client) => {
    // Serialise creates per user so two tabs can't both slip under the limit.
    await client.query("select pg_advisory_xact_lock(hashtextextended($1, 7))", [userId]);
    const count = await client.query<{ n: number }>(
      "select count(*)::int as n from crates where user_id = $1",
      [userId],
    );
    if (limitsFor(plan).maxCrates === 0) throw proRequired("Crates", true);
    if (!canCreateCrate(plan, count.rows[0]?.n ?? 0)) {
      throw limitReached(`You can keep up to ${limitsFor(plan).maxCrates} crates.`);
    }
    const res = await client.query<CrateRow>(
      `insert into crates as c (user_id, name, filters, seed) values ($1, $2, $3, $4)
       returning ${CRATE_COLUMNS}`,
      [userId, req.name, req.filters ? JSON.stringify(req.filters) : null, req.seed ?? null],
    );
    return toCrate(res.rows[0] as CrateRow);
  });
}

export async function updateCrate(
  db: Pool,
  userId: string,
  plan: Plan,
  id: string,
  req: {
    name?: string | undefined;
    filters?: Filters | null | undefined;
    seed?: number | null | undefined;
  },
): Promise<Crate> {
  await ownCrate(db, userId, id);
  const changingSeed = req.filters !== undefined || req.seed !== undefined;
  if (changingSeed && !limitsFor(plan).createShared) throw proRequired("Seeded crates");
  const sets: string[] = [];
  const values: unknown[] = [id, userId];
  if (req.name !== undefined) {
    values.push(req.name);
    sets.push(`name = $${values.length}`);
  }
  if (req.filters !== undefined) {
    values.push(req.filters ? JSON.stringify(req.filters) : null);
    sets.push(`filters = $${values.length}`);
  }
  if (req.seed !== undefined) {
    values.push(req.seed);
    sets.push(`seed = $${values.length}`);
  }
  await db.query(
    `update crates set ${sets.join(", ")}, updated_at = now() where id = $1 and user_id = $2`,
    values,
  );
  return toCrate(await ownCrate(db, userId, id));
}

export async function deleteCrate(db: Pool, userId: string, id: string): Promise<void> {
  const res = await db.query("delete from crates where id = $1 and user_id = $2", [id, userId]);
  if (!res.rowCount) throw notFound("That crate");
}

export async function addItem(
  db: Pool,
  userId: string,
  plan: Plan,
  id: string,
  ref: { recordKey: string; videoId: string },
): Promise<CrateDetail> {
  await withTransaction(db, async (client) => {
    const crate = await client.query<{ id: string }>(
      "select id from crates where id = $1 and user_id = $2 for update",
      [id, userId],
    );
    if (!crate.rows[0]) throw notFound("That crate");
    const exists = await client.query(
      "select 1 from crate_items where crate_id = $1 and record_key = $2 and video_id = $3",
      [id, ref.recordKey, ref.videoId],
    );
    if (exists.rowCount) return;
    const count = await client.query<{ n: number; max: number | null }>(
      "select count(*)::int as n, max(position) as max from crate_items where crate_id = $1",
      [id],
    );
    const n = count.rows[0]?.n ?? 0;
    // A Free account can still own crates from a lapsed Pro plan: they stay playable, not growable.
    if (limitsFor(plan).maxItemsPerCrate === 0) throw proRequired("Crates", true);
    if (!canAddCrateItems(plan, n)) {
      throw limitReached(`A crate holds up to ${limitsFor(plan).maxItemsPerCrate} records.`);
    }
    await client.query(
      "insert into crate_items (crate_id, record_key, video_id, position) values ($1, $2, $3, $4)",
      [id, ref.recordKey, ref.videoId, (count.rows[0]?.max ?? -1) + 1],
    );
    await client.query("update crates set updated_at = now() where id = $1", [id]);
  });
  return getCrate(db, userId, id);
}

export async function reorderItems(
  db: Pool,
  userId: string,
  id: string,
  order: readonly { recordKey: string; videoId: string }[],
): Promise<CrateDetail> {
  await ownCrate(db, userId, id);
  await db.query(
    `update crate_items i set position = o.pos - 1
       from unnest($2::text[], $3::text[]) with ordinality as o(record_key, video_id, pos)
      where i.crate_id = $1 and i.record_key = o.record_key and i.video_id = o.video_id`,
    [id, order.map((o) => o.recordKey), order.map((o) => o.videoId)],
  );
  await db.query("update crates set updated_at = now() where id = $1", [id]);
  return getCrate(db, userId, id);
}

export async function removeItem(
  db: Pool,
  userId: string,
  id: string,
  ref: { recordKey: string; videoId: string },
): Promise<CrateDetail> {
  await ownCrate(db, userId, id);
  await db.query(
    "delete from crate_items where crate_id = $1 and record_key = $2 and video_id = $3",
    [id, ref.recordKey, ref.videoId],
  );
  return getCrate(db, userId, id);
}

/** A note on one record in a crate (null clears it). */
export async function setCrateItemNote(
  db: Pool,
  userId: string,
  id: string,
  ref: { recordKey: string; videoId: string },
  note: string | null,
): Promise<void> {
  await ownCrate(db, userId, id);
  const res = await db.query(
    "update crate_items set note = $4 where crate_id = $1 and record_key = $2 and video_id = $3",
    [id, ref.recordKey, ref.videoId, note || null],
  );
  if (!res.rowCount) throw notFound("That record in this crate");
}
