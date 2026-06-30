-- AlterTable
ALTER TABLE "content_clusters" ADD COLUMN "eventBucket" TEXT;
ALTER TABLE "content_clusters" ADD COLUMN "eventFingerprint" TEXT;

-- CreateTable
CREATE TABLE "cluster_decisions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "verdict" TEXT NOT NULL,
    "leftItemId" TEXT,
    "rightItemId" TEXT,
    "leftClusterId" TEXT,
    "rightClusterId" TEXT,
    "pairKey" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "modelName" TEXT,
    "promptHash" TEXT,
    "localScore" INTEGER,
    "confidence" INTEGER,
    "reasonCode" TEXT,
    "reasonText" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" DATETIME,
    "appliedAt" DATETIME,
    "appliedAction" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "cluster_constraints" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "leftId" TEXT NOT NULL,
    "rightId" TEXT NOT NULL,
    "pairKey" TEXT NOT NULL,
    "reason" TEXT,
    "createdBy" TEXT NOT NULL DEFAULT 'system',
    "expiresAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "cluster_decisions_kind_pairKey_inputHash_idx" ON "cluster_decisions"("kind", "pairKey", "inputHash");

-- CreateIndex
CREATE INDEX "cluster_decisions_verdict_expiresAt_idx" ON "cluster_decisions"("verdict", "expiresAt");

-- CreateIndex
CREATE INDEX "cluster_decisions_leftClusterId_idx" ON "cluster_decisions"("leftClusterId");

-- CreateIndex
CREATE INDEX "cluster_decisions_rightClusterId_idx" ON "cluster_decisions"("rightClusterId");

-- CreateIndex
CREATE INDEX "cluster_constraints_expiresAt_idx" ON "cluster_constraints"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "cluster_constraints_kind_scope_pairKey_key" ON "cluster_constraints"("kind", "scope", "pairKey");

-- CreateIndex
CREATE INDEX "content_clusters_eventFingerprint_eventBucket_idx" ON "content_clusters"("eventFingerprint", "eventBucket");

