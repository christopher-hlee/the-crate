import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import type pg from "pg";
import { createDb } from "./client";

export const MIGRATIONS_FOLDER = fileURLToPath(new URL("../migrations", import.meta.url));

export async function runMigrations(pool: pg.Pool): Promise<void> {
  await migrate(createDb(pool), { migrationsFolder: MIGRATIONS_FOLDER });
}
