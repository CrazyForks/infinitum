import path from "node:path";

import { PrismaClient } from "@prisma/client";

declare global {
  var __prisma__: PrismaClient | undefined;
}

const DEFAULT_SQLITE_CONNECTION_LIMIT = "1";
const DEFAULT_SQLITE_SOCKET_TIMEOUT_SECONDS = "20";

function addSqliteConnectionOptions(databaseUrl: string) {
  if (!databaseUrl.startsWith("file:")) {
    return databaseUrl;
  }

  const [baseUrl, rawQuery = ""] = databaseUrl.split("?");
  const params = new URLSearchParams(rawQuery);

  if (!params.has("connection_limit")) {
    params.set("connection_limit", process.env.SQLITE_PRISMA_CONNECTION_LIMIT || DEFAULT_SQLITE_CONNECTION_LIMIT);
  }

  if (!params.has("socket_timeout")) {
    params.set(
      "socket_timeout",
      process.env.SQLITE_PRISMA_SOCKET_TIMEOUT_SECONDS || DEFAULT_SQLITE_SOCKET_TIMEOUT_SECONDS,
    );
  }

  return `${baseUrl}?${params.toString()}`;
}

function resolveDatabaseUrl() {
  const configuredUrl = process.env.DATABASE_URL;

  if (!configuredUrl) {
    return addSqliteConnectionOptions(
      `file:${path.join(/* turbopackIgnore: true */ process.cwd(), "prisma", "dev.db")}`,
    );
  }

  if (configuredUrl.startsWith("file:./")) {
    const relativeUrl = configuredUrl.slice("file:./".length);
    const [relativePath, rawQuery = ""] = relativeUrl.split("?");
    const resolvedPath = path.join(/* turbopackIgnore: true */ process.cwd(), relativePath);

    return addSqliteConnectionOptions(
      rawQuery ? `file:${resolvedPath}?${rawQuery}` : `file:${resolvedPath}`,
    );
  }

  return addSqliteConnectionOptions(configuredUrl);
}

export const prisma =
  globalThis.__prisma__ ??
  new PrismaClient({
    datasources: {
      db: {
        url: resolveDatabaseUrl(),
      },
    },
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__prisma__ = prisma;
}
