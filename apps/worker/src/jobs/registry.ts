// Every scheduled job: one instance at a time (pg-boss "stately" queues: at most one queued
// and one active), each safe to rerun from the start.

import { assetStoreFromEnv } from "@app/assets";
import type { Pool } from "@app/db";
import { z } from "zod";
import { recheckRights, runPdRollover } from "../cleared/rules";
import type { WorkerEnv } from "../env";
import { refreshLatestCensus } from "../ingest/census";
import { runIngest } from "../ingest/run";
import { r2Store } from "../ingest/snapshot";
import { runEnrichTempo, runPickAudioFeatures } from "../tempo/jobs";
import { runRetryAccountDeletions, supabaseAuthAdmin } from "./accounts";
import { runPurge } from "./purge";
import { runValidateSuggestions } from "./suggestions";
import { runRecheckReported, runValidate, type YouTubeDeps } from "./validate";

export type JobContext = { pool: Pool; env: WorkerEnv; log: (msg: string) => void };

export type JobDefinition = {
  name: string;
  /** 5-field cron, UTC. */
  cron: string;
  expireInSeconds: number;
  data: z.ZodType;
  run(ctx: JobContext, data: unknown): Promise<unknown>;
};

const Empty = z.object({}).passthrough();

function youtube(ctx: JobContext): YouTubeDeps | null {
  if (!ctx.env.YOUTUBE_API_KEY) {
    ctx.log("YOUTUBE_API_KEY is not set; skipping YouTube work");
    return null;
  }
  return {
    db: ctx.pool,
    apiKey: ctx.env.YOUTUBE_API_KEY,
    budget: ctx.env.YT_DAILY_UNIT_BUDGET,
    referer: ctx.env.YOUTUBE_API_REFERER,
  };
}

export const IngestData = z.object({ force: z.boolean().optional() }).strict();

export const JOBS: JobDefinition[] = [
  {
    name: "ingest",
    cron: "0 6 * * *",
    expireInSeconds: 6 * 3600,
    data: IngestData,
    async run(ctx, data) {
      const { force } = IngestData.parse(data ?? {});
      const e = ctx.env;
      const snapshots =
        e.R2_ACCOUNT_ID && e.R2_ACCESS_KEY_ID && e.R2_SECRET_ACCESS_KEY && e.R2_BUCKET
          ? r2Store({
              accountId: e.R2_ACCOUNT_ID,
              accessKeyId: e.R2_ACCESS_KEY_ID,
              secretAccessKey: e.R2_SECRET_ACCESS_KEY,
              bucket: e.R2_BUCKET,
            })
          : null;
      return runIngest(
        { pool: ctx.pool, baseUrl: e.DISCOGS_DUMPS_BASE_URL, snapshots, log: ctx.log },
        { force },
      );
    },
  },
  {
    name: "validate",
    cron: "5 * * * *",
    expireInSeconds: 3000,
    data: Empty,
    async run(ctx) {
      const deps = youtube(ctx);
      return deps ? runValidate(deps) : null;
    },
  },
  {
    name: "recheck_reported",
    cron: "*/10 * * * *",
    expireInSeconds: 540,
    data: Empty,
    async run(ctx) {
      const deps = youtube(ctx);
      return deps ? runRecheckReported(deps) : null;
    },
  },
  {
    name: "purge_yt_data",
    cron: "30 3 * * *",
    expireInSeconds: 3600,
    data: Empty,
    async run(ctx) {
      return runPurge(ctx.pool);
    },
  },
  {
    name: "validate_link_suggestions",
    cron: "*/10 * * * *",
    expireInSeconds: 540,
    data: Empty,
    async run(ctx) {
      const deps = youtube(ctx);
      return deps ? runValidateSuggestions(deps) : null;
    },
  },
  {
    name: "refresh_census",
    cron: "15 4 * * *",
    expireInSeconds: 3600,
    data: Empty,
    async run(ctx) {
      return { dumpDate: await refreshLatestCensus(ctx.pool) };
    },
  },
  {
    name: "enrich_tempo",
    cron: "*/5 * * * *",
    expireInSeconds: 280,
    data: Empty,
    async run(ctx) {
      // ~200 requests per 5-minute run, capped at 2,500 an hour by the shared counter.
      return runEnrichTempo(ctx.pool, {
        enabled: ctx.env.flags.FEATURE_GETSONGBPM,
        apiKey: ctx.env.GETSONGBPM_API_KEY,
        maxRequests: 200,
      });
    },
  },
  {
    name: "pick_audio_features",
    cron: "20 * * * *",
    expireInSeconds: 3000,
    data: Empty,
    async run(ctx) {
      return runPickAudioFeatures(ctx.pool);
    },
  },
  {
    name: "retry_account_deletions",
    cron: "0 */6 * * *",
    expireInSeconds: 3600,
    data: Empty,
    async run(ctx) {
      const e = ctx.env;
      const auth =
        e.SUPABASE_URL && e.SUPABASE_SERVICE_ROLE_KEY
          ? supabaseAuthAdmin(e.SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY)
          : null;
      return runRetryAccountDeletions(ctx.pool, auth);
    },
  },
  {
    // January 1: a new year of US recordings enters the public domain.
    name: "pd_rollover",
    cron: "10 0 1 1 *",
    expireInSeconds: 3600,
    data: Empty,
    async run(ctx) {
      if (!ctx.env.flags.FEATURE_CLEARED_LANE) return { skipped: "FEATURE_CLEARED_LANE is off" };
      return runPdRollover(ctx.pool, new Date());
    },
  },
  {
    // Daily: signed licences expire, and rules can change by hand.
    name: "recheck_rights",
    cron: "45 4 * * *",
    expireInSeconds: 3600,
    data: Empty,
    async run(ctx) {
      if (!ctx.env.flags.FEATURE_CLEARED_LANE) return { skipped: "FEATURE_CLEARED_LANE is off" };
      return recheckRights(ctx.pool, new Date());
    },
  },
];

/** The cleared-lane asset store from the environment (R2, or ASSET_STORE_DIR locally). */
export function clearedStore(env: WorkerEnv) {
  return assetStoreFromEnv(env);
}

export function jobByName(name: string): JobDefinition {
  const job = JOBS.find((j) => j.name === name);
  if (!job) throw new Error(`Unknown job: ${name}`);
  return job;
}
