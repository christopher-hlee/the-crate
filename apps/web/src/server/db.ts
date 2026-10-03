import "server-only";
import { createPool, type Pool } from "@app/db";
import { env } from "./env";

const globalForPool = globalThis as unknown as { cratePool?: Pool };

/** One pool per server instance (and per dev hot-reload), on the pooled connection string. */
export function db(): Pool {
  if (!globalForPool.cratePool) {
    const url = env().DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    globalForPool.cratePool = createPool(url, { max: 5, idleTimeoutMillis: 10_000 });
  }
  return globalForPool.cratePool;
}
