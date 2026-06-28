-- CreateTable
CREATE TABLE "header_links" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "label" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "openInNewTab" BOOLEAN NOT NULL DEFAULT true,
    "rel" TEXT NOT NULL DEFAULT 'noopener noreferrer',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "header_links_enabled_sortOrder_idx" ON "header_links"("enabled", "sortOrder");

-- CreateIndex
CREATE INDEX "header_links_sortOrder_label_idx" ON "header_links"("sortOrder", "label");
