<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Infinitum Project Guide

## 项目定位

- 这是一个基于 Next.js 16 App Router 的资讯聚合系统。
- 主流程分成四段：信息源抓取、正文补全、AI 判定与摘要、聚类后对外展示。
- 前台访客读取公开 feed，后台管理员处理抓取、内容复核、模型配置和任务监控。

## 代码结构

- `src/app/`
  - 页面与 Route Handlers。
  - `src/app/page.tsx` 是访客首页。
  - `src/app/api/feed/*` 是公开 feed 接口。
  - `src/app/api/admin/*` 是后台管理接口。
- `src/lib/feed/`
  - 前台 feed 查询、过滤、映射、缓存与请求参数解析。
- `src/lib/ingestion/`
  - RSS 解析、正文抓取、查重、过滤、AI enrich 主链路。
- `src/lib/clusters/`
  - 聚类匹配、聚类摘要、聚类显隐与聚类维护。
- `src/lib/items/`
  - 单条内容的重分析、重摘要、恢复等后台动作。
- `src/lib/tasks/`
  - 后台任务排队、调度、worker 执行和进度上报。
- `src/lib/settings/`
  - 模型配置、Prompt 配置、RSS 源配置、黑名单等管理逻辑。
- `prisma/schema.prisma`
  - 单一数据库结构来源。
- `scripts/setup-sqlite.mjs`
  - 从 Prisma schema 动态生成 SQLite 建表 SQL 并初始化数据库。

## 关键业务约束

- Feed 时间过滤当前按 `items.createdAt` 生效，不是 `publishedAt`。
  - 这是产品语义，表示“系统收录时间窗口”。
  - 做性能优化时不要擅自切换成 `publishedAt`，否则会改变用户看到的时间范围。
- 公开 feed 允许短 TTL 缓存。
  - 当前缓存目标是访客请求性能，不要求每次请求都实时命中数据库。
  - 任何会改变前台可见内容的后台写操作，优先同步清理 `src/lib/feed/cache.ts` 中的缓存。
- 抓取链路优先控制总耗时而不是单步纯并发数。
  - 速率瓶颈通常在正文抓取、AI enrich、聚类摘要和频繁进度落库。
  - 改链路时优先减少串行步骤和无意义写库。

## 开发原则

- 先改 `src/lib/*` 服务层，再改 `app/api/*` 路由层，最后才改组件。
- 有重复的请求参数解析、DTO 组装、状态映射时，优先抽到共享 helper，不要继续复制到 page 和 route 里。
- 涉及数据库结构调整时，只维护 `prisma/schema.prisma`。
  - 不要重新引入手写 `init.sql` 作为第二份 schema 真相源。
- 后台任务相关改动需要同时考虑：
  - 同步执行入口
  - worker 执行入口
  - 任务监控面板展示字段
- 对 feed 查询做性能改动时，先检查是否会影响：
  - 聚类/单条混排
  - group 计数
  - 标题搜索
  - 时区偏移下的日期边界

## 常用命令

- 安装依赖：`npm install`
- 本地开发：`npm run dev`
- 启动 worker：`npm run worker`
- 初始化开发库：`npm run db:setup`
- 重建测试库：`npm run db:test:setup`
- 生成 Prisma Client：`npm run prisma:generate`
- 全量测试：`npm test`
- 静态检查：`npm run lint`

## 测试建议

- 改 feed 查询或过滤逻辑后，优先跑：
  - `tests/integration/feed-api.test.ts`
  - `tests/unit/feed-range.test.ts`
- 改抓取或任务链路后，优先跑：
  - `tests/integration/ingestion-service.test.ts`
  - `tests/integration/background-task-service.test.ts`
- 改数据库初始化逻辑后，优先跑：
  - `tests/integration/sqlite-setup-migration.test.ts`

## 已知实现偏好

- 访客列表读取尽量走 `src/lib/feed/service.ts`，不要直接在页面或 Route Handler 里拼装缓存逻辑。
- 任何可能引入高频写库的代码，都要问一句：
  - 这是不是可以批量落库、节流上报，或者只在阶段结束时刷新？
- 如果要继续优化抓取速度，优先排查这几个点：
  - 源抓取并发是否受限
  - AI enrich 是否对“可复用老结果”的内容仍重复调用
  - 聚类匹配是否被全局锁放大成串行瓶颈
  - 进度更新是否仍然过于频繁
