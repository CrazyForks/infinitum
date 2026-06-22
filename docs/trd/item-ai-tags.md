# Item 级 AI 标签生成与首页标签筛选

> 状态: 草案（待评审）
> 日期: 2026-06-22
> 范围: Item 级标签生成、feed 标签筛选、首页热门标签展示

---

## 1. 背景与目标

### 1.1 背景

项目当前已经具备 RSS 抓取、正文补抓、AI 摘要/分析、内容聚类、feed 展示和 AI 日报能力。下一步希望增加内容标签能力：每篇内容最多生成 5 个标签，并在首页顶部展示当前内容量最多的前 20 个标签，用户点击标签后可以快速筛选对应内容。

标签后续也会作为用户画像和日报个性化提权的基础特征，但本阶段只实现内容侧标签，不引入画像和个性化排序。

### 1.2 目标

- 在单条内容 AI 分析阶段自动生成最多 5 个标签。
- 标签作为 `Item` 级事实存储，`ContentCluster` 不单独调用 AI 生成标签。
- 首页顶部展示热门标签，格式为 `标签 XX`，其中 `XX` 为内容条数。
- 点击标签后按该标签快速筛选 feed，并更新 URL query。
- 标签生成失败不影响内容入库和现有 feed 展示。
- 为后续用户画像、日报兴趣提权提供稳定标签维度。

### 1.3 非目标

- 不重定义现有 `SourceGroup` 来源分组。
- 不重定义现有 `ContentCluster` 内容聚类。
- 不新增独立 AI 标签生成调用。
- 不在第一版对历史内容做强制全量回填。
- 不做标签管理后台、标签合并、标签禁用等运营功能。
- 不在第一版修改 AI 日报候选排序或推荐排序。

---

## 2. 关键决策

| 决策点 | 选择 | 理由 |
|---|---|---|
| 生成时机 | 复用 `item_analysis` 阶段 | 标签与质量分、事件字段同属结构化内容理解，不额外增加 AI 调用 |
| 存储粒度 | `Item` 级标签 | 数据事实来源清晰，后续画像可直接基于用户浏览过的 item tag |
| Cluster 标签 | 由子 `Item` 标签聚合 | 避免 cluster 变更时维护冗余标签，也避免新增 AI 调用 |
| 首页热门标签 | 基于当前 feed 可展示内容统计前 20 | 与用户看到的内容范围一致 |
| 当前 tag 对热门统计的影响 | 不纳入当前 `tag` 过滤，但纳入其他 filter | 避免选中某标签后顶部只剩当前标签，方便快速切换 |
| 历史数据 | 默认无标签，后续可 reanalyze/backfill | 降低上线风险 |
| 标签失败行为 | 降级为空数组 | 不阻断 ingestion 主流程 |

---

## 3. 系统上下文

### 3.1 受影响模块

| 区域 | 文件 / 模块 | 说明 |
|---|---|---|
| 数据模型 | `prisma/schema.prisma` | 新增 `Tag` / `ItemTag`，给 `Item` 增加关系 |
| AI Provider | `src/lib/ai/provider.ts` | 扩展 item analysis 输出结构，解析 `tags` |
| Ingestion | `src/lib/ingestion/item-processor.ts` | analysis 成功后同步标签 |
| Item 操作 | `src/lib/items/service.ts` | reanalyze 时刷新标签 |
| 标签领域逻辑 | `src/lib/tags/*` | 标签规范化、upsert、关系刷新、热门统计 |
| Feed 请求 | `src/lib/feed/request.ts` | 新增 `tag` query 参数解析 |
| Feed 类型 | `src/lib/feed/types.ts` | 新增 `tag` filter、`FeedTagOption` |
| Feed 查询 | `src/lib/feed/repository.ts` | 支持 tag 过滤、热门标签统计 |
| Feed 服务 | `src/lib/feed/service.ts` | cache key 纳入 `tag`，返回 `popularTags` |
| 首页 UI | `src/components/feed/feed-panel.tsx` | 展示热门标签并支持点击筛选 |

### 3.2 现有约束

- feed 时间过滤语义必须继续使用 `items.createdAt`，不能改成 `publishedAt`。
- 任何影响公开 feed 的写操作都必须调用 `invalidateFeedCache()`。
- ingestion 有同步执行和 worker 执行两条路径，标签逻辑必须放在共享 service 层。
- 当前已有 `SourceGroup` 和 `ContentCluster` 两种分组/聚合概念，本功能不能混淆它们的语义。
- AI 调用成本和 ingestion 总耗时是关键约束，第一版不新增标签专用 AI 调用。

---

## 4. 设计方案

### 4.1 数据模型

新增 `Tag` 和 `ItemTag`：

```prisma
model Tag {
  id         String    @id @default(cuid())
  name       String
  normalized String    @unique
  createdAt  DateTime  @default(now())
  updatedAt  DateTime  @updatedAt
  items      ItemTag[]

  @@index([name])
  @@map("tags")
}

model ItemTag {
  id        String   @id @default(cuid())
  itemId    String
  tagId     String
  createdAt DateTime @default(now())
  item      Item     @relation(fields: [itemId], references: [id], onDelete: Cascade)
  tag       Tag      @relation(fields: [tagId], references: [id], onDelete: Cascade)

  @@unique([itemId, tagId])
  @@index([tagId])
  @@index([itemId])
  @@map("item_tags")
}
```

给 `Item` 增加：

```prisma
tags ItemTag[]
```

说明：

- `Tag.name` 用于展示，保留 AI 输出中较自然的标签形式。
- `Tag.normalized` 用于去重、URL 参数、查询匹配。
- `ItemTag` 只表达当前 item 的标签关系，不存权重。
- 第一版不维护 tag 使用总数冗余字段，计数通过查询聚合得到。

### 4.2 标签规范化

新增 `src/lib/tags/normalization.ts`：

```ts
export function normalizeTagName(input: string): string | null;
export function normalizeItemTags(input: unknown): Array<{ name: string; normalized: string }>;
```

规则：

- trim。
- 合并连续空白。
- 去除首尾 `#`、中文/英文标点。
- 英文统一小写用于 `normalized`。
- 中文保持原文用于 `normalized`。
- 空值丢弃。
- 单个标签最长 40 字符，超过后丢弃或截断；建议第一版丢弃。
- 去重后最多保留 5 个。
- 内置极小泛词过滤列表，例如 `新闻`、`资讯`、`科技`、`文章`、`更新`。是否过滤 `AI` 需谨慎，第一版可以允许 `AI`，后续根据效果调整。

### 4.3 AI 输出契约

扩展 item analysis 输出：

```ts
type AiItemAnalysis = {
  qualityScore: number;
  qualityRationale: string;
  eventType: string | null;
  eventSubject: string | null;
  eventAction: string | null;
  eventObject: string | null;
  eventDate: string | null;
  tags: string[];
};
```

Prompt 约束：

- `tags` 必须是字符串数组。
- 最多 5 个。
- 标签应优先描述主题、公司、产品、技术方向、行业事件。
- 避免过宽泛标签。
- 适合用户点击筛选，而不是摘要短语。

解析策略：

- `tags` 缺失、不是数组、数组项不是字符串时，降级为空数组。
- 只要原有 analysis 字段可用，`analysisStatus` 仍可为 `succeeded`。
- 标签解析失败记录 warning，不抛出阻断 ingestion。

### 4.4 标签持久化

新增 `src/lib/tags/service.ts`：

```ts
export async function replaceItemTags(itemId: string, tags: string[]): Promise<void>;
export async function listPopularFeedTags(filters: FeedFilters, limit?: number): Promise<FeedTagOption[]>;
```

`replaceItemTags` 行为：

1. 规范化输入标签。
2. 在事务中 upsert `Tag`。
3. 删除该 item 的旧 `ItemTag`。
4. 创建新的 `ItemTag` 关系。
5. 调用方负责在影响公开 feed 时触发 `invalidateFeedCache()`。

事务语义：

- 标签刷新对单个 item 幂等。
- 同名标签并发创建依赖 `Tag.normalized` unique 约束。
- 如果标签写入失败，调用方捕获并降级，避免影响 item 主流程。

### 4.5 Ingestion 集成

在 `src/lib/ingestion/item-processor.ts` 中：

- 保持现有抓取、摘要、analysis、聚类流程。
- 在 AI analysis 返回后，从结果中读取 `tags`。
- item 主记录 upsert 成功后调用 `replaceItemTags(item.id, analysis.tags)`。
- 对于被规则过滤或 AI 过滤的 item，不强制写标签；第一版只给 `processed` 内容写标签。
- 标签写入成功后确保公开 feed 缓存失效。

建议顺序：

1. RSS item 准备。
2. full text 补抓。
3. summary / translation。
4. item analysis 返回质量分、事件字段、标签。
5. upsert item。
6. replace item tags。
7. cluster assignment。
8. invalidate feed cache。

说明：

- 标签可在 cluster assignment 前写入，因为标签是 item 级事实。
- 如果未来 cluster assignment 需要标签作为候选特征，可以复用已持久化标签。

### 4.6 Reanalysis 集成

`src/lib/items/service.ts` 中：

- `item_reanalyze` 重新调用 analysis 后，替换该 item 的标签。
- `item_regenerate_summary` 不刷新标签。
- `item_regenerate_translation` 不刷新标签。
- 如果某个 UI 操作同时选择 reanalyze，则以 reanalyze 行为为准。

### 4.7 Feed 请求与 API 契约

`FeedFilters` 新增：

```ts
type FeedFilters = {
  range: FeedRange;
  sort: FeedSort;
  start: string | null;
  end: string | null;
  publishedStart: string | null;
  publishedEnd: string | null;
  groupId: string | null;
  sourceId: string | null;
  title: string | null;
  tag: string | null;
};
```

新增热门标签 DTO：

```ts
type FeedTagOption = {
  name: string;
  normalized: string;
  count: number;
};
```

首页/API 返回结构扩展：

```ts
type FeedListResult = {
  items: FeedEntryDTO[];
  pagination: FeedPagination;
  groups: FeedGroupOption[];
  groupTotalCount: number;
  popularTags: FeedTagOption[];
};
```

URL 示例：

```text
/?tag=openai
/?range=7d&tag=ai-agent
```

解析规则：

- `tag` 空字符串归一为 `null`。
- `tag` 使用 normalized 值。
- 切换 tag 时重置 `page=1`。

### 4.8 Feed 查询设计

Tag 筛选要求：

- single item：item 自身有对应 tag。
- cluster entry：cluster 内至少一个可展示 item 有对应 tag。
- 其他 feed filter 仍然生效，包括 range、source、group、title、published range。

热门标签统计要求：

- 统计范围基于当前可展示 item 集合。
- 必须满足：
  - `Item.status = processed`
  - `Item.moderationStatus in allowed/restored`
  - `Source.enabled = true`
  - `ContentCluster.status = active` 或 item 无 cluster
- 受当前时间、source、group、title、published range 等 filter 影响。
- 不受当前 `tag` filter 影响。
- 返回前 20 个，排序：`count desc, name asc`。

缓存要求：

- feed list cache key 必须包含 `tag`。
- feed cache version 需要覆盖标签关系变化。可选方案：
  1. 将 `Tag` / `ItemTag` 最新更新时间纳入 feed cache version。
  2. 标签写入后直接调用 `invalidateFeedCache()`。

第一版推荐使用方案 2，简单且符合现有内容变更缓存策略。

### 4.9 首页 UI

`FeedPanel` 新增热门标签区域：

- 位于首页顶部筛选区域附近。
- 展示最多 20 个标签。
- 文案格式：`{tag.name} {tag.count}`，例如 `OpenAI 12`。
- 当前选中 tag 显示 active 状态。
- 点击未选中标签：设置 `tag=<normalized>`，重置 `page=1`。
- 点击已选中标签：清除 `tag`，重置 `page=1`。
- 与现有 group/source/title/range filter 共存。

第一版不要求每张 feed 卡片展示标签；后续可扩展为 entry tag chips。

---

## 5. 兼容、迁移与回滚

### 5.1 迁移

- 新增表和关系字段，不修改现有表语义。
- 旧 item 默认没有标签。
- 不需要数据回填才能上线。
- 后续可通过 `item_reanalyze` 或新增 backfill task 补齐历史标签。

### 5.2 部署顺序

1. 更新 schema 并生成 Prisma Client。
2. 发布标签 normalization/service/repository。
3. 发布 AI analysis contract 兼容解析。
4. 发布 ingestion / reanalysis 标签写入。
5. 发布 feed tag 筛选和 popularTags。
6. 发布首页 UI。

### 5.3 回滚

- 如果 UI 有问题，可隐藏热门标签区域并忽略 `tag` query。
- 如果 AI 标签质量不稳定，可从 prompt 移除 `tags` 要求，系统按空数组处理。
- 新增表可保留，不影响现有 feed、聚类、日报。

---

## 6. 质量属性

### 6.1 可靠性

- 标签生成失败不阻断 item 入库。
- 标签写入失败不应导致 ingestion task 整体失败。
- reanalyze 覆盖旧标签，避免标签长期漂移。
- 标签关系刷新必须幂等。

### 6.2 性能

- 不新增 AI 调用。
- `Tag.normalized`、`ItemTag.itemId`、`ItemTag.tagId` 必须有索引。
- 热门标签统计需要复用 feed filter 条件，避免全表无界扫描。
- 首页只取前 20 个标签。

### 6.3 安全

- `tag` query 必须规范化，不直接拼接 raw SQL 字符串。
- 如果使用 Prisma raw SQL，必须使用参数化 SQL。
- 标签来自公开文章内容，不包含用户行为或敏感画像数据。

### 6.4 可观测性

- 记录 AI tags 解析失败 warning。
- 可在后续 task timeline 增加标签写入数量指标。
- AI usage 不新增独立 key，因为复用 `item_analysis`。

---

## 7. 测试策略

### 7.1 单元测试

`tests/unit/feed-request.test.ts`

- 能解析 `tag` 参数。
- 空白 tag 归一为 `null`。
- tag 与 range/source/group/title 等参数共存。

新增 `tests/unit/tag-normalization.test.ts`

- trim、去标点、去重。
- 最多保留 5 个。
- 过滤空值和超长值。
- 英文 normalized 小写。

### 7.2 集成测试

`tests/integration/ingestion-service.test.ts`

- 新 item analysis 成功后写入标签。
- AI 返回重复/空/非法标签时能规范化。
- 标签写入失败不阻断 item 处理。

`tests/integration/item-regeneration.test.ts`

- reanalyze 会替换旧标签。
- regenerate summary 不刷新标签。

`tests/integration/feed-api.test.ts`

- `tag` 参数能筛选 single item。
- `tag` 参数能筛选包含匹配 item 的 cluster。
- 热门标签返回前 20 个并带 count。
- 当前 `tag` 不影响热门标签统计，其他 filter 会影响。

`tests/integration/sqlite-setup-migration.test.ts`

- SQLite setup 能创建 `tags` 和 `item_tags`。
- 索引和 unique 约束可用。

### 7.3 验证命令

```bash
npm run db:test:setup
vitest run tests/unit/feed-request.test.ts tests/unit/tag-normalization.test.ts
vitest run tests/integration/ingestion-service.test.ts tests/integration/item-regeneration.test.ts tests/integration/feed-api.test.ts tests/integration/sqlite-setup-migration.test.ts
npm run lint
npm run build
```

---

## 8. 风险与处理

| 风险 | 影响 | 处理 |
|---|---|---|
| AI 标签过泛 | 筛选价值低 | Prompt 约束 + normalization blacklist，后续可加管理页 |
| feed SQL 复杂度上升 | tag filter 与 cluster/single 混合查询容易出错 | 优先复用现有 feed filter helper，补充集成测试 |
| 热门标签计数与当前列表不一致 | 用户感知混乱 | 明确定义统计受哪些 filter 影响，并测试 |
| 标签写入影响 ingestion 稳定性 | 抓取任务失败率升高 | 标签写入失败降级为空并记录 warning |
| 历史内容无标签 | 上线初期热门标签偏少 | 接受为第一版限制，后续 backfill |
| cache stale | 首页标签/筛选结果不更新 | 标签写入后 invalidate feed cache |

---

## 9. 开放问题

1. 是否允许 `AI` 这类短泛标签？建议第一版允许，观察实际数据后再决定是否过滤。
2. 标签展示是否要保留 AI 原始大小写？建议 `name` 保留展示形式，`normalized` 用于匹配。
3. 热门标签统计是否默认跟随首页 `today` 范围？建议跟随当前 feed filters，包括默认 `today`。
4. 是否需要立即做历史回填？建议不上线前置，功能稳定后单独做 backfill 任务。
5. 是否需要在 feed 卡片上展示标签？第一版不做，避免 UI 范围扩大。

---

## 10. 执行计划输入

后续执行计划建议拆成以下切片：

1. Schema 与 Prisma Client：新增 `Tag` / `ItemTag`。
2. 标签 normalization/service/repository：完成规范化、upsert、关系刷新。
3. AI contract：扩展 `item_analysis` prompt 和 provider 解析。
4. Ingestion/reanalysis 集成：写入和刷新 item tags。
5. Feed 后端：request/types/repository/service 支持 `tag` 和 `popularTags`。
6. Feed 前端：热门标签展示、URL query 更新、active/clear 状态。
7. 测试与验证：补齐 unit/integration，跑 lint/build。

关键实现边界：

- 不改 `SourceGroup`。
- 不改 `ContentCluster` 生成逻辑。
- 不改日报排序。
- 不新增 AI 调用。
- 不做历史回填。
