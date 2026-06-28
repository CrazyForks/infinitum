-- DropIndex
DROP INDEX "daily_report_refinement_messages_sessionId_createdAt_idx";

-- DropIndex
DROP INDEX "daily_report_refinement_sessions_dailyReportId_updatedAt_idx";

-- DropIndex
DROP INDEX "item_parsed_events_eventType_eventDate_idx";

-- DropIndex
DROP INDEX "item_parsed_events_clusterId_createdAt_idx";

-- DropIndex
DROP INDEX "item_parsed_events_fingerprint_idx";

-- DropIndex
DROP INDEX "item_parsed_events_itemId_eventIndex_idx";

-- DropIndex
DROP INDEX "item_parsed_events_itemId_fingerprint_key";

-- DropIndex
DROP INDEX "visitor_cluster_votes_clusterId_visitorId_key";

-- DropIndex
DROP INDEX "visitor_cluster_votes_visitorId_idx";

-- AlterTable
ALTER TABLE "prompt_configs" ADD COLUMN "templateJson" TEXT;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "daily_report_refinement_messages";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "daily_report_refinement_sessions";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "item_parsed_events";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "visitor_cluster_votes";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "aggregation_split_links" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "parentItemId" TEXT NOT NULL,
    "childItemId" TEXT NOT NULL,
    "eventIndex" INTEGER NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "title" TEXT,
    "oneLiner" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "aggregation_split_links_parentItemId_fkey" FOREIGN KEY ("parentItemId") REFERENCES "items" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "aggregation_split_links_childItemId_fkey" FOREIGN KEY ("childItemId") REFERENCES "items" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "cluster_merge_clean_pair_candidates" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "pairKey" TEXT NOT NULL,
    "leftClusterId" TEXT NOT NULL,
    "rightClusterId" TEXT NOT NULL,
    "leftInputHash" TEXT NOT NULL,
    "rightInputHash" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastEvaluatedAt" DATETIME,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "cluster_merge_clean_pair_candidates_leftClusterId_fkey" FOREIGN KEY ("leftClusterId") REFERENCES "content_clusters" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "cluster_merge_clean_pair_candidates_rightClusterId_fkey" FOREIGN KEY ("rightClusterId") REFERENCES "content_clusters" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "content_extraction_configs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jinaEnabled" BOOLEAN NOT NULL DEFAULT false,
    "jinaBaseUrl" TEXT NOT NULL DEFAULT 'https://r.jina.ai/',
    "jinaApiKey" TEXT,
    "timeoutMs" INTEGER NOT NULL DEFAULT 15000,
    "concurrency" INTEGER NOT NULL DEFAULT 1,
    "rpmLimit" INTEGER NOT NULL DEFAULT 10,
    "maxPerRun" INTEGER NOT NULL DEFAULT 20,
    "minChars" INTEGER NOT NULL DEFAULT 500,
    "maxChars" INTEGER NOT NULL DEFAULT 32000,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "tags" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "normalized" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "tag_aliases" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tagId" TEXT NOT NULL,
    "aliasName" TEXT NOT NULL,
    "aliasNormalized" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL DEFAULT 'admin',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "tag_aliases_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "tags" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "tag_suggestion_decisions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourceTagNormalized" TEXT NOT NULL,
    "targetTagNormalized" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "decidedBy" TEXT NOT NULL DEFAULT 'admin',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "item_tags" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "itemId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "item_tags_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "item_tags_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "tags" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_content_clusters" (
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
    "displayItemCount" INTEGER NOT NULL DEFAULT 0,
    "displaySourceCount" INTEGER NOT NULL DEFAULT 0,
    "displayAverageScore" INTEGER NOT NULL DEFAULT 0,
    "displayRecommendScore" INTEGER NOT NULL DEFAULT 0,
    "earliestCreatedAt" DATETIME,
    "latestCreatedAt" DATETIME,
    "dominantGroupId" TEXT,
    "feedSearchText" TEXT,
    "feedTagsJson" TEXT NOT NULL DEFAULT '[]',
    "feedStatsUpdatedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "content_clusters_dominantGroupId_fkey" FOREIGN KEY ("dominantGroupId") REFERENCES "source_groups" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_content_clusters" ("createdAt", "eventAction", "eventDate", "eventObject", "eventSubject", "eventType", "fingerprint", "id", "itemCount", "kind", "latestPublishedAt", "mergeInputHash", "score", "status", "summary", "summaryInputHash", "title", "updatedAt") SELECT "createdAt", "eventAction", "eventDate", "eventObject", "eventSubject", "eventType", "fingerprint", "id", "itemCount", "kind", "latestPublishedAt", "mergeInputHash", "score", "status", "summary", "summaryInputHash", "title", "updatedAt" FROM "content_clusters";
DROP TABLE "content_clusters";
ALTER TABLE "new_content_clusters" RENAME TO "content_clusters";
CREATE UNIQUE INDEX "content_clusters_fingerprint_key" ON "content_clusters"("fingerprint");
CREATE INDEX "content_clusters_status_latestPublishedAt_idx" ON "content_clusters"("status", "latestPublishedAt");
CREATE INDEX "content_clusters_status_earliestCreatedAt_idx" ON "content_clusters"("status", "earliestCreatedAt");
CREATE INDEX "content_clusters_status_latestCreatedAt_idx" ON "content_clusters"("status", "latestCreatedAt");
CREATE INDEX "content_clusters_status_displayRecommendScore_idx" ON "content_clusters"("status", "displayRecommendScore");
CREATE INDEX "content_clusters_dominantGroupId_status_latestCreatedAt_idx" ON "content_clusters"("dominantGroupId", "status", "latestCreatedAt");
CREATE TABLE "new_items" (
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
    "isAggregation" BOOLEAN NOT NULL DEFAULT false,
    "aggregationCheckedAt" DATETIME,
    "aggregationParseStatus" TEXT,
    "parentItemId" TEXT,
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "items_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "sources" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "items_clusterId_fkey" FOREIGN KEY ("clusterId") REFERENCES "content_clusters" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "items_parentItemId_fkey" FOREIGN KEY ("parentItemId") REFERENCES "items" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_items" ("aggregationCheckedAt", "aggregationParseStatus", "aiProcessedAt", "analysisStatus", "author", "canonicalUrl", "clusterId", "createdAt", "dedupeSignature", "errorMessage", "eventAction", "eventDate", "eventObject", "eventSubject", "eventType", "filterReason", "fullText", "id", "isAggregation", "language", "manualClusterAssignedAt", "moderationDetail", "moderationReason", "moderationStatus", "originalTitle", "originalUrl", "publishedAt", "qualityRationale", "qualityScore", "restoredByAdminAt", "rssContent", "rssExcerpt", "sourceId", "status", "summaryStatus", "summaryText", "translatedTitle", "updatedAt", "urlHash") SELECT "aggregationCheckedAt", "aggregationParseStatus", "aiProcessedAt", "analysisStatus", "author", "canonicalUrl", "clusterId", "createdAt", "dedupeSignature", "errorMessage", "eventAction", "eventDate", "eventObject", "eventSubject", "eventType", "filterReason", "fullText", "id", "isAggregation", "language", "manualClusterAssignedAt", "moderationDetail", "moderationReason", "moderationStatus", "originalTitle", "originalUrl", "publishedAt", "qualityRationale", "qualityScore", "restoredByAdminAt", "rssContent", "rssExcerpt", "sourceId", "status", "summaryStatus", "summaryText", "translatedTitle", "updatedAt", "urlHash" FROM "items";
DROP TABLE "items";
ALTER TABLE "new_items" RENAME TO "items";
CREATE UNIQUE INDEX "items_urlHash_key" ON "items"("urlHash");
CREATE UNIQUE INDEX "items_dedupeSignature_key" ON "items"("dedupeSignature");
CREATE INDEX "items_sourceId_publishedAt_idx" ON "items"("sourceId", "publishedAt");
CREATE INDEX "items_sourceId_status_moderationStatus_isAggregation_createdAt_idx" ON "items"("sourceId", "status", "moderationStatus", "isAggregation", "createdAt");
CREATE INDEX "items_status_publishedAt_idx" ON "items"("status", "publishedAt");
CREATE INDEX "items_moderationStatus_publishedAt_idx" ON "items"("moderationStatus", "publishedAt");
CREATE INDEX "items_status_moderationStatus_createdAt_idx" ON "items"("status", "moderationStatus", "createdAt");
CREATE INDEX "items_status_moderationStatus_isAggregation_createdAt_idx" ON "items"("status", "moderationStatus", "isAggregation", "createdAt");
CREATE INDEX "items_status_moderationStatus_updatedAt_idx" ON "items"("status", "moderationStatus", "updatedAt");
CREATE INDEX "items_clusterId_publishedAt_idx" ON "items"("clusterId", "publishedAt");
CREATE INDEX "items_clusterId_status_moderationStatus_updatedAt_idx" ON "items"("clusterId", "status", "moderationStatus", "updatedAt");
CREATE INDEX "items_qualityScore_publishedAt_idx" ON "items"("qualityScore", "publishedAt");
CREATE INDEX "items_parentItemId_idx" ON "items"("parentItemId");
CREATE TABLE "new_task_schedules" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "cronExpression" TEXT NOT NULL DEFAULT '0 * * * *',
    "sourceConcurrency" INTEGER NOT NULL DEFAULT 2,
    "fullTextFetchThreshold" INTEGER NOT NULL DEFAULT 80,
    "perSourceItemLimit" INTEGER NOT NULL DEFAULT 20,
    "aggregationSplitMaxEvents" INTEGER NOT NULL DEFAULT 20,
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
INSERT INTO "new_task_schedules" ("cleanupRetentionDays", "createdAt", "cronExpression", "dailyReportAutoPublish", "dailyReportCandidateLimit", "dailyReportGroupIdsJson", "dailyReportMaxRetries", "dailyReportOffsetDays", "enabled", "fullTextFetchThreshold", "id", "key", "lastHeartbeatAt", "lastRunFinishedAt", "lastRunStartedAt", "lastRunStatus", "nextRunAt", "perSourceItemLimit", "processingStartAt", "sourceConcurrency", "timezone", "updatedAt") SELECT "cleanupRetentionDays", "createdAt", "cronExpression", "dailyReportAutoPublish", "dailyReportCandidateLimit", "dailyReportGroupIdsJson", "dailyReportMaxRetries", "dailyReportOffsetDays", "enabled", "fullTextFetchThreshold", "id", "key", "lastHeartbeatAt", "lastRunFinishedAt", "lastRunStartedAt", "lastRunStatus", "nextRunAt", "perSourceItemLimit", "processingStartAt", "sourceConcurrency", "timezone", "updatedAt" FROM "task_schedules";
DROP TABLE "task_schedules";
ALTER TABLE "new_task_schedules" RENAME TO "task_schedules";
CREATE UNIQUE INDEX "task_schedules_key_key" ON "task_schedules"("key");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "aggregation_split_links_childItemId_idx" ON "aggregation_split_links"("childItemId");

-- CreateIndex
CREATE INDEX "aggregation_split_links_parentItemId_fingerprint_idx" ON "aggregation_split_links"("parentItemId", "fingerprint");

-- CreateIndex
CREATE INDEX "aggregation_split_links_parentItemId_createdAt_idx" ON "aggregation_split_links"("parentItemId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "aggregation_split_links_parentItemId_eventIndex_key" ON "aggregation_split_links"("parentItemId", "eventIndex");

-- CreateIndex
CREATE UNIQUE INDEX "cluster_merge_clean_pair_candidates_pairKey_key" ON "cluster_merge_clean_pair_candidates"("pairKey");

-- CreateIndex
CREATE INDEX "cluster_merge_clean_pair_candidates_expiresAt_idx" ON "cluster_merge_clean_pair_candidates"("expiresAt");

-- CreateIndex
CREATE INDEX "cluster_merge_clean_pair_candidates_attemptCount_score_idx" ON "cluster_merge_clean_pair_candidates"("attemptCount", "score");

-- CreateIndex
CREATE INDEX "cluster_merge_clean_pair_candidates_leftClusterId_idx" ON "cluster_merge_clean_pair_candidates"("leftClusterId");

-- CreateIndex
CREATE INDEX "cluster_merge_clean_pair_candidates_rightClusterId_idx" ON "cluster_merge_clean_pair_candidates"("rightClusterId");

-- CreateIndex
CREATE UNIQUE INDEX "tags_normalized_key" ON "tags"("normalized");

-- CreateIndex
CREATE INDEX "tags_name_idx" ON "tags"("name");

-- CreateIndex
CREATE UNIQUE INDEX "tag_aliases_aliasNormalized_key" ON "tag_aliases"("aliasNormalized");

-- CreateIndex
CREATE INDEX "tag_aliases_tagId_idx" ON "tag_aliases"("tagId");

-- CreateIndex
CREATE INDEX "tag_aliases_aliasName_idx" ON "tag_aliases"("aliasName");

-- CreateIndex
CREATE INDEX "tag_suggestion_decisions_decision_idx" ON "tag_suggestion_decisions"("decision");

-- CreateIndex
CREATE UNIQUE INDEX "tag_suggestion_decisions_sourceTagNormalized_targetTagNormalized_key" ON "tag_suggestion_decisions"("sourceTagNormalized", "targetTagNormalized");

-- CreateIndex
CREATE INDEX "item_tags_tagId_idx" ON "item_tags"("tagId");

-- CreateIndex
CREATE INDEX "item_tags_itemId_idx" ON "item_tags"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "item_tags_itemId_tagId_key" ON "item_tags"("itemId", "tagId");

-- CreateIndex
CREATE INDEX "page_views_path_visitorId_idx" ON "page_views"("path", "visitorId");
