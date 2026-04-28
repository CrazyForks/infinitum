import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
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
const lockPath = `${dbPath}.setup.lock`;
const lockTimeoutMs = Number.parseInt(process.env.SQLITE_SETUP_LOCK_TIMEOUT_MS || "30000", 10);
const staleLockMs = Number.parseInt(process.env.SQLITE_SETUP_STALE_LOCK_MS || "120000", 10);
const testHoldMs = Number.parseInt(process.env.SQLITE_SETUP_LOCK_HOLD_MS || "0", 10);
const sqliteBusyTimeoutMs = Number.parseInt(process.env.SQLITE_BUSY_TIMEOUT_MS || "10000", 10);
const sleepBuffer = new SharedArrayBuffer(4);
const sleepView = new Int32Array(sleepBuffer);

const sqliteRuntimePragmas = [
  "PRAGMA journal_mode = WAL;",
  `PRAGMA busy_timeout = ${sqliteBusyTimeoutMs};`,
  "PRAGMA synchronous = NORMAL;",
  "PRAGMA foreign_keys = ON;",
].join("\n");

function resolvePrismaCliPath() {
  const cliFileName = process.platform === "win32" ? "prisma.cmd" : "prisma";
  const cliPath = path.resolve(root, "node_modules", ".bin", cliFileName);

  if (!existsSync(cliPath)) {
    throw new Error(`Prisma CLI not found at ${cliPath}`);
  }

  return cliPath;
}

function loadSchemaSql() {
  const prebuiltSchemaSqlPath = path.resolve(root, "prisma", "schema.sql");

  if (existsSync(prebuiltSchemaSqlPath)) {
    return readFileSync(prebuiltSchemaSqlPath, "utf8");
  }

  const prismaSchemaPath = path.resolve(root, "prisma", "schema.prisma");

  return execFileSync(
    resolvePrismaCliPath(),
    ["migrate", "diff", "--from-empty", "--to-schema-datamodel", prismaSchemaPath, "--script"],
    {
      cwd: root,
      encoding: "utf8",
      env: process.env,
    },
  );
}

function makeSqliteSchemaIdempotent(sql) {
  return sql
    .replace(/^CREATE TABLE /gm, "CREATE TABLE IF NOT EXISTS ")
    .replace(/^CREATE UNIQUE INDEX /gm, "CREATE UNIQUE INDEX IF NOT EXISTS ")
    .replace(/^CREATE INDEX /gm, "CREATE INDEX IF NOT EXISTS ")
    .replace(/^CREATE INDEX IF NOT EXISTS "sources_enabled_healthStatus_idx" ON "sources"\("enabled", "healthStatus"\);\n?/gm, "")
    .replace(/^CREATE INDEX IF NOT EXISTS "source_groups_sortOrder_name_idx" ON "source_groups"\("sortOrder", "name"\);\n?/gm, "");
}

function runSqlite(commandArgs, options = {}) {
  return execFileSync("sqlite3", commandArgs, {
    stdio: ["pipe", "inherit", "inherit"],
    ...options,
  });
}

function columnExists(tableName, columnName) {
  const result = execFileSync(
    "sqlite3",
    [dbPath, `SELECT COUNT(*) FROM pragma_table_info('${tableName}') WHERE name = '${columnName}'`],
    {
      encoding: "utf8",
    },
  ).trim();

  return result === "1";
}

function ftsTableExists(tableName) {
  const result = execFileSync(
    "sqlite3",
    [dbPath, `SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='${tableName}'`],
    {
      encoding: "utf8",
    },
  ).trim();

  return result === "1";
}

function applyIncrementalMigrations() {
  runSqlite([dbPath], {
    input: `CREATE INDEX IF NOT EXISTS "items_status_moderationStatus_updatedAt_idx" ON "items"("status", "moderationStatus", "updatedAt");\n`,
  });

  if (!columnExists("source_groups", "sortOrder")) {
    runSqlite([dbPath], {
      input: `ALTER TABLE "source_groups" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;\nCREATE INDEX IF NOT EXISTS "source_groups_sortOrder_name_idx" ON "source_groups"("sortOrder", "name");\n`,
    });
  }

  if (!columnExists("source_groups", "color")) {
    runSqlite([dbPath], {
      input: `ALTER TABLE "source_groups" ADD COLUMN "color" TEXT NOT NULL DEFAULT '';\n`,
    });
  }

  if (!columnExists("task_schedules", "processingStartAt")) {
    runSqlite([dbPath], {
      input: `ALTER TABLE "task_schedules" ADD COLUMN "processingStartAt" DATETIME;\n`,
    });
  }

  if (!columnExists("task_schedules", "dailyReportCandidateLimit")) {
    runSqlite([dbPath], {
      input: `ALTER TABLE "task_schedules" ADD COLUMN "dailyReportCandidateLimit" INTEGER NOT NULL DEFAULT 120;\n`,
    });
  }

  if (!columnExists("task_schedules", "dailyReportOffsetDays")) {
    runSqlite([dbPath], {
      input: `ALTER TABLE "task_schedules" ADD COLUMN "dailyReportOffsetDays" INTEGER NOT NULL DEFAULT 0;\n`,
    });
  }

  if (!columnExists("task_schedules", "dailyReportAutoPublish")) {
    runSqlite([dbPath], {
      input: `ALTER TABLE "task_schedules" ADD COLUMN "dailyReportAutoPublish" BOOLEAN NOT NULL DEFAULT false;\n`,
    });
  }

  if (!columnExists("task_schedules", "dailyReportMaxRetries")) {
    runSqlite([dbPath], {
      input: `ALTER TABLE "task_schedules" ADD COLUMN "dailyReportMaxRetries" INTEGER NOT NULL DEFAULT 0;\n`,
    });
  }

  if (!columnExists("sources", "aggregationEnabled")) {
    runSqlite([dbPath], {
      input: `ALTER TABLE "sources" ADD COLUMN "aggregationEnabled" BOOLEAN NOT NULL DEFAULT true;\n`,
    });
  }

  if (!columnExists("sources", "healthStatus")) {
    runSqlite([dbPath], {
      input: `ALTER TABLE "sources" ADD COLUMN "healthStatus" TEXT NOT NULL DEFAULT 'unknown';\nCREATE INDEX IF NOT EXISTS "sources_enabled_healthStatus_idx" ON "sources"("enabled", "healthStatus");\n`,
    });
  }

  runSqlite([dbPath], {
    input: `UPDATE "sources" SET "healthStatus" = 'unknown' WHERE "healthStatus" NOT IN ('unknown', 'healthy', 'failed');\nDROP INDEX IF EXISTS "sources_enabled_healthStatus_idx";\nCREATE INDEX "sources_enabled_healthStatus_idx" ON "sources"("enabled", "healthStatus");\n`,
  });

  if (!columnExists("sources", "healthMessage")) {
    runSqlite([dbPath], {
      input: `ALTER TABLE "sources" ADD COLUMN "healthMessage" TEXT;\n`,
    });
  }

  if (!columnExists("sources", "healthCheckedAt")) {
    runSqlite([dbPath], {
      input: `ALTER TABLE "sources" ADD COLUMN "healthCheckedAt" DATETIME;\n`,
    });
  }

  if (!columnExists("items", "manualClusterAssignedAt")) {
    runSqlite([dbPath], {
      input: `ALTER TABLE "items" ADD COLUMN "manualClusterAssignedAt" DATETIME;\n`,
    });
  }

  if (!columnExists("task_schedules", "cleanupRetentionDays")) {
    runSqlite([dbPath], {
      input: `ALTER TABLE "task_schedules" ADD COLUMN "cleanupRetentionDays" INTEGER NOT NULL DEFAULT 365;\n`,
    });
  }

  if (!columnExists("content_clusters", "summaryInputHash")) {
    runSqlite([dbPath], {
      input: `ALTER TABLE "content_clusters" ADD COLUMN "summaryInputHash" TEXT;\n`,
    });
  }

  if (!columnExists("content_clusters", "mergeInputHash")) {
    runSqlite([dbPath], {
      input: `ALTER TABLE "content_clusters" ADD COLUMN "mergeInputHash" TEXT;\n`,
    });
  }

  if (!ftsTableExists("items_fts")) {
    runSqlite([dbPath], {
      input: [
        `CREATE VIRTUAL TABLE IF NOT EXISTS items_fts USING fts5(
          originalTitle,
          translatedTitle,
          author,
          rssExcerpt,
          rssContent,
          fullText,
          summaryText,
          tokenize='trigram'
        );`,
        `INSERT INTO items_fts(rowid, originalTitle, translatedTitle, author, rssExcerpt, rssContent, fullText, summaryText)
         SELECT rowid, originalTitle, COALESCE(translatedTitle, ''), COALESCE(author, ''), COALESCE(rssExcerpt, ''),
                COALESCE(rssContent, ''), COALESCE(fullText, ''), COALESCE(summaryText, '')
         FROM items;`,
        `CREATE TRIGGER IF NOT EXISTS items_fts_ai AFTER INSERT ON items BEGIN
          INSERT INTO items_fts(rowid, originalTitle, translatedTitle, author, rssExcerpt, rssContent, fullText, summaryText)
          VALUES (new.rowid, COALESCE(new.originalTitle, ''), COALESCE(new.translatedTitle, ''), COALESCE(new.author, ''),
                  COALESCE(new.rssExcerpt, ''), COALESCE(new.rssContent, ''), COALESCE(new.fullText, ''), COALESCE(new.summaryText, ''));
        END;`,
        `CREATE TRIGGER IF NOT EXISTS items_fts_au AFTER UPDATE ON items BEGIN
          UPDATE items_fts SET
            originalTitle = COALESCE(new.originalTitle, ''),
            translatedTitle = COALESCE(new.translatedTitle, ''),
            author = COALESCE(new.author, ''),
            rssExcerpt = COALESCE(new.rssExcerpt, ''),
            rssContent = COALESCE(new.rssContent, ''),
            fullText = COALESCE(new.fullText, ''),
            summaryText = COALESCE(new.summaryText, '')
          WHERE rowid = old.rowid;
        END;`,
        `CREATE TRIGGER IF NOT EXISTS items_fts_ad AFTER DELETE ON items BEGIN
          DELETE FROM items_fts WHERE rowid = old.rowid;
        END;`,
      ].join("\n"),
    });
  }
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
    rmSync(`${dbPath}-shm`, { force: true });
    rmSync(`${dbPath}-wal`, { force: true });
  }

  const sql = `${sqliteRuntimePragmas}\n${makeSqliteSchemaIdempotent(loadSchemaSql())}\n${sqliteRuntimePragmas}\n`;
  runSqlite([dbPath], {
    input: sql,
  });
  applyIncrementalMigrations();

  if (testHoldMs > 0) {
    sleep(testHoldMs);
  }

  console.log(`Database initialized: ${dbPath}`);
} finally {
  releaseSetupLock();
}
