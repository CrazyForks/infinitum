-- CreateTable
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
    "healthStatus" TEXT NOT NULL DEFAULT 'unknown',
    "healthMessage" TEXT,
    "healthCheckedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "sources_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "source_groups" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "items" (
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
    "summaryStatus" TEXT NOT NULL DEFAULT 'pending',
    "analysisStatus" TEXT NOT NULL DEFAULT 'pending',
    "filterReason" TEXT,
    "moderationStatus" TEXT NOT NULL DEFAULT 'allowed',
    "moderationReason" TEXT,
    "moderationDetail" TEXT,
    "qualityScore" INTEGER NOT NULL DEFAULT 50,
    "qualityRationale" TEXT NOT NULL DEFAULT 'AI analysis unavailable',
    "eventType" TEXT,
    "eventSubject" TEXT,
    "eventAction" TEXT,
    "eventObject" TEXT,
    "eventDate" TEXT,
    "aiProcessedAt" DATETIME,
    "manualClusterAssignedAt" DATETIME,
    "restoredByAdminAt" DATETIME,
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "items_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "sources" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "items_clusterId_fkey" FOREIGN KEY ("clusterId") REFERENCES "content_clusters" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "content_clusters" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL DEFAULT 'topic',
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "summaryInputHash" TEXT,
    "mergeInputHash" TEXT,
    "score" INTEGER NOT NULL DEFAULT 50,
    "itemCount" INTEGER NOT NULL DEFAULT 0,
    "latestPublishedAt" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "fingerprint" TEXT NOT NULL,
    "eventType" TEXT,
    "eventSubject" TEXT,
    "eventAction" TEXT,
    "eventObject" TEXT,
    "eventDate" TEXT,
    "upvotes" INTEGER NOT NULL DEFAULT 0,
    "downvotes" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "visitor_cluster_votes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clusterId" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "voteType" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "visitor_cluster_votes_clusterId_fkey" FOREIGN KEY ("clusterId") REFERENCES "content_clusters" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "fetch_runs" (
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

-- CreateTable
CREATE TABLE "task_schedules" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "cronExpression" TEXT NOT NULL DEFAULT '0 * * * *',
    "sourceConcurrency" INTEGER NOT NULL DEFAULT 2,
    "fullTextFetchThreshold" INTEGER NOT NULL DEFAULT 80,
    "perSourceItemLimit" INTEGER NOT NULL DEFAULT 20,
    "dailyReportCandidateLimit" INTEGER NOT NULL DEFAULT 120,
    "dailyReportOffsetDays" INTEGER NOT NULL DEFAULT 0,
    "dailyReportAutoPublish" BOOLEAN NOT NULL DEFAULT false,
    "dailyReportMaxRetries" INTEGER NOT NULL DEFAULT 0,
    "dailyReportGroupIdsJson" TEXT NOT NULL DEFAULT '',
    "cleanupRetentionDays" INTEGER NOT NULL DEFAULT 365,
    "processingStartAt" DATETIME,
    "timezone" TEXT NOT NULL,
    "lastHeartbeatAt" DATETIME,
    "lastRunStartedAt" DATETIME,
    "lastRunFinishedAt" DATETIME,
    "lastRunStatus" TEXT,
    "nextRunAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "background_task_runs" (
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
    "fullTextFetchedCount" INTEGER NOT NULL DEFAULT 0,
    "aiCallCountActual" INTEGER NOT NULL DEFAULT 0,
    "aiCallCountEstimated" INTEGER NOT NULL DEFAULT 0,
    "aiCallBreakdownJson" TEXT,
    "cancelRequestedAt" DATETIME,
    "startedAt" DATETIME,
    "finishedAt" DATETIME,
    "errorSummary" TEXT,
    "stageTimingsJson" TEXT,
    "taskTimelineJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
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
    "candidateSnapshot" TEXT,
    "errorMessage" TEXT,
    "publishedAt" DATETIME,
    "generatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "daily_reports_taskRunId_fkey" FOREIGN KEY ("taskRunId") REFERENCES "background_task_runs" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "daily_report_sources" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "dailyReportId" TEXT NOT NULL,
    "sourceNumber" INTEGER,
    "sourceKey" TEXT,
    "itemId" TEXT,
    "clusterId" TEXT,
    "sourceName" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "sourceSummary" TEXT,
    "sourcePublishedAt" DATETIME,
    "sourceQualityScore" INTEGER,
    "eventType" TEXT,
    "eventSubject" TEXT,
    "eventAction" TEXT,
    "eventObject" TEXT,
    "eventDate" TEXT,
    "sectionName" TEXT,
    "topic" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "daily_report_sources_dailyReportId_fkey" FOREIGN KEY ("dailyReportId") REFERENCES "daily_reports" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "daily_report_sources_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "daily_report_sources_clusterId_fkey" FOREIGN KEY ("clusterId") REFERENCES "content_clusters" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "daily_report_refinement_sessions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "dailyReportId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "baseContentJson" TEXT NOT NULL,
    "currentDraftJson" TEXT NOT NULL,
    "sourceRegistryJson" TEXT NOT NULL,
    "providerSessionId" TEXT,
    "providerResponseId" TEXT,
    "modelName" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "finishedAt" DATETIME,
    CONSTRAINT "daily_report_refinement_sessions_dailyReportId_fkey" FOREIGN KEY ("dailyReportId") REFERENCES "daily_reports" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "daily_report_refinement_messages" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "candidateJson" TEXT,
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "daily_report_refinement_messages_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "daily_report_refinement_sessions" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "source_groups" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "model_api_configs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "apiKey" TEXT NOT NULL DEFAULT '',
    "modelName" TEXT NOT NULL,
    "ingestionItemConcurrency" INTEGER NOT NULL DEFAULT 3,
    "customHeaders" TEXT NOT NULL DEFAULT '',
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "prompt_configs" (
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

-- CreateTable
CREATE TABLE "source_health_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourceId" TEXT NOT NULL,
    "sourceName" TEXT NOT NULL,
    "fromStatus" TEXT NOT NULL,
    "toStatus" TEXT NOT NULL,
    "message" TEXT,
    "changedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "blacklist_keywords" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "keyword" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "page_views" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "path" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "sources_rssUrl_key" ON "sources"("rssUrl");

-- CreateIndex
CREATE INDEX "sources_groupId_name_idx" ON "sources"("groupId", "name");

-- CreateIndex
CREATE INDEX "sources_enabled_healthStatus_idx" ON "sources"("enabled", "healthStatus");

-- CreateIndex
CREATE UNIQUE INDEX "items_urlHash_key" ON "items"("urlHash");

-- CreateIndex
CREATE UNIQUE INDEX "items_dedupeSignature_key" ON "items"("dedupeSignature");

-- CreateIndex
CREATE INDEX "items_sourceId_publishedAt_idx" ON "items"("sourceId", "publishedAt");

-- CreateIndex
CREATE INDEX "items_status_publishedAt_idx" ON "items"("status", "publishedAt");

-- CreateIndex
CREATE INDEX "items_moderationStatus_publishedAt_idx" ON "items"("moderationStatus", "publishedAt");

-- CreateIndex
CREATE INDEX "items_status_moderationStatus_createdAt_idx" ON "items"("status", "moderationStatus", "createdAt");

-- CreateIndex
CREATE INDEX "items_status_moderationStatus_updatedAt_idx" ON "items"("status", "moderationStatus", "updatedAt");

-- CreateIndex
CREATE INDEX "items_clusterId_publishedAt_idx" ON "items"("clusterId", "publishedAt");

-- CreateIndex
CREATE INDEX "items_clusterId_status_moderationStatus_updatedAt_idx" ON "items"("clusterId", "status", "moderationStatus", "updatedAt");

-- CreateIndex
CREATE INDEX "items_qualityScore_publishedAt_idx" ON "items"("qualityScore", "publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "content_clusters_fingerprint_key" ON "content_clusters"("fingerprint");

-- CreateIndex
CREATE INDEX "content_clusters_status_latestPublishedAt_idx" ON "content_clusters"("status", "latestPublishedAt");

-- CreateIndex
CREATE INDEX "content_clusters_upvotes_downvotes_idx" ON "content_clusters"("upvotes", "downvotes");

-- CreateIndex
CREATE INDEX "visitor_cluster_votes_visitorId_idx" ON "visitor_cluster_votes"("visitorId");

-- CreateIndex
CREATE UNIQUE INDEX "visitor_cluster_votes_clusterId_visitorId_key" ON "visitor_cluster_votes"("clusterId", "visitorId");

-- CreateIndex
CREATE INDEX "fetch_runs_taskRunId_idx" ON "fetch_runs"("taskRunId");

-- CreateIndex
CREATE INDEX "fetch_runs_startedAt_idx" ON "fetch_runs"("startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "task_schedules_key_key" ON "task_schedules"("key");

-- CreateIndex
CREATE INDEX "background_task_runs_status_createdAt_idx" ON "background_task_runs"("status", "createdAt");

-- CreateIndex
CREATE INDEX "background_task_runs_kind_status_createdAt_idx" ON "background_task_runs"("kind", "status", "createdAt");

-- CreateIndex
CREATE INDEX "daily_reports_status_date_idx" ON "daily_reports"("status", "date");

-- CreateIndex
CREATE INDEX "daily_reports_taskRunId_idx" ON "daily_reports"("taskRunId");

-- CreateIndex
CREATE UNIQUE INDEX "daily_reports_date_timezone_key" ON "daily_reports"("date", "timezone");

-- CreateIndex
CREATE INDEX "daily_report_sources_dailyReportId_idx" ON "daily_report_sources"("dailyReportId");

-- CreateIndex
CREATE INDEX "daily_report_sources_dailyReportId_sourceNumber_idx" ON "daily_report_sources"("dailyReportId", "sourceNumber");

-- CreateIndex
CREATE INDEX "daily_report_sources_dailyReportId_sourceKey_idx" ON "daily_report_sources"("dailyReportId", "sourceKey");

-- CreateIndex
CREATE INDEX "daily_report_sources_itemId_idx" ON "daily_report_sources"("itemId");

-- CreateIndex
CREATE INDEX "daily_report_sources_clusterId_idx" ON "daily_report_sources"("clusterId");

-- CreateIndex
CREATE INDEX "daily_report_refinement_sessions_dailyReportId_updatedAt_idx" ON "daily_report_refinement_sessions"("dailyReportId", "updatedAt");

-- CreateIndex
CREATE INDEX "daily_report_refinement_messages_sessionId_createdAt_idx" ON "daily_report_refinement_messages"("sessionId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "source_groups_name_key" ON "source_groups"("name");

-- CreateIndex
CREATE INDEX "source_groups_sortOrder_name_idx" ON "source_groups"("sortOrder", "name");

-- CreateIndex
CREATE INDEX "model_api_configs_isEnabled_isDefault_idx" ON "model_api_configs"("isEnabled", "isDefault");

-- CreateIndex
CREATE INDEX "prompt_configs_type_isEnabled_isDefault_idx" ON "prompt_configs"("type", "isEnabled", "isDefault");

-- CreateIndex
CREATE INDEX "prompt_configs_modelApiConfigId_idx" ON "prompt_configs"("modelApiConfigId");

-- CreateIndex
CREATE INDEX "source_health_logs_sourceId_changedAt_idx" ON "source_health_logs"("sourceId", "changedAt");

-- CreateIndex
CREATE INDEX "source_health_logs_changedAt_idx" ON "source_health_logs"("changedAt");

-- CreateIndex
CREATE UNIQUE INDEX "blacklist_keywords_keyword_key" ON "blacklist_keywords"("keyword");

-- CreateIndex
CREATE INDEX "page_views_path_date_idx" ON "page_views"("path", "date");

-- CreateIndex
CREATE INDEX "page_views_path_date_visitorId_idx" ON "page_views"("path", "date", "visitorId");
