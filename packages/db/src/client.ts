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
