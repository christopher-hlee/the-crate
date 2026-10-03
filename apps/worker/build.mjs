// Bundles the worker for production: workspace packages (@app/*, TypeScript source) are
// bundled in; npm dependencies stay external and are installed in the image.
import { readFileSync } from "node:fs";
import { build } from "esbuild";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));
const external = Object.keys(pkg.dependencies ?? {}).filter((d) => !d.startsWith("@app/"));
// Dependencies of the bundled workspace packages.
external.push("drizzle-orm", "pg-copy-streams", "saxes", "zod", "pg");

await build({
  entryPoints: ["src/cli.ts"],
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  outfile: "dist/cli.js",
  external: [...new Set(external), "drizzle-orm/*"],
  sourcemap: true,
  logLevel: "warning",
});
