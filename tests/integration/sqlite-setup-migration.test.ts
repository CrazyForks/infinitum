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
    expect(runSqlite(dbPath, `SELECT COUNT(*) FROM pragma_table_info('task_schedules') WHERE "name" = 'fullTextFetchThreshold'`)).toBe("1");
    expect(runSqlite(dbPath, `SELECT COUNT(*) FROM pragma_table_info('task_schedules') WHERE "name" = 'aggregationSplitMaxEvents'`)).toBe("1");
    expect(runSqlite(dbPath, `SELECT COUNT(*) FROM pragma_table_info('background_task_runs') WHERE "name" = 'fullTextFetchedCount'`)).toBe("1");
    expect(runSqlite(dbPath, `SELECT COUNT(*) FROM pragma_table_info('background_task_runs') WHERE "name" = 'aiCallBreakdownJson'`)).toBe("1");
    expect(runSqlite(dbPath, `SELECT COUNT(*) FROM pragma_table_info('background_task_runs') WHERE "name" = 'stageTimingsJson'`)).toBe("1");
    expect(runSqlite(dbPath, `SELECT COUNT(*) FROM pragma_table_info('background_task_runs') WHERE "name" = 'taskTimelineJson'`)).toBe("1");
    expect(runSqlite(dbPath, `SELECT COUNT(*) FROM pragma_table_info('source_groups') WHERE "name" = 'sortOrder'`)).toBe("1");
    expect(runSqlite(dbPath, `SELECT COUNT(*) FROM pragma_table_info('items') WHERE "name" = 'summaryStatus'`)).toBe("1");
    expect(runSqlite(dbPath, `SELECT COUNT(*) FROM pragma_table_info('items') WHERE "name" = 'analysisStatus'`)).toBe("1");
    expect(runSqlite(dbPath, `SELECT COUNT(*) FROM pragma_table_info('items') WHERE "name" = 'manualClusterAssignedAt'`)).toBe("1");
    expect(runSqlite(dbPath, `SELECT COUNT(*) FROM pragma_table_info('daily_reports') WHERE "name" = 'candidateSnapshot'`)).toBe("1");
    expect(runSqlite(dbPath, `SELECT COUNT(*) FROM pragma_table_info('sources') WHERE "name" = 'healthStatus'`)).toBe("1");
    expect(runSqlite(dbPath, `SELECT COUNT(*) FROM "sqlite_master" WHERE "type" = 'index' AND "name" = 'sources_enabled_healthStatus_idx'`)).toBe("1");
    expect(runSqlite(dbPath, `SELECT COUNT(*) FROM "sqlite_master" WHERE "type" = 'index' AND "name" = 'items_status_moderationStatus_updatedAt_idx'`)).toBe("1");
    expect(runSqlite(dbPath, "PRAGMA journal_mode")).toBe("wal");
  });

  it("adds source health columns before creating the source health index on legacy databases", () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "infinitum-sqlite-legacy-"));
    const dbPath = path.join(tempDir, "legacy.db");

    tempDirs.push(tempDir);

    runSqlite(
      dbPath,
      `
      CREATE TABLE "sources" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "groupId" TEXT,
        "name" TEXT NOT NULL,
        "rssUrl" TEXT NOT NULL,
        "siteUrl" TEXT NOT NULL,
        "enabled" BOOLEAN NOT NULL DEFAULT true,
        "aiParsingEnabled" BOOLEAN NOT NULL DEFAULT true,
        "aggregationEnabled" BOOLEAN NOT NULL DEFAULT true,
        "feedEtag" TEXT,
        "feedLastModified" TEXT,
        "feedContentHash" TEXT,
        "lastFetchedAt" DATETIME,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL
      );
      CREATE UNIQUE INDEX "sources_rssUrl_key" ON "sources"("rssUrl");
      `,
    );

    execFileSync("node", ["scripts/setup-sqlite.mjs", dbPath], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: process.env,
    });

    expect(runSqlite(dbPath, `SELECT COUNT(*) FROM pragma_table_info('sources') WHERE "name" = 'healthStatus'`)).toBe("1");
    expect(runSqlite(dbPath, `SELECT COUNT(*) FROM pragma_table_info('sources') WHERE "name" = 'healthMessage'`)).toBe("1");
    expect(runSqlite(dbPath, `SELECT COUNT(*) FROM pragma_table_info('sources') WHERE "name" = 'healthCheckedAt'`)).toBe("1");
    expect(runSqlite(dbPath, `SELECT COUNT(*) FROM "sqlite_master" WHERE "type" = 'index' AND "name" = 'sources_enabled_healthStatus_idx'`)).toBe("1");
  });

  it("adds daily report candidate snapshots on legacy databases", () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "infinitum-sqlite-daily-report-legacy-"));
    const dbPath = path.join(tempDir, "legacy.db");

    tempDirs.push(tempDir);

    runSqlite(
      dbPath,
      `
      CREATE TABLE "daily_reports" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "date" TEXT NOT NULL,
        "timezone" TEXT NOT NULL DEFAULT 'Asia/Shanghai',
        "status" TEXT NOT NULL DEFAULT 'draft',
        "title" TEXT NOT NULL,
        "openingSummary" TEXT NOT NULL,
        "closingThought" TEXT NOT NULL,
        "summaryJson" TEXT NOT NULL,
        "renderedMarkdown" TEXT NOT NULL,
        "inputHash" TEXT NOT NULL,
        "modelName" TEXT,
        "taskRunId" TEXT,
        "errorMessage" TEXT,
        "publishedAt" DATETIME,
        "generatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL
      );
      `,
    );

    execFileSync("node", ["scripts/setup-sqlite.mjs", dbPath], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: process.env,
    });

    expect(runSqlite(dbPath, `SELECT COUNT(*) FROM pragma_table_info('daily_reports') WHERE "name" = 'candidateSnapshot'`)).toBe("1");
  });
});
