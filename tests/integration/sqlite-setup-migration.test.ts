import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

function runSqlite(dbPath: string, sql: string) {
  return execFileSync("sqlite3", [dbPath], {
    input: `${sql.trim().replace(/;?$/, ";")}\n`,
    encoding: "utf8",
  }).trim();
}

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const tempDir = tempDirs.pop();

    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  }
});

describe("sqlite setup", () => {
  it("serializes concurrent setup runs with a lock", { timeout: 15000 }, async () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "infinitum-sqlite-lock-"));
    const dbPath = path.join(tempDir, "concurrent.db");
    const root = process.cwd();

    tempDirs.push(tempDir);

    const runSetup = (holdMs: number) =>
      new Promise<{ code: number | null; stderr: string }>((resolve, reject) => {
        const child = spawn("node", ["scripts/setup-sqlite.mjs", dbPath], {
          cwd: root,
          env: {
            ...process.env,
            SQLITE_SETUP_LOCK_HOLD_MS: String(holdMs),
            SQLITE_SETUP_LOCK_TIMEOUT_MS: "10000",
          },
          stdio: ["ignore", "pipe", "pipe"],
        });

        let stderr = "";

        child.stderr.on("data", (chunk) => {
          stderr += chunk.toString();
        });
        child.on("error", reject);
        child.on("close", (code) => resolve({ code, stderr }));
      });

    const firstRun = runSetup(400);
    const secondRun = runSetup(0);
    const [firstResult, secondResult] = await Promise.all([firstRun, secondRun]);

    expect(firstResult.code).toBe(0);
    expect(secondResult.code).toBe(0);
    expect(firstResult.stderr).not.toContain("Error");
    expect(secondResult.stderr).not.toContain("Error");
    expect(runSqlite(dbPath, `SELECT COUNT(*) FROM "sqlite_master" WHERE "type" = 'table' AND "name" = 'model_api_configs'`)).toBe("1");
    expect(runSqlite(dbPath, `SELECT COUNT(*) FROM "sqlite_master" WHERE "type" = 'table' AND "name" = 'prompt_configs'`)).toBe("1");
    expect(runSqlite(dbPath, `SELECT COUNT(*) FROM pragma_table_info('task_schedules') WHERE "name" = 'sourceConcurrency'`)).toBe("1");
  });
});
