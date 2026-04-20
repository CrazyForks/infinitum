import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
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
const lockPath = `${dbPath}.setup.lock`;
const lockTimeoutMs = Number.parseInt(process.env.SQLITE_SETUP_LOCK_TIMEOUT_MS || "30000", 10);
const staleLockMs = Number.parseInt(process.env.SQLITE_SETUP_STALE_LOCK_MS || "120000", 10);
const testHoldMs = Number.parseInt(process.env.SQLITE_SETUP_LOCK_HOLD_MS || "0", 10);
const sleepBuffer = new SharedArrayBuffer(4);
const sleepView = new Int32Array(sleepBuffer);

function runSqlite(commandArgs, options = {}) {
  return execFileSync("sqlite3", commandArgs, {
    stdio: ["pipe", "inherit", "inherit"],
    ...options,
  });
}

function sleep(ms) {
  if (ms <= 0) {
    return;
  }

  Atomics.wait(sleepView, 0, 0, ms);
}

function acquireSetupLock() {
  const startedAt = Date.now();

  while (true) {
    try {
      mkdirSync(lockPath);
      writeFileSync(
        path.join(lockPath, "owner.json"),
        JSON.stringify({
          pid: process.pid,
          createdAt: new Date().toISOString(),
        }),
        "utf8",
      );
      return;
    } catch (error) {
      const isAlreadyExists =
        error && typeof error === "object" && "code" in error && error.code === "EEXIST";

      if (!isAlreadyExists) {
        throw error;
      }

      try {
        const ageMs = Date.now() - statSync(lockPath).mtimeMs;
        if (ageMs > staleLockMs) {
          rmSync(lockPath, { recursive: true, force: true });
          continue;
        }
      } catch {
        continue;
      }

      if (Date.now() - startedAt >= lockTimeoutMs) {
        throw new Error(`Timed out waiting for SQLite setup lock: ${lockPath}`);
      }

      sleep(100);
    }
  }
}

function releaseSetupLock() {
  rmSync(lockPath, { recursive: true, force: true });
}

mkdirSync(dbDir, { recursive: true });

acquireSetupLock();

try {
  if (shouldReset) {
    rmSync(dbPath, { force: true });
  }

  runSqlite([dbPath], {
    input: sql,
  });

  if (testHoldMs > 0) {
    sleep(testHoldMs);
  }

  console.log(`Database initialized: ${dbPath}`);
} finally {
  releaseSetupLock();
}
