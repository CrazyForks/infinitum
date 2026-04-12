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

function runSqlite(commandArgs, options = {}) {
  return execFileSync("sqlite3", commandArgs, {
    stdio: ["pipe", "inherit", "inherit"],
    ...options,
  });
}

function getTableColumns(tableName) {
  const output = execFileSync("sqlite3", [dbPath, `PRAGMA table_info("${tableName}");`], {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "inherit"],
  });

  return output
    .split("\n")
    .filter(Boolean)
    .map((line) => line.split("|")[1])
    .filter(Boolean);
}

function ensureColumn(tableName, columnName, columnDefinition) {
  const columns = getTableColumns(tableName);

  if (columns.includes(columnName)) {
    return;
  }

  runSqlite([dbPath, `ALTER TABLE "${tableName}" ADD COLUMN "${columnName}" ${columnDefinition};`]);
}

mkdirSync(dbDir, { recursive: true });

if (shouldReset) {
  rmSync(dbPath, { force: true });
}

runSqlite([dbPath], {
  input: sql,
});

ensureColumn(
  "app_config",
  "clusterMatchPrompt",
  `TEXT NOT NULL DEFAULT '你是内容归组助手。请判断当前内容是否属于给定候选聚合组中的某一个。只返回 JSON，格式为 {"clusterId":"候选组ID"} 或 {"clusterId":null}。只有当候选组与当前内容描述的是同一事件、同一产品发布、同一公告或高度一致的主题时才匹配；如果只是大类相近但并非同一件事，请返回 null。'`,
);

ensureColumn("fetch_runs", "taskRunId", "TEXT");
