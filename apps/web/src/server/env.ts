import "server-only";
import { DEFAULT_NARROW_FILTER_THRESHOLD, readFlags } from "@app/core";
import { z } from "zod";

const optional = z
  .string()
  .optional()
  .transform((v) => (v === undefined || v.trim() === "" ? undefined : v.trim()));

const Schema = z.object({
  DATABASE_URL: optional,
  SUPABASE_URL: optional,
  NEXT_PUBLIC_SUPABASE_URL: optional,
  SUPABASE_ANON_KEY: optional,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: optional,
  SUPABASE_SERVICE_ROLE_KEY: optional,
  AUTH_MODE: z.enum(["supabase", "dev"]).optional(),
  NARROW_FILTER_THRESHOLD: z.coerce.number().int().min(0).default(DEFAULT_NARROW_FILTER_THRESHOLD),
  NEXT_PUBLIC_APP_URL: optional,
  STRIPE_SECRET_KEY: optional,
  STRIPE_WEBHOOK_SECRET: optional,
  STRIPE_PRICE_MONTH: optional,
  STRIPE_PRICE_YEAR: optional,
  REVENUECAT_WEBHOOK_SECRET: optional,
  SENTRY_DSN: optional,
  VERCEL: optional,
  // Archive (cleared-lane) files: R2 in production, a local folder in development and tests.
  R2_ACCOUNT_ID: optional,
  R2_ACCESS_KEY_ID: optional,
  R2_SECRET_ACCESS_KEY: optional,
  R2_BUCKET: optional,
  ASSET_STORE_DIR: optional,
});

export type WebEnv = ReturnType<typeof readEnv>;

function readEnv() {
  const e = Schema.parse(process.env);
  const supabaseUrl = e.NEXT_PUBLIC_SUPABASE_URL ?? e.SUPABASE_URL;
  const anonKey = e.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? e.SUPABASE_ANON_KEY;
  const authMode = e.AUTH_MODE ?? (supabaseUrl ? "supabase" : "dev");
  if (authMode === "dev" && e.VERCEL) {
    // Dev auth trusts a cookie; it must never run on a deployment.
    throw new Error("AUTH_MODE=dev is refused on Vercel deployments");
  }
  return {
    ...e,
    supabaseUrl,
    anonKey,
    authMode,
    flags: readFlags(process.env),
  };
}

let cached: WebEnv | null = null;

export function env(): WebEnv {
  cached ??= readEnv();
  return cached;
}
