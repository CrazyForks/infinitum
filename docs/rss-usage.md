# RSS 订阅源使用说明

Infinitum 提供两个公开 RSS 订阅端点，分别用于订阅资讯聚合流和 AI 日报。所有 RSS 输出均为标准 RSS 2.0 格式（含 Atom 自引用链接），`Content-Type` 为 `application/rss+xml; charset=utf-8`，缓存时间 5 分钟。

## 端点一览

| 端点 | 说明 | 默认条目数 |
| --- | --- | --- |
| `/api/feed/rss` | 资讯聚合 RSS | 100 |
| `/api/daily/rss` | AI 日报 RSS | 50 |

以下假设站点域名为 `https://your-domain.example`，请替换为实际部署地址。

---

## 资讯聚合 RSS

### 基本订阅

```
https://your-domain.example/api/feed/rss
```

不带任何参数时，默认返回全部时间范围的最新 100 条资讯。

### 筛选参数

| 参数 | 类型 | 可选值 / 格式 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `range` | string | `today` / `3d` / `7d` / `1m` / `1y` / `all` | `all` | 按系统收录时间筛选 |
| `sort` | string | `time_desc` / `score_desc` | `time_desc` | 排序方式 |
| `start` | string | `YYYY-MM-DD` | — | 自定义收录起始日期 |
| `end` | string | `YYYY-MM-DD` | — | 自定义收录截止日期 |
| `publishedStart` | string | `YYYY-MM-DD` | — | 原文发布起始日期 |
| `publishedEnd` | string | `YYYY-MM-DD` | — | 原文发布截止日期 |
| `groupId` | string | 分组 ID | — | 按来源分组筛选 |
| `sourceId` | string | 信息源 ID | — | 按指定信息源筛选 |
| `title` | string | 关键词 | — | 按标题关键词搜索 |

### 参数详解

#### 时间范围（range）

`range` 按系统收录时间快速筛选：

| 值 | 含义 |
| --- | --- |
| `today` | 当天收录 |
| `3d` | 近 3 天 |
| `7d` | 近 7 天 |
| `1m` | 近 1 个月 |
| `1y` | 近 1 年 |
| `all` | 不限（RSS 默认值） |

如果同时指定了 `start` / `end`，则 `range` 参数被忽略，以自定义日期范围为准。

#### 排序方式（sort）

| 值 | 含义 |
| --- | --- |
| `time_desc` | 按系统收录时间倒序（默认） |
| `score_desc` | 按推荐评分倒序 |

#### 分组与来源筛选

- `groupId`：在管理后台「来源分组」中创建的分组 ID。RSS 标题会自动包含分组名称。
- `sourceId`：指定信息源 ID，仅返回该来源的内容。RSS 描述会标注「指定来源」。

分组 ID 和信息源 ID 可在管理后台查看，也可通过公开信息流 API `/api/feed` 的 `groups` 和 `sources` 字段获取。

#### 标题搜索

`title` 参数对标题进行关键词匹配，RSS 标题会显示为搜索结果格式。

### 使用示例

订阅近 7 天的资讯：

```
https://your-domain.example/api/feed/rss?range=7d
```

订阅按评分排序的全部资讯：

```
https://your-domain.example/api/feed/rss?range=all&sort=score_desc
```

订阅指定分组（假设分组 ID 为 `abc123`）：

```
https://your-domain.example/api/feed/rss?groupId=abc123
```

订阅指定信息源（假设来源 ID 为 `src456`）：

```
https://your-domain.example/api/feed/rss?sourceId=src456
```

搜索标题包含「AI」的资讯：

```
https://your-domain.example/api/feed/rss?title=AI
```

按原文发布日期筛选（2026 年 4 月发布的文章）：

```
https://your-domain.example/api/feed/rss?publishedStart=2026-04-01&publishedEnd=2026-04-30
```

组合筛选：近 1 个月、指定分组、按评分排序：

```
https://your-domain.example/api/feed/rss?range=1m&groupId=abc123&sort=score_desc
```

### 内容结构

RSS 中的每条 `<item>` 可能是以下两种类型之一：

- **单条内容**：来自单个信息源的独立文章，包含 `<source>`（来源名称）和 `<author>`（作者，如有）。
- **聚合内容**：描述同一事件的多条内容被归组为一个 cluster，`<source>` 显示来源数量（如「2 个来源」），`<description>` 中包含摘要和相关文章列表。

---

## AI 日报 RSS

### 基本订阅

```
https://your-domain.example/api/daily/rss
```

返回最近 50 篇已发布的 AI 日报，按发布时间倒序排列。该端点无需任何参数。

### 内容结构

每条 `<item>` 对应一篇已发布的日报：

- `<title>`：日报标题
- `<description>`：日报开篇摘要
- `<link>`：日报详情页链接，格式为 `https://your-domain.example/daily/{date}`
- `<source>`：引用来源数量（如「3 个引用」）
- `<author>`：固定为 `Infinitum`
- `<guid>`：格式为 `daily:{date}`

---

## 推荐阅读器

Android 用户可使用 [readrops-lumina](https://github.com/shawnxie94/readrops-lumina) 阅读 RSS，支持快速采集内容到 [Lumina](https://github.com/shawnxie94/lumina)。

其他主流 RSS 阅读器（如 Feedly、Inoreader、NetNewsWire、Miniflux、FreshRSS 等）均可正常订阅上述端点。

---

## 缓存与更新频率

| 端点 | 应用层缓存 | 说明 |
| --- | --- | --- |
| `/api/feed/rss` | `max-age=300`（5 分钟） | 每次请求最多返回 100 条 |
| `/api/daily/rss` | `max-age=300`，`stale-while-revalidate=300` | 每次请求最多返回 50 条 |

RSS 阅读器通常按自身轮询间隔拉取。建议将阅读器的刷新频率设置为不低于 10 分钟，避免对服务器造成不必要的压力。
