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

/**
 * Dev auth trusts a cookie, so it must never run on a deployment. Locally it is the default
 * without Supabase. A production server needs Supabase, or both AUTH_MODE=dev and
 * ALLOW_DEV_AUTH=1 (the end-to-end tests run a production build), and never on Vercel.
 */
export function resolveAuthMode(o: {
  authMode: "supabase" | "dev" | undefined;
  supabaseUrl: string | undefined;
  vercel: boolean;
  production: boolean;
  allowDevAuth: boolean;
}): "supabase" | "dev" {
  const mode = o.authMode ?? (o.supabaseUrl || o.production ? "supabase" : "dev");
  if (mode === "dev" && o.vercel) throw new Error("AUTH_MODE=dev is refused on Vercel deployments");
  if (mode === "dev" && o.production && !o.allowDevAuth)
    throw new Error("AUTH_MODE=dev is refused in production unless ALLOW_DEV_AUTH=1 (tests only)");
  if (mode === "supabase" && o.production && !o.supabaseUrl)
    throw new Error("Set SUPABASE_URL and SUPABASE_ANON_KEY: production needs real sign-in");
  return mode;
}

function readEnv() {
  const e = Schema.parse(process.env);
  const supabaseUrl = e.NEXT_PUBLIC_SUPABASE_URL ?? e.SUPABASE_URL;
  const anonKey = e.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? e.SUPABASE_ANON_KEY;
  const authMode = resolveAuthMode({
    authMode: e.AUTH_MODE,
    supabaseUrl,
    vercel: Boolean(e.VERCEL),
    production: process.env.NODE_ENV === "production",
    allowDevAuth: process.env.ALLOW_DEV_AUTH === "1",
  });
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
