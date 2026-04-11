PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS "sources" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "groupId" TEXT,
  "name" TEXT NOT NULL,
  "rssUrl" TEXT NOT NULL,
  "siteUrl" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "fetchFullTextWhenMissing" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "sources_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "source_groups" ("id") ON DELETE SET NULL ON UPDATE CASCADE
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

CREATE TABLE IF NOT EXISTS "source_groups" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS "app_config" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "modelApiKey" TEXT NOT NULL DEFAULT '',
  "modelApiBaseUrl" TEXT NOT NULL DEFAULT '',
  "modelApiModel" TEXT NOT NULL DEFAULT 'gpt-4.1-mini',
  "ingestionItemConcurrency" INTEGER NOT NULL DEFAULT 3,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS "blacklist_keywords" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "keyword" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "sources_rssUrl_key" ON "sources"("rssUrl");
CREATE INDEX IF NOT EXISTS "sources_groupId_name_idx" ON "sources"("groupId", "name");
CREATE UNIQUE INDEX IF NOT EXISTS "items_urlHash_key" ON "items"("urlHash");
CREATE UNIQUE INDEX IF NOT EXISTS "items_dedupeSignature_key" ON "items"("dedupeSignature");
CREATE INDEX IF NOT EXISTS "items_sourceId_publishedAt_idx" ON "items"("sourceId", "publishedAt");
CREATE INDEX IF NOT EXISTS "items_status_publishedAt_idx" ON "items"("status", "publishedAt");
CREATE INDEX IF NOT EXISTS "fetch_runs_startedAt_idx" ON "fetch_runs"("startedAt");
CREATE UNIQUE INDEX IF NOT EXISTS "source_groups_name_key" ON "source_groups"("name");
CREATE UNIQUE INDEX IF NOT EXISTS "blacklist_keywords_keyword_key" ON "blacklist_keywords"("keyword");
