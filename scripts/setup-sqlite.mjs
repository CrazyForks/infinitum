import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const dbPathArg = args[0];
const shouldReset = args.includes("--reset");

if (!dbPathArg) {
  throw new Error("Usage: node scripts/setup-sqlite.mjs <db-path> [--reset]");
}

const root = process.cwd();
const dbPath = path.resolve(root, dbPathArg);
const dbDir = path.dirname(dbPath);
const sql = readFileSync(path.resolve(root, "prisma/init.sql"), "utf8");

mkdirSync(dbDir, { recursive: true });

if (shouldReset) {
  rmSync(dbPath, { force: true });
}

execFileSync("sqlite3", [dbPath], {
  input: sql,
  stdio: ["pipe", "inherit", "inherit"],
});
