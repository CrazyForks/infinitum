import path from "node:path";

import { PrismaClient } from "@prisma/client";

declare global {
  var __prisma__: PrismaClient | undefined;
}

function resolveDatabaseUrl() {
  const configuredUrl = process.env.DATABASE_URL;

  if (!configuredUrl) {
    return `file:${path.join(/* turbopackIgnore: true */ process.cwd(), "prisma", "dev.db")}`;
  }

  if (configuredUrl.startsWith("file:./")) {
    return `file:${path.join(
      /* turbopackIgnore: true */ process.cwd(),
      configuredUrl.slice("file:./".length),
    )}`;
  }

  return configuredUrl;
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
