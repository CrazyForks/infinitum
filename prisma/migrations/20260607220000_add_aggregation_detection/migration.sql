-- Add aggregation detection: opt-in Source flag, Item flag, and parsed event sub-table.

-- AlterTable
ALTER TABLE "sources" ADD COLUMN "aggregationDetectionEnabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "items" ADD COLUMN "isAggregation" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "items" ADD COLUMN "aggregationCheckedAt" DATETIME;
ALTER TABLE "items" ADD COLUMN "aggregationParseStatus" TEXT;

-- CreateTable
CREATE TABLE "item_parsed_events" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "itemId" TEXT NOT NULL,
    "eventIndex" INTEGER NOT NULL,
    "eventType" TEXT,
    "eventSubject" TEXT,
    "eventAction" TEXT,
    "eventObject" TEXT,
    "eventDate" TEXT,
    "oneLiner" TEXT NOT NULL,
    "qualityScore" INTEGER NOT NULL DEFAULT 50,
    "clusterId" TEXT,
    "fingerprint" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "item_parsed_events_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "item_parsed_events_clusterId_fkey" FOREIGN KEY ("clusterId") REFERENCES "content_clusters" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "item_parsed_events_itemId_fingerprint_key" ON "item_parsed_events"("itemId", "fingerprint");

-- CreateIndex
CREATE INDEX "item_parsed_events_itemId_eventIndex_idx" ON "item_parsed_events"("itemId", "eventIndex");

-- CreateIndex
CREATE INDEX "item_parsed_events_fingerprint_idx" ON "item_parsed_events"("fingerprint");

-- CreateIndex
CREATE INDEX "item_parsed_events_clusterId_createdAt_idx" ON "item_parsed_events"("clusterId", "createdAt");

-- CreateIndex
CREATE INDEX "item_parsed_events_eventType_eventDate_idx" ON "item_parsed_events"("eventType", "eventDate");
