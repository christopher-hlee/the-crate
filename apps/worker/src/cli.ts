// Worker CLI. `pnpm worker <command> [options]`; `pnpm worker help` lists commands.

import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { countCatalog, writeReport } from "./commands/catalog-count";
import { generateDump } from "./commands/dump-generate";

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
