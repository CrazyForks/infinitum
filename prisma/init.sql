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
  "itemAnalysisPrompt" TEXT NOT NULL DEFAULT '你是新闻内容分析助手。请只基于输入的标题、来源与正文进行判断，严格输出单个 JSON 对象，不要输出 Markdown、代码块、额外解释或任何 JSON 之外的文字。固定输出格式为 {"translatedTitle":"...","summary":"...","moderationStatus":"allowed|filtered|restored","moderationReason":"marketing|low_quality|duplicate_noise|rule_blacklist|other|null","moderationDetail":"...","qualityScore":0,"qualityRationale":"...","topicLabel":"...","clusterHint":"..."}。字段说明：translatedTitle 仅在需要翻译标题时填写忠实简洁的中文标题，否则返回空字符串；summary 必须是 1 到 2 句中文摘要，客观、紧凑、信息密度高；moderationStatus 只能返回 allowed 或 filtered，restored 仅供管理员人工恢复使用；moderationReason 仅在 filtered 时填写，allowed 时返回 null；moderationDetail 用 1 句中文说明允许或过滤的主要依据；qualityScore 返回 0 到 100 的整数，按信息密度、事实清晰度、时效性和独特性评分；qualityRationale 用 1 句中文解释评分原因；topicLabel 给出简洁稳定的主题标签，无法稳定概括时返回 null；clusterHint 必须用于描述具体事件线索，优先写成主体+动作/事件+关键对象；如果只能概括成主题、赛道、公司方向或产品类别，不要返回宽泛 clusterHint，直接返回 null。硬性要求：不要编造输入中没有的信息；不确定时保守处理，moderationStatus 返回 allowed、moderationReason 返回 null；最终只能输出合法 JSON。',
  "clusterSummaryPrompt" TEXT NOT NULL DEFAULT '你是信息聚合助手。请基于给定的多条相关新闻，生成 1 到 2 句中文聚合摘要，突出共同事件、关键进展和差异点，不要输出项目符号，也不要编造未提供的信息。',
  "clusterMatchPrompt" TEXT NOT NULL DEFAULT '你是内容归组助手。请判断当前内容是否属于给定候选聚合组中的某一个。只返回 JSON，格式为 {"clusterId":"候选组ID"} 或 {"clusterId":null}。只有当候选组与当前内容描述的是同一具体事件、同一发布、同一公告、同一收购、同一融资、同一漏洞披露、同一论文或同一产品上线时才匹配。不要因为主题接近、赛道相同、公司相同、产品类别相近、方法论相似或都属于同一抽象话题就匹配；宁可返回 null，也不要做主题聚合。',
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
CREATE INDEX IF NOT EXISTS "items_moderationStatus_publishedAt_idx" ON "items"("moderationStatus", "publishedAt");
CREATE INDEX IF NOT EXISTS "items_clusterId_publishedAt_idx" ON "items"("clusterId", "publishedAt");
CREATE INDEX IF NOT EXISTS "items_qualityScore_publishedAt_idx" ON "items"("qualityScore", "publishedAt");
CREATE UNIQUE INDEX IF NOT EXISTS "content_clusters_fingerprint_key" ON "content_clusters"("fingerprint");
CREATE INDEX IF NOT EXISTS "content_clusters_status_latestPublishedAt_idx" ON "content_clusters"("status", "latestPublishedAt");
CREATE INDEX IF NOT EXISTS "fetch_runs_startedAt_idx" ON "fetch_runs"("startedAt");
CREATE UNIQUE INDEX IF NOT EXISTS "source_groups_name_key" ON "source_groups"("name");
CREATE UNIQUE INDEX IF NOT EXISTS "blacklist_keywords_keyword_key" ON "blacklist_keywords"("keyword");
