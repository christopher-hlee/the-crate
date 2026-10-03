// Long-running worker: schedules and runs every job on pg-boss.

import { createPool } from "@app/db";
import * as Sentry from "@sentry/node";
import { PgBoss } from "pg-boss";
import { loadEnv, requireDatabaseUrl } from "./env";
import { JOBS } from "./jobs/registry";

export async function startWorker(): Promise<() => Promise<void>> {
  const env = loadEnv();
  const url = requireDatabaseUrl(env);
  if (env.SENTRY_DSN) Sentry.init({ dsn: env.SENTRY_DSN, tracesSampleRate: 0 });
  const pool = createPool(url, { max: 8 });
  const boss = new PgBoss({ connectionString: url, schema: "pgboss", max: 4 });
  boss.on("error", (err) => {
    console.error("pg-boss error", err);
    Sentry.captureException(err);
  });
  await boss.start();
  for (const job of JOBS) {
    await boss.createQueue(job.name, {
      policy: "stately",
      retryLimit: job.name === "ingest" ? 0 : 1,
      expireInSeconds: job.expireInSeconds,
    });
    await boss.schedule(job.name, job.cron, {}, { tz: "UTC" });
    await boss.work(job.name, { batchSize: 1 }, async (jobs) => {
      for (const j of jobs) {
        const log = (msg: string) => console.log(`[${job.name}] ${msg}`);
        const data = job.data.parse(j.data ?? {});
        const t0 = Date.now();
        try {
          const result = await job.run({ pool, env, log }, data);
          log(
            `done in ${((Date.now() - t0) / 1000).toFixed(1)} s ${JSON.stringify(result ?? null)}`,
          );
        } catch (err) {
          log(`failed: ${err instanceof Error ? err.message : String(err)}`);
          Sentry.captureException(err, { tags: { job: job.name } });
          throw err;
        }
      }
    });
  }
  console.log(`Worker started with ${JOBS.length} scheduled jobs.`);
  return async () => {
    await boss.stop({ graceful: true });
    await pool.end();
  };
}
