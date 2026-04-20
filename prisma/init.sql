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
  "clusterId" TEXT,
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
  "moderationStatus" TEXT NOT NULL DEFAULT 'allowed',
  "moderationReason" TEXT,
  "moderationDetail" TEXT,
  "qualityScore" INTEGER NOT NULL DEFAULT 50,
  "qualityRationale" TEXT NOT NULL DEFAULT 'AI analysis unavailable',
  "topicLabel" TEXT,
  "aiProcessedAt" DATETIME,
  "restoredByAdminAt" DATETIME,
  "errorMessage" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "items_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "sources" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "items_clusterId_fkey" FOREIGN KEY ("clusterId") REFERENCES "content_clusters" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "content_clusters" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "kind" TEXT NOT NULL DEFAULT 'topic',
  "title" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "score" INTEGER NOT NULL DEFAULT 50,
  "itemCount" INTEGER NOT NULL DEFAULT 0,
  "latestPublishedAt" DATETIME NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "fingerprint" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS "fetch_runs" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "taskRunId" TEXT,
  "triggerType" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'running',
  "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" DATETIME,
  "sourceCount" INTEGER NOT NULL DEFAULT 0,
  "itemCount" INTEGER NOT NULL DEFAULT 0,
  "successCount" INTEGER NOT NULL DEFAULT 0,
  "failureCount" INTEGER NOT NULL DEFAULT 0,
  "itemsAdded" INTEGER NOT NULL DEFAULT 0,
  "errorSummary" TEXT,
  CONSTRAINT "fetch_runs_taskRunId_fkey" FOREIGN KEY ("taskRunId") REFERENCES "background_task_runs" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "task_schedules" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "key" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "intervalMinutes" INTEGER NOT NULL,
  "timezone" TEXT NOT NULL,
  "lastHeartbeatAt" DATETIME,
  "lastRunStartedAt" DATETIME,
  "lastRunFinishedAt" DATETIME,
  "lastRunStatus" TEXT,
  "nextRunAt" DATETIME NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS "background_task_runs" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "kind" TEXT NOT NULL,
  "triggerType" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'queued',
  "label" TEXT NOT NULL,
  "entityId" TEXT,
  "progressCurrent" INTEGER NOT NULL DEFAULT 0,
  "progressTotal" INTEGER NOT NULL DEFAULT 0,
  "progressLabel" TEXT,
  "itemsAdded" INTEGER NOT NULL DEFAULT 0,
  "aiCallCountActual" INTEGER NOT NULL DEFAULT 0,
  "aiCallCountEstimated" INTEGER NOT NULL DEFAULT 0,
  "cancelRequestedAt" DATETIME,
  "startedAt" DATETIME,
  "finishedAt" DATETIME,
  "errorSummary" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS "source_groups" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS "model_api_configs" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "baseUrl" TEXT NOT NULL,
  "apiKey" TEXT NOT NULL DEFAULT '',
  "modelName" TEXT NOT NULL,
  "ingestionItemConcurrency" INTEGER NOT NULL DEFAULT 3,
  "isEnabled" BOOLEAN NOT NULL DEFAULT true,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS "prompt_configs" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "prompt" TEXT NOT NULL,
  "systemPrompt" TEXT,
  "temperature" REAL,
  "maxTokens" INTEGER,
  "topP" REAL,
  "modelApiConfigId" TEXT,
  "isEnabled" BOOLEAN NOT NULL DEFAULT true,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "prompt_configs_modelApiConfigId_fkey" FOREIGN KEY ("modelApiConfigId") REFERENCES "model_api_configs" ("id") ON DELETE SET NULL ON UPDATE CASCADE
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
CREATE INDEX IF NOT EXISTS "items_moderationStatus_publishedAt_idx" ON "items"("moderationStatus", "publishedAt");
CREATE INDEX IF NOT EXISTS "items_clusterId_publishedAt_idx" ON "items"("clusterId", "publishedAt");
CREATE INDEX IF NOT EXISTS "items_qualityScore_publishedAt_idx" ON "items"("qualityScore", "publishedAt");
CREATE UNIQUE INDEX IF NOT EXISTS "content_clusters_fingerprint_key" ON "content_clusters"("fingerprint");
CREATE INDEX IF NOT EXISTS "content_clusters_status_latestPublishedAt_idx" ON "content_clusters"("status", "latestPublishedAt");
CREATE UNIQUE INDEX IF NOT EXISTS "task_schedules_key_key" ON "task_schedules"("key");
CREATE INDEX IF NOT EXISTS "background_task_runs_status_createdAt_idx" ON "background_task_runs"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "background_task_runs_kind_status_createdAt_idx" ON "background_task_runs"("kind", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "fetch_runs_taskRunId_idx" ON "fetch_runs"("taskRunId");
CREATE INDEX IF NOT EXISTS "fetch_runs_startedAt_idx" ON "fetch_runs"("startedAt");
CREATE UNIQUE INDEX IF NOT EXISTS "source_groups_name_key" ON "source_groups"("name");
CREATE INDEX IF NOT EXISTS "model_api_configs_isEnabled_isDefault_idx" ON "model_api_configs"("isEnabled", "isDefault");
CREATE INDEX IF NOT EXISTS "prompt_configs_type_isEnabled_isDefault_idx" ON "prompt_configs"("type", "isEnabled", "isDefault");
CREATE INDEX IF NOT EXISTS "prompt_configs_modelApiConfigId_idx" ON "prompt_configs"("modelApiConfigId");
CREATE UNIQUE INDEX IF NOT EXISTS "blacklist_keywords_keyword_key" ON "blacklist_keywords"("keyword");
