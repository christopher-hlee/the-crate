// Worker configuration, validated once at startup.

import { DEFAULT_APP_ID, readFlags, YOUTUBE } from "@app/core";
import { DEFAULT_DUMPS_BASE_URL } from "@app/discogs";
import { z } from "zod";

const optional = z
  .string()
  .optional()
  .transform((v) => (v === undefined || v.trim() === "" ? undefined : v.trim()));

export const WorkerEnvSchema = z.object({
  DIRECT_DATABASE_URL: optional,
  DATABASE_URL: optional,
  YOUTUBE_API_KEY: optional,
  YOUTUBE_API_REFERER: optional,
  YT_DAILY_UNIT_BUDGET: z.coerce
    .number()
    .int()
    .min(0)
    .max(10_000_000)
    .default(YOUTUBE.defaultDailyUnitBudget),
  DISCOGS_DUMPS_BASE_URL: z.string().url().default(DEFAULT_DUMPS_BASE_URL),
  R2_ACCOUNT_ID: optional,
  R2_ACCESS_KEY_ID: optional,
  R2_SECRET_ACCESS_KEY: optional,
  R2_BUCKET: optional,
  /** Cleared-lane files on local disk when R2 isn't configured (development, tests). */
  ASSET_STORE_DIR: optional,
  FFMPEG_PATH: optional,
  ESSENTIA_EXTRACTOR: optional,
  SUPABASE_URL: optional,
  SUPABASE_SERVICE_ROLE_KEY: optional,
  GETSONGBPM_API_KEY: optional,
  SENTRY_DSN: optional,
  APP_ID_IOS: z.string().default(DEFAULT_APP_ID),
});

export type WorkerEnv = z.infer<typeof WorkerEnvSchema> & {
  databaseUrl: string | undefined;
  flags: ReturnType<typeof readFlags>;
};

export function loadEnv(source: Record<string, string | undefined> = process.env): WorkerEnv {
  const env = WorkerEnvSchema.parse(source);
  return {
    ...env,
    databaseUrl: env.DIRECT_DATABASE_URL ?? env.DATABASE_URL,
    flags: readFlags(source),
  };
}

export function requireDatabaseUrl(env: WorkerEnv): string {
  if (!env.databaseUrl)
    throw new Error("Set DIRECT_DATABASE_URL (the direct, non-pooled connection).");
  return env.databaseUrl;
}
