// Integration-test helper: a fresh, migrated database per test file, dropped afterwards.

import { randomBytes } from "node:crypto";
import pg from "pg";
import { createDb, createPool, type Db } from "./client";
import { runMigrations } from "./migrate";

export const DEFAULT_TEST_DATABASE_URL = "postgres://crate:crate@localhost:5433/postgres";

export type TestDatabase = { url: string; pool: pg.Pool; db: Db; drop: () => Promise<void> };

function withDatabase(url: string, name: string): string {
  const u = new URL(url);
  u.pathname = `/${name}`;
  return u.toString();
}

export async function createTestDatabase(
  options: { migrate?: boolean } = {},
): Promise<TestDatabase> {
  const adminUrl = process.env.TEST_DATABASE_URL ?? DEFAULT_TEST_DATABASE_URL;
  const name = `crate_t_${randomBytes(6).toString("hex")}`;
  const admin = new pg.Client({ connectionString: adminUrl });
  try {
    await admin.connect();
  } catch (err) {
    throw new Error(
      `Integration tests need Postgres at ${adminUrl} (run \`pnpm db:up\` or set TEST_DATABASE_URL): ${String(err)}`,
    );
  }
  try {
    await admin.query(`create database ${name}`);
  } finally {
    await admin.end();
  }
  const url = withDatabase(adminUrl, name);
  const pool = createPool(url, { max: 5 });
  if (options.migrate !== false) await runMigrations(pool);
  return {
    url,
    pool,
    db: createDb(pool),
    async drop() {
      await pool.end();
      const c = new pg.Client({ connectionString: adminUrl });
      await c.connect();
      try {
        await c.query(`drop database if exists ${name} with (force)`);
      } finally {
        await c.end();
      }
    },
  };
}
