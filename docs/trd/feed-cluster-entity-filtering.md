# Feed 聚合实体过滤与预计算统计

> 状态: 草案（待评审）
> 日期: 2026-06-22
> 范围: 首页 feed 查询、聚合实体派生字段、高级过滤语义、SQLite 查询性能

---

## 1. 背景与目标

### 1.1 背景

当前首页 feed 查询为了同时支持单条内容和聚合内容，查询时会实时构造较复杂的 CTE：

- `cluster_match_counts` 根据当前过滤条件统计每个 cluster 命中多少子 item，用来决定展示为 cluster 还是 single。
- `cluster_score_groups` 根据 cluster 下所有可展示 item 实时计算平均质量分、来源数、条目数、推荐分、投票分等。
- `listFeedGroupCounts` 和 `listPopularFeedTags` 也会复用相近的聚合逻辑。

这保证了过滤语义精细，但导致冷查询需要多次扫描 `items`、`sources`、`content_clusters`、`item_tags`，在生产 SQLite 上冷查询延迟仍偏高。

产品侧已接受新的语义：**高级过滤如果命中聚合内容，只基于聚合实体自身的派生字段判断，不再因为某个子条目命中而拉出整个聚合**。这使得 cluster 相关查询可以主要落在 `content_clusters` 的预计算字段上。

### 1.2 目标

- 将 cluster feed 所需的全量可展示统计预计算并存储在聚合实体上。
- 将 cluster 级过滤语义改为基于 `ContentCluster` 派生字段，而不是实时回扫子 item。
- 普通首页和高级过滤都避免实时计算 `cluster_score_groups`。
- 尽量消除或显著缩小 `cluster_match_counts` 在公开 feed 查询中的使用范围。
- 保持 single item 过滤逻辑按 item 自身字段执行。
- 保持现有 feed API 形状基本兼容，降低前端改动面。

### 1.3 非目标

- 不新增完整 `feed_entries` 物化表。
- 不改变 feed 创建时间过滤基于 `items.createdAt` 的既有业务约束；cluster 侧使用派生 `latestCreatedAt` 表达聚合实体创建窗口。
- 不在第一阶段实现复杂的 cluster 级全文搜索索引表。
- 不实现标签后台管理、标签合并或运营配置。
- 不改变 RSS、日报、admin 内容审核的主要数据模型。

---

## 2. 关键决策

| 决策点 | 选择 | 理由 |
|---|---|---|
| cluster 过滤语义 | 基于 `ContentCluster` 派生字段 | 避免高级过滤实时回扫子 item，冷查询收益明确 |
| single 过滤语义 | 继续基于 `Item` 字段 | 单条内容没有聚合实体，保持现有直觉 |
| cluster stats 存储位置 | 第一阶段存在 `content_clusters` | 查询简单、迁移少；后续如字段膨胀再拆 `cluster_feed_stats` |
| cluster tags | 从子 item 标签聚合到 cluster 级字段/关系 | 支持 tag 筛选不回扫 `item_tags` |
| group/source 过滤 | cluster 按 `dominantGroupId`，source 第一阶段不匹配 cluster | 避免 sourceId 对多来源 cluster 的歧义 |
| title 搜索 | cluster 搜索 `title/summary/searchText`，不搜子 item title | 与“基于聚合实体过滤”语义一致 |
| score 排序 | 使用预计算 `displayRecommendScore` | 消除实时 `cluster_score_groups` |
| 回滚 | 保留旧查询路径开关 | 语义变更风险可控，必要时回退旧 CTE |

---

## 3. 系统上下文

### 3.1 受影响模块

| 区域 | 文件 / 模块 | 说明 |
|---|---|---|
| 数据模型 | `prisma/schema.prisma` | 扩展 `ContentCluster` 派生字段，可能新增 cluster tag 关系 |
| SQLite 初始化 | `scripts/setup-sqlite.mjs` | 负责新增字段、索引、回填时的兼容升级 |
| Cluster service | `src/lib/clusters/*` | 聚类创建、合并、拆分、隐藏、恢复后刷新派生字段 |
| Item service | `src/lib/items/service.ts` | filter/restore/delete/reanalysis/join/detach 后刷新相关 cluster stats |
| Ingestion | `src/lib/ingestion/*` | 新 item 入库、标签更新、聚类分配后刷新相关 cluster stats |
| Feed 查询 | `src/lib/feed/repository.ts` | cluster 入口改为基于 `content_clusters` 派生字段查询 |
| Feed service/cache | `src/lib/feed/service.ts` | cache key 兼容新过滤语义，写路径继续 invalidation |
| Feed API | `src/app/api/feed/route.ts` | API 形状尽量不变，响应字段仍包含 items/groups/popularTags/pagination |
| 前端 | `src/components/feed/feed-panel.tsx` | 文案可能需要说明 sourceId 对聚合仅按 dominant group/source 语义 |

### 3.2 现有约束

- feed 时间过滤仍表示“系统摄入/创建时间窗口”，不能改成 `publishedAt`。
- 任何影响公开 feed 的写操作必须调用 `invalidateFeedCache()`。
- ingestion 与 worker/admin action 存在双执行路径，派生字段刷新必须放在共享 service。
- SQLite 是主要数据库，复杂实时 CTE 和大范围临时 B-tree 是当前性能瓶颈。
- 生产数据已有历史 cluster，需要上线时回填派生字段。

---

## 4. Proposed Design

### 4.1 数据模型

在 `ContentCluster` 增加 feed 派生字段：

```prisma
model ContentCluster {
  // existing fields...

  displayItemCount       Int       @default(0)
  displaySourceCount     Int       @default(0)
  displayAverageScore    Int       @default(0)
  displayRecommendScore  Int       @default(0)
  latestCreatedAt        DateTime?
  dominantGroupId        String?
  feedSearchText         String?
  feedTagsJson           String    @default("[]")
  feedStatsUpdatedAt     DateTime?

  dominantGroup SourceGroup? @relation(fields: [dominantGroupId], references: [id], onDelete: SetNull)

  @@index([status, latestCreatedAt])
  @@index([status, displayRecommendScore])
  @@index([dominantGroupId, status, latestCreatedAt])
}
```

说明：

- `displayItemCount`: cluster 下可公开展示 item 数，条件为 `processed + allowed/restored + source enabled + isAggregation=false`。
- `displaySourceCount`: 可公开展示 item 的 distinct source 数。
- `displayAverageScore`: 可公开展示 item 的平均质量分。
- `displayRecommendScore`: 复用现有 `calculateRecommendScore` 逻辑，基于 `displayAverageScore/displaySourceCount/displayItemCount`。
- `latestCreatedAt`: 可公开展示 item 的最大 `createdAt`，用于 feed 创建时间窗口。
- `latestPublishedAt`: 现有字段继续用于 published range / RSS / 展示，可在刷新 stats 时同步修正。
- `dominantGroupId`: 可公开展示 item 中按数量最多、最早 createdAt、groupId 排序得到的主 group。
- `feedSearchText`: cluster 级搜索文本，建议由 `title + summary + feedTags` 组成，第一阶段用 `LIKE`，后续可升级 FTS。
- `feedTagsJson`: cluster 级标签数组 JSON，从子 item tags 聚合去重，第一阶段不新增 cluster_tags 表。

如果后续字段继续增长，可以迁移到独立 `ClusterFeedStats` 表；第一阶段直接落 `content_clusters`，减少 join 和迁移复杂度。

### 4.2 派生字段刷新接口

新增共享 service：

```ts
export async function refreshClusterFeedStats(clusterIds: string[]): Promise<void>;
export async function refreshAllClusterFeedStats(options?: { batchSize?: number }): Promise<void>;
```

`refreshClusterFeedStats` 行为：

1. 去重 clusterIds，忽略空值。
2. 查询每个 cluster 下可公开展示 item。
3. 聚合 item count、source count、average score、latestCreatedAt、latestPublishedAt、dominantGroupId。
4. 聚合 item tags 为 cluster tags。
5. 生成 `feedSearchText`。
6. 更新 `content_clusters` 对应派生字段。
7. 对没有可展示 item 的 cluster，写入 0/null/[]，必要时 feed 查询自然不返回它。

刷新函数需要幂等，支持重复调用。批量刷新应避免一次事务过大，建议每批 100-300 个 cluster。

### 4.3 写路径集成

必须在以下路径刷新相关 cluster stats：

| 写路径 | 刷新范围 |
|---|---|
| ingestion 新增/更新 item 后 | item 当前 clusterId |
| item 分配/加入 cluster | old clusterId + new clusterId |
| cluster merge | source clusterIds + target clusterId |
| cluster split / detach | affected clusterIds |
| item filter / restore / delete | item.clusterId |
| item reanalysis | item.clusterId，因 qualityScore/tags 可能变化 |
| item tag replace | item.clusterId |
| source enabled/group 变更 | 该 source 下所有 clusterIds |
| cluster hide/restore | cluster 自身；feed cache invalidation 仍必需 |

对于高频 ingestion，允许批量收集 clusterIds，在阶段末尾统一刷新，避免每个 item 单独 update。

### 4.4 Feed 查询新语义

feed candidate 分两类：

#### Cluster candidate

来自 `content_clusters`：

- `status = active`
- `displayItemCount > 1`
- created range 使用 `latestCreatedAt`
- published range 使用 `latestPublishedAt`
- group filter 使用 `dominantGroupId`
- title search 使用 `feedSearchText/title/summary`
- tag filter 使用 `feedTagsJson`
- sourceId filter 第一阶段不匹配 cluster，只匹配 single item；前端文案需要避免暗示“聚合按任意来源命中”

排序：

- `time_desc`: `latestCreatedAt DESC, displayRecommendScore DESC, displayItemCount DESC, id DESC`
- `score_desc`: `displayRecommendScore DESC, latestPublishedAt DESC, displayItemCount DESC, id DESC`

响应映射：

- `itemCount = displayItemCount`
- `sourceCount = displaySourceCount`
- `score = displayRecommendScore`
- `group = dominantGroupId` 对应 badge
- preview items 仍按当前 cluster 拉取 top 3 子 item，但 preview 不参与过滤判断。

#### Single candidate

来自 `items`：

- `clusterId IS NULL` 或 cluster 不满足 `displayItemCount > 1`，即单条/单 item cluster 降级为 single。
- 仍按 item 字段过滤 sourceId/title/tag/range。
- 如果 item 属于 cluster 但该 cluster `displayItemCount <= 1`，展示为 single 并保留 clusterId 用于投票。

### 4.5 Group Counts

`listFeedGroupCounts` 改为使用同一候选语义：

- cluster count: 按 `dominantGroupId` 聚合 `content_clusters` candidate。
- single count: 按 item source group 聚合 single candidate。
- total = cluster count + single count。

这样不再需要实时 `cluster_match_counts` 和 `cluster_dominant_groups`。

### 4.6 Popular Tags

热门标签按 cluster entity + single item 混合统计：

- cluster candidate: 从 `feedTagsJson` 展开统计，每个 cluster 对同一 tag 只计 1。
- single candidate: 从 `item_tags` join `tags` 统计，每个 item 对同一 tag 只计 1。
- 当前已实现的 `includeTags=false` 继续保留，用于翻页/分页大小变化时跳过热门标签。

SQLite JSON 展开可使用 `json_each(feedTagsJson)`；若兼容性或性能不理想，后续改为 `ClusterTag` 关系表。

### 4.7 API 兼容

`GET /api/feed` 请求参数保持兼容：

- `range/sort/start/end/publishedStart/publishedEnd/groupId/sourceId/title/tag/page/size/includeTags`

响应字段保持兼容：

- `items`
- `groups`
- `groupTotalCount`
- `popularTags`
- `pagination`
- filter echo fields

语义变化需要在文档或前端文案中说明：

- cluster 过滤基于聚合实体。
- `sourceId` 对 cluster 不再按任意子来源匹配；第一阶段只影响 single item。

---

## 5. Compatibility, Migration, and Rollback

### 5.1 迁移

1. `schema.prisma` 增加字段和索引。
2. `scripts/setup-sqlite.mjs` 增加幂等列创建和索引创建。
3. 首次启动后执行 backfill：
   - 可在 setup 阶段同步回填。
   - 若生产库较大，建议后台 task 分批回填，回填期间 feature flag 仍走旧查询。
4. 回填完成后启用新查询路径。

### 5.2 Feature Flag

建议增加环境变量或配置：

```text
FEED_CLUSTER_ENTITY_FILTERING_ENABLED=true
```

默认策略：

- 开发/测试可默认开启。
- 生产首次部署可先关闭，完成 backfill 后开启。
- 如果 backfill 是启动必做且数据量可控，可以直接默认开启。

### 5.3 回滚

回滚策略：

- 保留旧 CTE 查询路径至少一个版本。
- 如果新语义出现问题，关闭 feature flag 回到旧路径。
- 新增字段可以保留，不影响旧代码读取。
- 写路径刷新 stats 失败时记录 warning，并不阻断主业务；但开启新查询路径时应暴露 stats stale 指标。

---

## 6. Quality Attributes

### 6.1 Performance

预期收益：

- `cluster_score_groups` 从 feed 冷查询中移除。
- `cluster_match_counts` 在普通 cluster candidate 中移除。
- group counts 改为 cluster stats + item single 聚合。
- popular tags 在翻页时继续跳过。

关键索引：

- `content_clusters(status, latestCreatedAt)`
- `content_clusters(status, displayRecommendScore)`
- `content_clusters(dominantGroupId, status, latestCreatedAt)`
- 已有 `items(sourceId, status, moderationStatus, isAggregation, createdAt)` 继续服务 single item。

### 6.2 Reliability

- stats 刷新必须幂等。
- ingestion 批量刷新时允许部分失败，但需要记录失败 clusterIds。
- feed 查询开启新路径前必须保证 backfill 完成或可自动降级。

### 6.3 Observability

新增日志/指标建议：

- `feed.clusterStats.refresh.count`
- `feed.clusterStats.refresh.durationMs`
- `feed.clusterStats.refresh.failedCount`
- `feed.clusterStats.stale.count`
- feed API query timing 分段：page rows / group counts / popular tags / item hydration。

### 6.4 Security and Privacy

本方案只处理公开 feed 已可展示数据的派生字段，不引入新的敏感信息。`feedSearchText` 不应包含 fullText/rssContent，避免扩大公开可检索范围；只使用 cluster title、summary、tags。

---

## 7. Testing and Verification

### 7.1 Unit Tests

- `refreshClusterFeedStats`:
  - 多 item cluster 统计 item/source/score/recommendScore。
  - disabled source 不计入。
  - filtered item 不计入。
  - tag 聚合去重。
  - dominantGroupId tie-break。
  - 空 cluster 写 0/null/[]。

- feed range/filter helpers:
  - cluster created range 使用 latestCreatedAt。
  - cluster published range 使用 latestPublishedAt。
  - title/tag 使用 cluster 派生字段。

### 7.2 Integration Tests

扩展 `tests/integration/feed-api.test.ts`：

- 普通 feed 混合 cluster + single 与旧响应 shape 兼容。
- tag/title 命中 cluster 派生字段时返回 cluster。
- tag/title 只命中子 item、不命中 cluster 派生字段时不返回 cluster。
- sourceId 只匹配 single，不按 cluster 任意子 source 匹配。
- groupId 按 dominantGroupId 匹配 cluster。
- group counts 使用新语义。
- popularTags 使用 cluster feedTagsJson + single item tags。
- stats stale/缺失时的降级行为。

### 7.3 Migration Tests

- `tests/integration/sqlite-setup-migration.test.ts` 覆盖新增列、索引和幂等升级。
- backfill 对历史 cluster 生成派生字段。
- 重复执行 setup 不破坏已有 stats。

### 7.4 Performance Checks

用生产等价数据验证：

- `/api/feed?range=3d&sort=time_desc`
- `/api/feed?range=7d&sort=time_desc`
- `/api/feed?range=all&sort=time_desc`
- `/api/feed?range=3d&sort=time_desc&tag=openai`
- `/api/feed?range=3d&sort=score_desc`

记录 cold/warm TTFB，并对比旧路径。

---

## 8. Tradeoffs and Alternatives

### 8.1 继续优化 CTE

优点：不改产品语义。

缺点：SQLite 对复杂 CTE、窗口函数、临时 B-tree 的优化空间有限；冷查询收益不稳定。

### 8.2 新增 `feed_entries` 物化表

优点：读路径最简单，性能上限最高。

缺点：写路径维护复杂，聚类合并/拆分/source 配置变化时同步成本高。

### 8.3 独立 `cluster_feed_stats` 表

优点：领域边界更清晰，不污染 `content_clusters`。

缺点：每次 feed 查询多一个 join；当前字段数量可控，第一阶段直接扩 `content_clusters` 更务实。

### 8.4 当前选择

第一阶段选择 `content_clusters` 派生字段 + cluster entity 过滤语义。它在性能、实现复杂度、回滚成本之间最均衡。

---

## 9. Open Questions

1. `sourceId` 对 cluster 是否完全不生效，还是引入 `dominantSourceId` 作为折中？
2. `feedTagsJson` 是否足够，还是直接建 `ClusterTag` 关系表以便索引和统计？
3. `feedSearchText` 第一阶段是否需要 FTS5，还是先用 `LIKE`？
4. stats backfill 是否可以在容器启动时同步完成，还是必须做后台 task？
5. 新语义是否需要在 UI 上调整筛选文案，例如“来源筛选仅精确匹配单条内容，聚合按主分组匹配”？

---

## 10. Execution Plan Inputs

建议后续实施按以下切片推进：

1. 数据模型与迁移：新增 cluster 派生字段、索引、setup 幂等升级。
2. Stats 刷新 service：实现 `refreshClusterFeedStats` 和批量 backfill。
3. 写路径接入：ingestion、item service、cluster service、source settings 变更后刷新 stats。
4. Feed 查询新路径：在 feature flag 下实现 cluster entity candidate + single candidate union。
5. Group counts / popular tags 新路径：基于同一语义重写统计。
6. 测试和性能验证：补齐语义变更测试、迁移测试、生产等价 cold query profile。
7. Rollout：生产先 backfill，再开启 feature flag；保留旧路径至少一个版本。
