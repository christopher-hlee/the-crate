import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema.ts",
  out: "./migrations",
  dbCredentials: {
    url: process.env.DIRECT_DATABASE_URL ?? "postgres://crate:crate@localhost:5433/crate",
  },
});
