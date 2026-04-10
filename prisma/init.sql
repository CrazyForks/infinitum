PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS "sources" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "rssUrl" TEXT NOT NULL,
  "siteUrl" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "fetchFullTextWhenMissing" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS "items" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "sourceId" TEXT NOT NULL,
  "originalUrl" TEXT NOT NULL,
  "canonicalUrl" TEXT NOT NULL,
  "urlHash" TEXT NOT NULL,
  "dedupeSignature" TEXT NOT NULL,
  "originalTitle" TEXT NOT NULL,
  "translatedTitle" TEXT,
  "author" TEXT,
  "publishedAt" DATETIME NOT NULL,
  "rssExcerpt" TEXT,
  "rssContent" TEXT,
  "fullText" TEXT,
  "summaryText" TEXT,
  "language" TEXT,
  "status" TEXT NOT NULL DEFAULT 'new',
  "filterReason" TEXT,
  "errorMessage" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "items_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "sources" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "fetch_runs" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "triggerType" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'running',
  "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" DATETIME,
  "sourceCount" INTEGER NOT NULL DEFAULT 0,
  "itemCount" INTEGER NOT NULL DEFAULT 0,
  "successCount" INTEGER NOT NULL DEFAULT 0,
  "failureCount" INTEGER NOT NULL DEFAULT 0,
  "errorSummary" TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS "sources_rssUrl_key" ON "sources"("rssUrl");
CREATE UNIQUE INDEX IF NOT EXISTS "items_urlHash_key" ON "items"("urlHash");
CREATE UNIQUE INDEX IF NOT EXISTS "items_dedupeSignature_key" ON "items"("dedupeSignature");
CREATE INDEX IF NOT EXISTS "items_sourceId_publishedAt_idx" ON "items"("sourceId", "publishedAt");
CREATE INDEX IF NOT EXISTS "items_status_publishedAt_idx" ON "items"("status", "publishedAt");
CREATE INDEX IF NOT EXISTS "fetch_runs_startedAt_idx" ON "fetch_runs"("startedAt");
