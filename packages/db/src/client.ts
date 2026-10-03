import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

export type Db = NodePgDatabase<typeof schema>;
export type Pool = pg.Pool;
export type PoolClient = pg.PoolClient;
export type Queryable = Pick<pg.Pool | pg.PoolClient, "query">;

// bigint columns come back as strings by default; every bigint we store (Discogs IDs,
// seeds, view counts) fits in a JS safe integer.
pg.types.setTypeParser(pg.types.builtins.INT8, (v) => Number(v));
// Calendar dates stay "YYYY-MM-DD" strings; turning them into local-midnight Dates invites
// time zone bugs.
pg.types.setTypeParser(pg.types.builtins.DATE, (v) => v);
// bigint[] (OID 1016) likewise, e.g. record_videos.artist_ids.
const INT8_ARRAY = 1016 as unknown as Parameters<typeof pg.types.getTypeParser>[0];
const parseTextArray = pg.types.getTypeParser(INT8_ARRAY) as (v: string) => (string | null)[];
pg.types.setTypeParser(INT8_ARRAY, (v: string) =>
  parseTextArray(v).map((x) => (x === null ? null : Number(x))),
);

export function createPool(connectionString: string, options: pg.PoolConfig = {}): pg.Pool {
  return new pg.Pool({ connectionString, max: 10, ...options });
}

export function createDb(pool: pg.Pool): Db {
  return drizzle(pool, { schema });
}

export async function withTransaction<T>(
  pool: pg.Pool,
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const out = await fn(client);
    await client.query("commit");
    return out;
  } catch (err) {
    await client.query("rollback").catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}
