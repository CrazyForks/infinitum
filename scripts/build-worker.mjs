import { mkdirSync } from "node:fs";
import path from "node:path";

import { build } from "esbuild";

const root = process.cwd();
const outdir = path.resolve(root, "dist");

mkdirSync(outdir, { recursive: true });

await build({
  entryPoints: [path.resolve(root, "scripts", "run-worker.ts")],
  outfile: path.resolve(outdir, "worker.cjs"),
  bundle: true,
  minify: true,
  platform: "node",
  target: "node20",
  format: "cjs",
  packages: "bundle",
  external: ["@prisma/client", "jsdom"],
  logLevel: "info",
});
