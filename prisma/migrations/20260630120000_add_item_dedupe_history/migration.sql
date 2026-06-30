-- CreateTable
CREATE TABLE "item_dedupe_history" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourceId" TEXT NOT NULL,
    "sourceName" TEXT NOT NULL,
    "originalUrl" TEXT NOT NULL,
    "canonicalUrl" TEXT NOT NULL,
    "urlHash" TEXT NOT NULL,
    "originalTitle" TEXT NOT NULL,
    "publishedAt" DATETIME NOT NULL,
    "firstSeenAt" DATETIME NOT NULL,
    "lastSeenAt" DATETIME NOT NULL,
    "archivedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "item_dedupe_history_urlHash_key" ON "item_dedupe_history"("urlHash");

-- CreateIndex
CREATE INDEX "item_dedupe_history_sourceId_archivedAt_idx" ON "item_dedupe_history"("sourceId", "archivedAt");

-- CreateIndex
CREATE INDEX "item_dedupe_history_publishedAt_idx" ON "item_dedupe_history"("publishedAt");
