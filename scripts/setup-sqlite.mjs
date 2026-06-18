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
const itemAdminClusterIndexName = "items_clusterId_status_moderationStatus_updatedAt_idx";

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
    .replace(/^CREATE INDEX /gm, "CREATE INDEX IF NOT EXISTS ");
}

function runSqlite(commandArgs, options = {}) {
  return execFileSync("sqlite3", commandArgs, {
    stdio: ["pipe", "inherit", "inherit"],
    ...options,
  });
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

function indexStatsExist(indexName) {
  if (!ftsTableExists("sqlite_stat1")) {
    return false;
  }

  const result = execFileSync(
    "sqlite3",
    [dbPath, `SELECT COUNT(*) FROM sqlite_stat1 WHERE idx = '${indexName}'`],
    {
      encoding: "utf8",
    },
  ).trim();

  return Number(result) > 0;
}

function applyRuntimeSqliteObjects() {
  if (!indexStatsExist(itemAdminClusterIndexName)) {
    runSqlite([dbPath], {
      input: `ANALYZE "items";\n`,
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

function tableColumnExists(tableName, columnName) {
  const escapedTableName = tableName.replace(/'/g, "''");
  const escapedColumnName = columnName.replace(/'/g, "''");
  const result = execFileSync(
    "sqlite3",
    [dbPath, `SELECT COUNT(*) FROM pragma_table_info('${escapedTableName}') WHERE name='${escapedColumnName}'`],
    {
      encoding: "utf8",
    },
  ).trim();

  return Number(result) > 0;
}

function applyAdditiveSchemaUpgrades() {
  if (ftsTableExists("prompt_configs") && !tableColumnExists("prompt_configs", "templateJson")) {
    runSqlite([dbPath], {
      input: `ALTER TABLE "prompt_configs" ADD COLUMN "templateJson" TEXT;\n`,
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
  applyAdditiveSchemaUpgrades();
  applyRuntimeSqliteObjects();

  if (testHoldMs > 0) {
    sleep(testHoldMs);
  }

  console.log(`Database initialized: ${dbPath}`);
} finally {
  releaseSetupLock();
}
