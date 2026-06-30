---
id: trd-event-briefing
type: trd
status: draft
created_at: 2026-06-30
updated_at: 2026-06-30
sources:
  - AGENTS.md
  - prisma/schema.prisma
  - src/app/page.tsx
  - src/app/daily/page.tsx
  - src/components/ui/global-header.tsx
  - src/components/ui/page-shell.tsx
  - src/lib/feed/repository.ts
  - src/lib/feed/recommend-score.ts
  - src/lib/daily-report/repository.ts
related:
  - docs/trd/event-clustering-reliability.md
---

# TRD: 事件速览

## 背景和目标

Infinitum 生产环境每天约有 300 条资讯进入信息流。当前系统已经具备 RSS 采集、全文抽取、AI 摘要、质量评分、标签、事件签名、聚合和日报能力，但用户仍需要在完整 Feed 或日报长总结之间切换：完整 Feed 信息量过大，日报适合归档阅读但不够适合作为快速判断入口。

本功能目标是新增一个公开的 **事件速览** 页面，按某一天展示系统识别出的重点事件，让用户用更少时间获得更高信息密度。

核心目标：

- 从每天约 300 条资讯中压缩出可快速浏览的重点事件列表。
- 页面按 **日期** 工作，而不是 24 小时、3 天、7 天或自定义时间范围。
- 重点事件数量可在后台配置，不写死在前端或查询层。
- 事件卡片保持高信息密度，避免变成长摘要列表。
- Header 增加公开导航入口，建议 label 为 `速览`，页面标题为 `事件速览`。
- 页面风格尽量复用当前主页和日报的 `PageShell`、header、卡片、筛选、分页和视觉 token。

非目标：

- 不在第一期建设完整实体体系、知识图谱或 claim-level 证据链。
- 不新增个人已读、忽略、收藏、置顶等用户状态；该页面面向公众展示。
- 不恢复已删除的实时热榜或 trending board。
- 不把多源确认、最新进展拆成独立主内容区；它们是重点事件的排序信号和解释标签。
- 不要求页面打开时实时调用 AI。
- 不替代 `/daily`；日报仍作为叙事型归档总结。

## 当前系统上下文

现有数据和能力可以支撑第一期：

- `Item` 已存储标题、摘要、全文、质量分、状态、来源、标签、事件签名、聚合关系和入库时间。
- `ContentCluster` 已存储聚合标题、摘要、分数、条目数、来源数、事件身份字段、Feed 展示统计字段。
- `src/lib/feed/recommend-score.ts` 已有 `qualityScore + sourceCount + itemCount` 的推荐分基础。
- `src/lib/daily-report/repository.ts` 已有日报候选池、按日候选、聚合去重、候选评分等逻辑。
- `src/components/ui/global-header.tsx` 当前公开导航为 `主页 / 日报`，可扩展 `速览`。
- `src/app/daily/page.tsx` 已使用 `PageShell`、左侧时间筛选和列表式归档布局。

关键约束：

- 日期窗口必须继续使用 `items.createdAt` 表示系统入库日期，保持和 Feed 的时间语义一致。
- 公开页面只能展示 `status="processed"` 且 `moderationStatus` 可展示的内容。
- 聚合事件优先展示 cluster；未聚合但高分的单条 item 可以作为 single event 展示。
- 第一版应尽量复用现有摘要和聚合结果，不新增同步 AI 调用。

## 产品定义

### 命名和入口

- Header nav label：`速览`
- 页面标题：`事件速览`
- 推荐 URL：
  - `/events`：默认展示今天。
  - `/events?date=2026-06-30`：第一期可用 query 参数实现。
  - `/events/2026-06-30`：后续可作为详情友好的归档 URL 方案评估。

公开导航顺序：

```text
主页 / 速览 / 日报
```

阅读层级：

- `主页`：完整资讯流。
- `速览`：某一天重要事件列表，按重要性排序。
- `日报`：某一天重要事件的叙事型总结和归档。

### 页面信息架构

页面只回答一个问题：

> 这一天最值得优先了解的事件有哪些？

首屏不做复杂 dashboard，不做多区块看板，不做并列的“多源确认 / 最新进展”内容区。页面结构：

```text
Header

事件速览
日期切换：上一天 / 日期选择 / 下一天 / 今天

当日概览：采集 N 条资讯，聚合为 M 个事件，优先展示 K 个重点事件。

重点事件
- 事件卡片
- 事件卡片
- 事件卡片
...

分页 / 加载更多
```

### 重点事件定义

重点事件是：

> 当前日期内有新增内容、可公开展示，并按 `attentionScore` 排序后优先展示的事件。

它不是所有事件，也不是所有多源事件。`多源确认`、`有新进展`、`官方来源`、`高质量分` 等只作为事件卡片上的 badge 或入选原因。

第一期重点事件来源：

- active `ContentCluster`，且 cluster 内至少有一条 item 的 `createdAt` 落在当天。
- 未聚合的 single item，且 item `createdAt` 落在当天。
- 排除过滤、隐藏、聚合父项和不可公开内容。

### 卡片信息密度

默认展示数量可配置，因此卡片必须比当前普通 Feed 卡更紧凑。每张卡片保持统一规格，不通过大卡、小卡做重要程度层级；重要性只通过排序体现。

事件卡片字段：

- 标题：优先 cluster title / display title。
- 标签行：`多源确认`、`有新进展`、`高优先级`、`官方来源` 等，最多 3 个。
- 发生了什么：一句话，优先来自 cluster summary 或代表 item summary 的第一句。
- 为什么重要：一句话，优先由规则生成；可从质量分、多源、事件类型、来源组、条目增长解释。
- 指标行：来源数、条目数、最近更新时间、质量/关注分。
- 入选原因：最多 3 个短语，例如 `4 个来源共同报道`、`近 2 小时新增 3 条`、`质量分 86`。
- 来源预览：最多 2-3 个来源名，剩余用 `等 N 个来源` 表示。
- 操作：`查看详情` 或点击整卡进入详情。

卡片不默认展示完整来源列表、完整时间线、长摘要或原文片段。

## Proposed Design

### Components and Responsibilities

`src/app/events/page.tsx`

- 新增公开事件速览页面。
- 解析 `date`、`page`、`pageSize` query。
- 获取公开 header links。
- 调用事件速览服务读取数据。
- 使用 `PageShell` 保持和 `/daily` 风格一致。
- 输出 CollectionPage JSON-LD。

`src/components/events/event-briefing-list.tsx`

- 客户端或服务端友好的列表组件。
- 渲染日期切换、当日概览、重点事件列表、分页。
- 保持卡片统一规格和紧凑密度。

`src/components/events/event-briefing-card.tsx`

- 渲染单个事件卡片。
- 只展示高密度摘要、badge、指标和入选原因。
- 支持 cluster 和 single item 两类 DTO。

`src/lib/events/service.ts`

- 事件速览主服务。
- 解析日期窗口。
- 调用 repository 获取候选。
- 计算 `attentionScore` 和 `attentionReasons`。
- 应用配置的默认展示数量、最大分页大小和排序。

`src/lib/events/repository.ts`

- 负责 Prisma 查询。
- 查询当天新增 item 和对应 cluster。
- 聚合 cluster 的当天新增数、来源数、代表 item、最新更新时间。
- 返回 service 所需的原始候选数据，不直接输出 UI DTO。

`src/lib/events/types.ts`

- 定义 `EventBriefingOptions`、`EventBriefingDTO`、`EventBriefingEntryDTO`、`AttentionReasonDTO` 等稳定类型。

`src/lib/settings/service.ts` / `src/components/admin/admin-settings-panel.tsx`

- 增加事件速览配置读取和保存。
- 配置项进入后台配置页，建议放在“任务配置”或“内容配置”下的新小节 `速览配置`。

`src/components/ui/global-header.tsx`

- `activeNav` 增加 `events`。
- `navItems` 增加 `{ href: "/events", key: "events", label: "速览" }`。

### Configuration Contract

新增数据库配置模型，避免把展示数量写死。

建议 Prisma model：

```prisma
model EventBriefingConfig {
  id                    String   @id @default(cuid())
  defaultEventLimit      Int      @default(30)
  maxEventLimit          Int      @default(100)
  sourcePreviewLimit     Int      @default(3)
  reasonPreviewLimit     Int      @default(3)
  minAttentionScore      Int      @default(0)
  includeSingleItems     Boolean  @default(true)
  createdAt              DateTime @default(now())
  updatedAt              DateTime @updatedAt

  @@map("event_briefing_configs")
}
```

配置规则：

- `defaultEventLimit`：默认重点事件数量。建议生产初始值为 30，因为当前每天约 300 条资讯。
- `maxEventLimit`：单页最大数量，防止公开页过重。
- `sourcePreviewLimit`：卡片来源预览数量，默认 3。
- `reasonPreviewLimit`：入选原因展示数量，默认 3。
- `minAttentionScore`：可选过滤阈值，默认 0 表示只按 Top N 截断。
- `includeSingleItems`：是否允许未聚合单篇作为重点事件进入速览。

后台校验：

- `defaultEventLimit` 范围建议 `5-100`。
- `maxEventLimit` 范围建议 `20-200`，且必须大于等于 `defaultEventLimit`。
- `sourcePreviewLimit` 范围建议 `1-5`。
- `reasonPreviewLimit` 范围建议 `1-5`。

### API and Query Contract

第一期可以仅使用 RSC 直读服务，不一定新增公开 JSON API。若组件需要客户端分页，则新增：

```http
GET /api/events?date=2026-06-30&page=1&pageSize=30
```

Query：

| Parameter | Type | Default | Notes |
|---|---:|---:|---|
| `date` | `YYYY-MM-DD` | 今天 | 按站点时区计算当天入库窗口。 |
| `page` | integer | 1 | 从 1 开始。 |
| `pageSize` | integer | config.defaultEventLimit | 不超过 config.maxEventLimit。 |

Response DTO：

```json
{
  "date": "2026-06-30",
  "generatedAt": "2026-06-30T14:32:00.000Z",
  "summary": {
    "itemCount": 300,
    "eventCount": 96,
    "shownCount": 30,
    "multiSourceCount": 18,
    "updatedEventCount": 11
  },
  "pagination": {
    "page": 1,
    "pageSize": 30,
    "total": 96,
    "totalPages": 4
  },
  "entries": [
    {
      "id": "cluster_123",
      "type": "cluster",
      "title": "OpenAI 发布新的 Agent 工具链能力",
      "whatHappened": "OpenAI 更新了面向开发者的 Agent 工具链。",
      "whyItMatters": "该变化可能影响 AI Coding 工具的集成方式和产品竞争格局。",
      "summary": "OpenAI 更新了面向开发者的 Agent 工具链...",
      "attentionScore": 91,
      "badges": ["多源确认", "高优先级"],
      "reasons": ["5 个来源共同报道", "近 2 小时新增 3 条", "质量分 86"],
      "sourceCount": 5,
      "itemCount": 12,
      "sourcesPreview": ["OpenAI Blog", "The Verge", "TechCrunch"],
      "latestCreatedAt": "2026-06-30T13:50:00.000Z",
      "latestPublishedAt": "2026-06-30T13:10:00.000Z",
      "detailHref": "/events/cluster_123"
    }
  ]
}
```

### Attention Score

第一期使用规则分，不新增同步 AI。

建议公式：

```text
attentionScore =
  qualityBase
  + sourceBoost
  + itemBoost
  + recencyBoost
  + updateBoost
  + eventTypeBoost
```

信号定义：

- `qualityBase`：cluster 使用平均或 displayAverageScore；single item 使用 `qualityScore`。
- `sourceBoost`：不同来源数加分，上限控制，避免多源事件挤掉所有单源高价值事件。
- `itemBoost`：同一事件条目数加分，上限控制。
- `recencyBoost`：当天越新的事件略微加分。
- `updateBoost`：cluster 创建早于当天，但当天有新增 item，视为 `有新进展`。
- `eventTypeBoost`：`security`、`policy`、`acquisition`、`funding`、`launch` 等可加小额权重。

第一期不要把关注标签、个人偏好、用户行为纳入核心公式；该页面是公开速览。

### Attention Reasons and Badges

`attentionReasons` 是解释排序的核心，需要可读、短、稳定。

示例：

- `5 个来源共同报道`
- `12 条内容归入同一事件`
- `近 2 小时新增 3 条`
- `质量分 86`
- `安全事件`
- `官方来源发布`

Badge 建议只保留少量类别：

- `多源确认`：`sourceCount >= 2` 或配置阈值。
- `有新进展`：cluster 早于当天存在，且当天新增 item。
- `高优先级`：`attentionScore` 超过阈值或位于当日 Top 段。
- `官方来源`：第一期可选；只有现有 source 配置能识别官方源时再展示。

### Date Semantics

事件速览日期采用 `items.createdAt` 的站点日边界：

- 默认日期为站点当前日期。
- 查询窗口为 `[dateStart, dateEnd)`。
- `dateStart/dateEnd` 使用和 Feed 当天语义一致的时区边界。
- 页面文案使用“当日采集 / 当日入库”，避免与原文 `publishedAt` 混淆。

### Detail Page

第一期列表卡片可以先跳转到现有原文或 cluster 展开逻辑；推荐同步规划事件详情：

```text
/events/[entryId]
```

详情页展示：

- 事件总览。
- 为什么重要。
- 来源列表。
- 基础时间线，按 item `createdAt` 或 `publishedAt` 排列。
- 相关原文。

详情页不是第一期强依赖；列表页应先独立可用。

## Data and State

### Candidate Selection

候选集合：

1. 当天新增且可展示的 items。
2. 对有 `clusterId` 的 item 按 active cluster 分组。
3. 对无 `clusterId` 的 item 作为 single event。
4. 排除：
   - `status != "processed"`
   - `moderationStatus` 不在公开可展示状态内
   - `isAggregation = true`
   - cluster `status != "active"`

cluster 统计：

- `sourceCount`：不同 source 数。
- `itemCount`：cluster 下可展示 item 总数或 display item count。
- `newItemCountOnDate`：当天新增 item 数。
- `latestCreatedAt`：cluster 下最新入库时间。
- `latestPublishedAt`：cluster 下最新发布时间。
- `representativeItem`：质量分高、时间新的代表 item，用于来源和摘要 fallback。

### Caching

事件速览是公开页面，应该缓存：

- RSC page `revalidate` 可初始设为 60-300 秒。
- 如新增 API，返回可使用短 TTL cache。
- 后端写入影响公开 feed 时已有 `invalidateFeedCache()` 要求；事件速览应新增独立 `invalidateEventBriefingCache()` 或共用内容变更后的统一 public cache invalidation hook。

### Admin Configuration State

`EventBriefingConfig` 单例配置：

- 初始化由 `db:setup` 或 settings service ensure 方法创建。
- 后台保存配置后应使事件速览缓存失效。
- 配置读取失败时使用安全默认值。

## UI Design

### Layout

复用现有 `PageShell` 和 `GlobalHeader`：

```text
Header

事件速览
2026-06-30    上一天 / 日期选择 / 下一天 / 今天

当日采集 300 条资讯，聚合为 96 个事件，优先展示 30 个重点事件。

重点事件
[紧凑事件卡片]
[紧凑事件卡片]
[紧凑事件卡片]

分页
```

设计原则：

- 不做 dashboard 指标墙。
- 不做左侧筛选 + 右侧列表，避免它更像普通 Feed。
- 不做 Top 5 / 更多重点事件分区。
- 不做视觉层级突出前几条；重要性只由排序体现。
- 所有卡片同一规格，便于快速扫读。
- 移动端单列；桌面也以单列或紧凑双列评估，但第一期优先单列以保持日报和主页阅读连续性。

### Card Density

卡片应比 Feed 卡更短：

- 标题最多 2 行。
- `发生了什么` 1 行或 2 行。
- `为什么重要` 1 行。
- reasons/badges 一行内尽量展示，换行后仍不超过 2 行。
- 来源预览不超过配置数量。

卡片示例：

```text
[多源确认] [有新进展]                 5 来源 · 12 条 · 13:50 更新

OpenAI 发布新的 Agent 工具链能力

发生了什么：OpenAI 更新了面向开发者的 Agent 工具链。
为什么重要：可能影响 AI Coding 工具的集成方式和产品竞争格局。

入选原因：5 个来源共同报道 / 近 2 小时新增 3 条 / 质量分 86
来源：OpenAI Blog · The Verge · TechCrunch 等
```

## Quality Attributes

### Performance

- 默认展示数量来自配置，初始建议 30；公开查询必须分页。
- repository 查询应避免 N+1。
- 对 cluster 统计优先使用已有 `displaySourceCount`、`displayItemCount`、`displayRecommendScore`，必要时只对当天候选做批量统计。
- 页面不实时调用 AI。
- 大日期窗口不存在；只支持单日，避免任意范围导致查询膨胀。

### Reliability

- 配置缺失时使用默认值。
- 某个 cluster 摘要为空时 fallback 到代表 item summary。
- `whatHappened` 或 `whyItMatters` 无法生成时，使用摘要句子和入选原因拼接的 deterministic fallback。
- 当天无内容时显示空状态，并给出返回最近有内容日期或查看主页的入口。

### Security and Privacy

- 页面公开展示，只能输出公开可展示内容。
- 后台配置保存需要 admin session。
- 不输出 filtered item、隐藏 cluster、后台复核状态或内部错误。
- 不暴露 prompt、模型响应原文、task error details。

### Accessibility

- 日期切换和分页使用可访问按钮/链接。
- 卡片 badge 不依赖颜色表达全部含义。
- 标题层级保持 `h1 -> h2 -> h3`。
- 点击整卡时仍保留可聚焦的显式链接。

### SEO

- `/events` 可索引。
- 如果后续支持 `/events/YYYY-MM-DD`，每日归档页可索引。
- query 版本 `/events?date=...` 需要 canonical 策略，避免重复索引。
- JSON-LD 使用 `CollectionPage` + `ItemList`。

### Observability

- 记录页面生成时的候选数、展示数、查询耗时。
- 后台配置保存记录 admin 操作结果。
- 如新增 API，返回错误需区分参数错误、配置错误和内部错误。

## Compatibility, Migration, and Rollback

### Migration

- 新增 `EventBriefingConfig` 表。
- `scripts/setup-sqlite.mjs` 需要初始化默认配置。
- Prisma migration 只从 `schema.prisma` 生成，不手写业务 SQL。

### Compatibility

- 不改变现有 `/` feed 查询和排序。
- 不改变 `/daily` 报告生成逻辑。
- 不改变 feed time filtering 的 `items.createdAt` 语义。
- 不改变 cluster assignment 和 merge pipeline。

### Rollback

- 如果页面出现性能或质量问题，可从 header 移除 `速览` nav，保留后端表不影响现有功能。
- 配置表可保留，后续再启用。
- 不应引入会破坏现有 feed/daily 的 shared DTO 变更。

## Testing and Verification

Unit tests:

- `attentionScore` 计算：质量分、多源、条目数、新鲜度、事件类型加分。
- `attentionReasons` 生成：数量上限、文案稳定、空数据 fallback。
- 日期窗口：使用 `createdAt` 和站点日边界。
- 配置 normalization：默认值、范围限制、非法输入。

Integration tests:

- 事件速览 repository 正确聚合 cluster 和 single item。
- 过滤不可公开内容。
- 分页和配置数量生效。
- 后台配置 API 保存后可读取。
- Header nav active state 正确。

Component tests:

- `EventBriefingList` 渲染日期切换、概览、重点事件列表和空状态。
- `EventBriefingCard` 在长标题、长来源名、缺少摘要、多个 badge 时不溢出。
- 移动端布局不重叠。

Validation commands:

```bash
npx tsc --noEmit
npm run lint
vitest run tests/unit/event-briefing*.test.ts
vitest run tests/integration/event-briefing*.test.ts
vitest run tests/components/event-briefing*.test.tsx
npm run build
```

如果实现改动包含视觉布局，需补浏览器检查桌面和移动端截图。

## Tradeoffs and Alternatives

### Alternative A: 事件看板 + 多区块 dashboard

优点：更像传统“看板”，可以展示多源确认、最新进展、高优先级等多个区块。

缺点：页面信息过多，事件重复出现，用户需要理解多个分区，违背“少花时间获得重点”的目标。

结论：不采用。

### Alternative B: 时间范围筛选

优点：灵活，可以看 24 小时、3 天、7 天。

缺点：公开页面语义不如按日清晰；不利于归档、分享、SEO；不同范围下展示数量和重要性理解不稳定。

结论：第一期不采用。事件速览按单日工作。

### Alternative C: 固定 Top 20 或 Top 30

优点：实现简单。

缺点：生产数据量会变化，用户也明确希望数量可配置。

结论：不采用。展示数量进入后台配置，默认建议 30。

### Alternative D: 第一期开启 AI 事件 brief

优点：`发生了什么` 和 `为什么重要` 质量可能更高。

缺点：新增任务、缓存、失败处理和成本；会拖慢第一期交付。

结论：第一期使用已有摘要和规则 fallback。后续可添加异步 AI brief，但必须缓存，不能页面实时生成。

## Open Questions

- Header nav 最终 label 是否确定为 `速览`，还是使用 `看板`？本 TRD 推荐 `速览`。
- 第一版是否需要 `/events/[entryId]` 详情页，还是先复用现有 feed cluster 展开/原文跳转？
- `高优先级` badge 阈值用固定分数还是当日 Top percentile？
- `官方来源` 是否已有可靠 source metadata 支撑？没有则第一期不展示该 badge。
- 事件速览配置入口放在“内容配置”还是“任务配置”？本 TRD 倾向“内容配置 / 速览配置”。

## Execution Plan Inputs

建议实现切片：

1. 数据层：新增 `EventBriefingConfig` schema、setup 初始化、settings service 读写。
2. Scoring 层：新增 `src/lib/events/*`，完成候选查询、日期窗口、attention score、reasons、DTO。
3. 页面层：新增 `/events` 页面、header nav、SEO metadata、JSON-LD。
4. UI 层：新增事件速览列表和紧凑卡片，复用现有 UI token。
5. 后台配置：在 admin settings 增加速览配置表单和 API。
6. 验证：补单元、集成、组件测试，跑 typecheck、lint、build。

主要风险：

- cluster 统计查询如果写得过重，会影响公开页性能。
- 卡片信息密度过高可能导致移动端溢出，需要组件测试和截图验证。
- 如果 DTO 复用 feed DTO 过多，可能把 Feed 语义和事件速览语义耦合；建议单独建 `src/lib/events/types.ts`。
