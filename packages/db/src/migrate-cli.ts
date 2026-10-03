import { createPool } from "./client";
import { runMigrations } from "./migrate";

const url = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
if (!url) {
  console.error("Set DIRECT_DATABASE_URL (or DATABASE_URL) to migrate.");
  process.exit(1);
}
const pool = createPool(url, { max: 1 });
try {
  await runMigrations(pool);
  console.log("Migrations applied.");
} finally {
  await pool.end();
}
