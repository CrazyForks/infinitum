-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_items" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourceId" TEXT NOT NULL,
    "clusterId" TEXT,
    "originalUrl" TEXT NOT NULL,
    "canonicalUrl" TEXT NOT NULL,
    "urlHash" TEXT NOT NULL,
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
INSERT INTO "new_items" ("aggregationCheckedAt", "aggregationParseStatus", "aiProcessedAt", "analysisStatus", "author", "canonicalUrl", "clusterId", "createdAt", "errorMessage", "eventAction", "eventDate", "eventObject", "eventSubject", "eventType", "filterReason", "fullText", "id", "isAggregation", "language", "manualClusterAssignedAt", "moderationDetail", "moderationReason", "moderationStatus", "originalTitle", "originalUrl", "parentItemId", "publishedAt", "qualityRationale", "qualityScore", "restoredByAdminAt", "rssContent", "rssExcerpt", "sourceId", "status", "summaryStatus", "summaryText", "translatedTitle", "updatedAt", "urlHash") SELECT "aggregationCheckedAt", "aggregationParseStatus", "aiProcessedAt", "analysisStatus", "author", "canonicalUrl", "clusterId", "createdAt", "errorMessage", "eventAction", "eventDate", "eventObject", "eventSubject", "eventType", "filterReason", "fullText", "id", "isAggregation", "language", "manualClusterAssignedAt", "moderationDetail", "moderationReason", "moderationStatus", "originalTitle", "originalUrl", "parentItemId", "publishedAt", "qualityRationale", "qualityScore", "restoredByAdminAt", "rssContent", "rssExcerpt", "sourceId", "status", "summaryStatus", "summaryText", "translatedTitle", "updatedAt", "urlHash" FROM "items";
DROP TABLE "items";
ALTER TABLE "new_items" RENAME TO "items";
CREATE UNIQUE INDEX "items_urlHash_key" ON "items"("urlHash");
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
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
