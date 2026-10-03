// Worker CLI. `pnpm worker <command> [options]`; `pnpm worker help` lists commands.

import { resolve } from "node:path";
import { parseArgs } from "node:util";
import pg from "pg";
import { benchShuffle } from "./commands/bench-shuffle";
import { countCatalog, writeReport } from "./commands/catalog-count";
import { generateDump } from "./commands/dump-generate";
import { sampleIdsFromDump, validateSample } from "./commands/yt-sample";

/** pnpm runs scripts from the package folder; resolve paths against where the user ran it. */
function userPath(p: string): string {
  return /^https?:\/\//i.test(p) ? p : resolve(process.env.INIT_CWD ?? process.cwd(), p);
}

type Command = { usage: string; run: (args: string[]) => Promise<number> };

const commands: Record<string, Command> = {
  "catalog:count": {
    usage: "catalog:count <url|file> [--out reports/count.json] [--verify] [--gzip|--no-gzip]",
    async run(args) {
      const { values, positionals } = parseArgs({
        args,
        allowPositionals: true,
        options: {
          out: { type: "string" },
          verify: { type: "boolean", default: false },
          gzip: { type: "boolean" },
          "no-gzip": { type: "boolean" },
        },
      });
      const input = positionals[0];
      if (!input) throw new Error("catalog:count needs a URL or file");
      const source = userPath(input);
      const budget = Number(process.env.YT_DAILY_UNIT_BUDGET ?? "") || undefined;
      const report = await countCatalog({
        source,
        verify: values.verify,
        gzip: values["no-gzip"] ? false : values.gzip,
        dailyUnitBudget: budget,
        onProgress: (n, bytes) =>
          console.error(
            `… ${n.toLocaleString("en-US")} releases, ${(bytes / 1e9).toFixed(2)} GB read`,
          ),
      });
      const json = JSON.stringify(report, null, 2);
      if (values.out) {
        await writeReport(userPath(values.out), report);
        console.error(`Report written to ${values.out}`);
      } else {
        console.log(json);
      }
      if (report.checksum.matches === false) {
        console.error("Checksum mismatch: the dump does not match its published SHA-256.");
        return 2;
      }
      return 0;
    },
  },
  "bench:shuffle": {
    usage:
      "bench:shuffle [--rows 8000000] [--iterations 500] [--reload] [--out reports/bench/shuffle.json]",
    async run(args) {
      const { values } = parseArgs({
        args,
        options: {
          rows: { type: "string", default: "8000000" },
          iterations: { type: "string", default: "500" },
          reload: { type: "boolean", default: false },
          database: { type: "string", default: "crate_bench" },
          seed: { type: "string", default: "42" },
          out: { type: "string" },
        },
      });
      const adminUrl =
        process.env.BENCH_ADMIN_DATABASE_URL ?? "postgres://crate:crate@localhost:5433/postgres";
      const report = await benchShuffle({
        adminUrl,
        database: values.database,
        rows: Number(values.rows),
        iterations: Number(values.iterations),
        reload: values.reload,
        seed: Number(values.seed),
        log: (s) => console.error(s),
      });
      if (values.out) await writeReport(userPath(values.out), report);
      for (const s of report.scenarios) {
        console.error(
          `${s.name.padEnd(48)} matches ${String(s.matches).padStart(9)}  pick p50 ${s.pick.p50} ms  p95 ${s.pick.p95} ms  (signed out p95 ${s.pickSignedOut.p95} ms)`,
        );
      }
      if (!values.out) console.log(JSON.stringify(report, null, 2));
      return 0;
    },
  },
  "yt:sample": {
    usage:
      "yt:sample --from-dump <url|file> [--size 5000] [--out reports/yt-sample.json] [--dry-run]",
    async run(args) {
      const { values } = parseArgs({
        args,
        options: {
          "from-dump": { type: "string" },
          size: { type: "string", default: "5000" },
          out: { type: "string" },
          "dry-run": { type: "boolean", default: false },
        },
      });
      const from = values["from-dump"];
      if (!from) throw new Error("yt:sample needs --from-dump <url|file>");
      const size = Number(values.size);
      console.error(`Sampling ${size} distinct video IDs from ${from}…`);
      const { ids, releases } = await sampleIdsFromDump(userPath(from), size);
      console.error(`Sampled ${ids.length} IDs from ${releases.toLocaleString("en-US")} releases.`);
      if (values["dry-run"]) {
        console.log(JSON.stringify({ sampled: ids.length, ids: ids.slice(0, 20) }, null, 2));
        return 0;
      }
      const apiKey = process.env.YOUTUBE_API_KEY;
      if (!apiKey) throw new Error("Set YOUTUBE_API_KEY (server-side key) to validate the sample.");
      const report = {
        source: from,
        at: new Date().toISOString(),
        ...(await validateSample(ids, { apiKey })),
      };
      if (values.out) await writeReport(userPath(values.out), report);
      console.log(JSON.stringify(report, null, 2));
      return 0;
    },
  },
  "db:check": {
    usage: "db:check   (uses DIRECT_DATABASE_URL; confirms the Postgres features the app needs)",
    async run() {
      const url = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
      if (!url) throw new Error("Set DIRECT_DATABASE_URL");
      const client = new pg.Client({ connectionString: url });
      await client.connect();
      try {
        const v = await client.query<{ v: string; n: number }>("show server_version_num");
        const h = await client.query<{ a: string; b: string; c: string }>(
          "select hashtextextended('m:1:abcdefghijk', 1)::text as a, hashtextextended('m:1:abcdefghijk', 1)::text as b, hashtextextended('m:1:abcdefghijk', 2)::text as c",
        );
        const row = h.rows[0];
        const ok = row !== undefined && row.a === row.b && row.a !== row.c;
        console.log(
          JSON.stringify(
            { serverVersionNum: Object.values(v.rows[0] ?? {})[0], hashtextextended: ok },
            null,
            2,
          ),
        );
        return ok ? 0 : 1;
      } finally {
        await client.end();
      }
    },
  },
  "dump:generate": {
    usage: "dump:generate --releases 100000 --out fixtures/generated/dump.xml.gz [--seed 1]",
    async run(args) {
      const { values } = parseArgs({
        args,
        options: {
          releases: { type: "string", default: "10000" },
          out: { type: "string" },
          seed: { type: "string", default: "1" },
        },
      });
      if (!values.out) throw new Error("dump:generate needs --out");
      await generateDump({
        releases: Number(values.releases),
        out: userPath(values.out),
        seed: Number(values.seed),
      });
      console.error(`Wrote ${values.releases} releases to ${values.out}`);
      return 0;
    },
  },
};

function help(): void {
  console.log("Commands:");
  for (const c of Object.values(commands)) console.log(`  ${c.usage}`);
}

async function main(argv: string[]): Promise<number> {
  const [name, ...rest] = argv;
  if (!name || name === "help" || name === "--help") {
    help();
    return name ? 0 : 1;
  }
  const command = commands[name];
  if (!command) {
    console.error(`Unknown command: ${name}`);
    help();
    return 1;
  }
  return command.run(rest);
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (err: unknown) => {
    console.error(err instanceof Error ? (err.stack ?? err.message) : err);
    process.exit(1);
  },
);
