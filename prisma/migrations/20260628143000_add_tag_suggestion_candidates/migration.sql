-- CreateTable
CREATE TABLE "tag_suggestion_candidates" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "pairKey" TEXT NOT NULL,
    "sourceTagId" TEXT NOT NULL,
    "targetTagId" TEXT NOT NULL,
    "sourceTagNormalized" TEXT NOT NULL,
    "targetTagNormalized" TEXT NOT NULL,
    "confidence" REAL NOT NULL,
    "affectedItemCount" INTEGER NOT NULL,
    "sharedItemCount" INTEGER NOT NULL DEFAULT 0,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "tag_suggestion_candidates_sourceTagId_fkey" FOREIGN KEY ("sourceTagId") REFERENCES "tags" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "tag_suggestion_candidates_targetTagId_fkey" FOREIGN KEY ("targetTagId") REFERENCES "tags" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "tag_suggestion_candidates_pairKey_key" ON "tag_suggestion_candidates"("pairKey");

-- CreateIndex
CREATE INDEX "tag_suggestion_candidates_status_confidence_idx" ON "tag_suggestion_candidates"("status", "confidence");

-- CreateIndex
CREATE INDEX "tag_suggestion_candidates_status_affectedItemCount_idx" ON "tag_suggestion_candidates"("status", "affectedItemCount");

-- CreateIndex
CREATE INDEX "tag_suggestion_candidates_expiresAt_idx" ON "tag_suggestion_candidates"("expiresAt");

-- CreateIndex
CREATE INDEX "tag_suggestion_candidates_sourceTagId_idx" ON "tag_suggestion_candidates"("sourceTagId");

-- CreateIndex
CREATE INDEX "tag_suggestion_candidates_targetTagId_idx" ON "tag_suggestion_candidates"("targetTagId");

-- CreateIndex
CREATE UNIQUE INDEX "tag_suggestion_candidates_sourceTagNormalized_targetTagNormalized_key" ON "tag_suggestion_candidates"("sourceTagNormalized", "targetTagNormalized");
