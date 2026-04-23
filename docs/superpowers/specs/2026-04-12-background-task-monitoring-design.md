# 后台任务监控与默认抓取调度控制设计

## 背景

当前系统已经具备以下后台能力：

- 支持手动触发 RSS 抓取。
- 支持对单条内容执行摘要重生成、翻译重生成、重新 AI 判定。
- 支持对聚合结果执行摘要重生成。

但这些能力仍存在三个明显缺口：

1. 没有统一的后台任务中心，无法看到最近执行过哪些后台操作、它们当前是否在运行、失败原因是什么。
2. 没有应用内调度观测面板，无法查看默认抓取任务是否启用、最近执行情况、下次执行时间。
3. 默认抓取任务缺少后台控制入口，管理员无法在页面中启停任务或修改执行频率。

本次设计的目标是在保留现有抓取与内容处理主流程的前提下，引入统一任务记录模型、独立 worker 进程与后台监控页面，补齐任务监控与默认抓取调度控制能力。

## 目标

- 为后台所有异步操作建立统一任务记录中心。
- 为默认抓取任务提供应用内置调度器。
- 在后台页面展示默认抓取任务的启用状态、最近执行状态和下次执行时间。
- 在后台页面支持启用、停用默认抓取任务，并修改抓取频率。
- 在后台页面实时查看后台任务进度、运行状态和错误摘要。
- 覆盖定时抓取、手动刷新、单条内容重生成与聚合摘要重生成等后台操作。

## 非目标

- 不做任意任务类型的可配置调度中心。本期只支持默认抓取任务 `ingestion_default`。
- 不做任务取消、手动重试、优先级队列或复杂工作流编排。
- 不做 WebSocket 或 SSE 推送，本期采用短轮询。
- 不做多 worker 扩容优化。
- 不做监控图表或统计看板，本期只提供状态卡片和任务列表。

## 用户场景

### 场景 1：管理员查看默认抓取调度状态

管理员打开后台监控页，可以看到默认抓取任务是否启用、最近一次执行结果、最近开始和结束时间、下次执行时间，以及调度器当前是否在线。

### 场景 2：管理员调整默认抓取频率

管理员在后台监控页修改默认抓取频率或直接停用该任务。保存后，worker 在下一次轮询中读取到最新配置，并重新计算下一次执行时间。

### 场景 3：管理员观察后台任务实时进度

管理员手动触发抓取、重生成摘要或重新 AI 判定后，页面立即展示新任务进入队列，随后显示运行中、成功、失败或部分成功状态，并可查看阶段文案和错误摘要。

## 方案对比

### 方案 A：独立调度器进程 + 统一任务中心

新增独立 worker 进程，负责调度检查和后台任务执行；新增调度状态表和后台任务运行表，后台页面统一读取这些数据。

优点：

- 任务调度、任务执行、页面展示边界清晰。
- Docker Compose 部署模型稳定，不依赖 Next.js Web 进程常驻。
- 既能满足默认抓取任务的启停与频率控制，也能统一观察所有后台操作。
- 后续若增加第二个定时任务，扩展成本较低。

缺点：

- 需要新增数据模型、worker 入口和监控 API。

### 方案 B：在 Web 进程内嵌定时器，并继续基于现有 `FetchRun` 打补丁

优点：

- 初期改动较少。

缺点：

- Web 进程重启、横向扩容或容器迁移时容易丢失定时状态。
- 只能较好覆盖抓取任务，无法自然承接其他后台操作的统一监控。
- 页面状态需要拼接多套数据，边界混乱。

### 方案 C：只把调度配置写入 `AppConfig`，保留现有同步执行模式

优点：

- 改动最小。

缺点：

- 只能解决“能不能开关、多久执行一次”，无法满足后台任务实时进度需求。
- 手动触发与内容重生成仍然缺少排队、运行中和失败监控。

最终采用方案 A。

## 架构设计

### 整体结构

系统拆分为两个运行角色：

- `app`：负责页面渲染、后台 API、手动触发入口和调度配置修改。
- `worker`：负责定时检查、认领后台任务、执行后台操作、更新任务进度和调度心跳。

在 Docker Compose 下，`app` 与 `worker` 复用同一镜像、同一数据库和同一配置目录，但启动命令不同。

### 核心职责划分

#### 调度状态服务

负责维护默认抓取任务 `ingestion_default` 的配置与运行状态，包括：

- 是否启用
- 执行频率
- 时区
- 最近心跳
- 最近执行状态
- 最近开始和结束时间
- 下次执行时间

#### 任务中心服务

负责创建、查询和更新统一的后台任务运行记录，包括：

- 任务入队
- 任务认领
- 状态迁移
- 进度更新
- 错误摘要记录

#### Worker 调度循环

负责两个子流程：

1. 周期性更新默认抓取任务的心跳并检查是否到达执行时间。
2. 周期性认领 `queued` 状态的后台任务并执行。

## 数据模型设计

### TaskSchedule

新增 `TaskSchedule` 表，表示“定时安排本身”。本期只维护一条记录：

- `key = ingestion_default`

建议字段：

- `id`
- `key`
- `enabled`
- `intervalMinutes`
- `timezone`
- `lastHeartbeatAt`
- `lastRunStartedAt`
- `lastRunFinishedAt`
- `lastRunStatus`
- `nextRunAt`
- `createdAt`
- `updatedAt`

字段语义：

- `enabled` 与 `intervalMinutes` 允许后台页面修改。
- `timezone` 本期固定使用应用配置时区，后台只读展示。
- `lastHeartbeatAt` 用于判断 worker 是否在线。
- `lastRun*` 与 `nextRunAt` 由 worker 维护，后台只读展示。

### BackgroundTaskRun

新增 `BackgroundTaskRun` 表，表示“一次后台任务执行”。

建议字段：

- `id`
- `kind`
- `triggerType`
- `status`
- `label`
- `entityId`
- `progressCurrent`
- `progressTotal`
- `progressLabel`
- `startedAt`
- `finishedAt`
- `errorSummary`
- `createdAt`
- `updatedAt`

#### kind 枚举

- `ingestion`
- `item_regenerate_translation`
- `item_regenerate_summary`
- `item_reanalyze`
- `cluster_regenerate_summary`

#### triggerType 枚举

- `scheduled`
- `manual`
- `admin_action`

#### status 枚举

- `queued`
- `running`
- `succeeded`
- `failed`
- `partial`

### FetchRun 扩展

保留现有 `FetchRun` 作为抓取细粒度执行记录，但增加：

- `taskRunId`

用途：

- `BackgroundTaskRun` 统一提供任务监控视图。
- `FetchRun` 继续保存抓取过程中的源级统计和错误汇总。
- 抓取任务完成后，将 `FetchRun` 的统计结果映射回 `BackgroundTaskRun`。

## 运行流程设计

### 默认抓取任务调度流程

1. worker 启动后加载 `TaskSchedule(key=ingestion_default)`。
2. worker 定期更新 `lastHeartbeatAt`。
3. 如果 `enabled = true` 且当前时间大于等于 `nextRunAt`，则检查当前是否已有抓取任务处于 `queued` 或 `running`。
4. 若没有运行中的抓取任务，则创建一条 `triggerType = scheduled` 的 `BackgroundTaskRun`。
5. worker 认领该任务并执行抓取逻辑。
6. 执行中同步更新 `BackgroundTaskRun` 与 `FetchRun`。
7. 执行结束后更新 `TaskSchedule.lastRun*` 和新的 `nextRunAt`。

### 手动抓取流程

1. 管理员调用 `POST /api/ingest/run`。
2. API 检查当前是否已有抓取任务在排队或运行。
3. 若无，则创建一条 `triggerType = manual` 的 `BackgroundTaskRun` 并返回 `202`。
4. worker 认领任务并开始执行抓取。

### 其他后台动作流程

以下动作统一改为异步任务：

- 单条摘要重生成
- 单条翻译重生成
- 单条重新 AI 判定
- 聚合摘要重生成

统一流程：

1. API route 创建 `BackgroundTaskRun(status=queued)`。
2. API 立即返回 `202 + taskRun`。
3. worker 认领任务并执行对应服务逻辑。
4. 执行中更新 `progressLabel` 与 `status`。
5. 执行完成后更新 `finishedAt`、最终状态和错误摘要。

## 进度与状态语义

### 抓取任务进度

抓取任务的进度基于现有 `FetchRun` 统计重算：

- `progressTotal = sourceCount`
- `progressCurrent = successCount + failureCount`
- `progressLabel` 示例：`已处理 8/20 个源，新增 34 条，失败 1 个源`

最终状态映射：

- 全部成功：`succeeded`
- 全部失败：`failed`
- 部分成功：`partial`

### 其他后台动作进度

不强制提供伪精确百分比，而是提供阶段型进度文案：

- `queued`
- `running: 正在读取条目`
- `running: 正在调用模型`
- `running: 正在回写结果`
- `succeeded`
- `failed`

对这类任务可用 `0/1`、`1/1` 作为粗粒度数值，页面主要展示 `progressLabel`。

### 错误摘要

- `errorSummary` 存储适合后台页面展示的短错误信息。
- 抓取任务更细的失败详情仍留在 `FetchRun` 及日志中。
- 单条内容任务失败时，`errorSummary` 应反映最主要的失败原因。

## 并发与互斥设计

### 抓取任务互斥

- 同一时刻只允许一个 `ingestion` 任务处于 `queued` 或 `running`。
- 调度器触发定时抓取前，若发现已有抓取任务在排队或运行，则跳过当前轮次，不重复入队。
- 手动触发抓取时也执行同样的互斥检查。

### 其他任务并发策略

- 本期 worker 默认串行执行后台任务，避免 SQLite 写竞争扩大。
- 同一实体的同类任务若已处于 `queued` 或 `running`，不再重复创建。

### 任务认领机制

任务认领采用乐观更新：

1. API 创建任务时写入 `queued`。
2. worker 查询待执行任务。
3. worker 通过条件更新将任务从 `queued` 改为 `running`。
4. 只有更新成功的 worker 才执行任务。

该策略避免依赖长事务或复杂锁表，适合 SQLite 场景。

## SQLite 风险控制

本项目当前使用 SQLite，因此需要控制写入模型：

- 不用长事务包住整个抓取过程。
- 进度更新只在关键节点发生。
- worker 心跳采用固定周期，例如每 10 秒更新一次。
- 页面轮询在有运行中任务时采用 2 到 3 秒，无运行中任务时退化为 10 秒。
- `nextRunAt` 的计算和写回统一由 worker 负责，避免多入口重复写入。

### 异常恢复

- worker 启动时扫描长时间停留在 `running` 的任务。
- 若判断为异常退出遗留状态，则将这些任务标记为 `failed`。
- `TaskSchedule.lastRunStatus` 应在恢复逻辑后保持真实结果，不允许长期停在“运行中”。

## 后台页面设计

### 页面入口

新增独立页面 `/admin/monitor`，不继续堆积到现有后台设置页中。

后台导航新增入口：

- 后台设置
- 内容审核
- 任务监控

### 页面结构

#### 区块 1：默认抓取任务

展示并控制以下信息：

- 启用开关
- 抓取频率输入或下拉
- 当前启用状态
- 调度器健康状态：在线 / 离线
- 最近执行状态
- 最近开始时间
- 最近结束时间
- 下次执行时间
- 保存按钮

说明：

- 页面只允许修改 `enabled` 与 `intervalMinutes`。
- 其他字段只读展示。

#### 区块 2：当前运行中任务

重点展示 `queued` 和 `running` 状态任务，包括：

- 任务名称
- 任务类型
- 触发方式
- 当前状态
- 进度文案
- 开始时间
- 错误摘要

#### 区块 3：最近任务列表

展示最近 20 到 50 条后台任务记录，并支持：

- 按 `status` 筛选
- 按 `kind` 筛选

每条记录展示：

- 任务名称
- 状态
- 触发方式
- 开始时间
- 持续时间
- 进度文案
- 错误摘要

## API 设计

### 新增接口

#### `GET /api/admin/monitor`

返回：

- `schedule`
- `runningTasks`
- `recentTasks`

#### `PATCH /api/admin/monitor/schedule/ingestion-default`

输入：

- `enabled`
- `intervalMinutes`

返回更新后的调度快照。

### 调整现有接口

#### `POST /api/ingest/run`

由“直接启动抓取”调整为“创建手动抓取任务并返回任务快照”。

返回语义：

- `202 Accepted`
- `taskRun`

#### 其他后台动作接口

以下接口改为异步任务语义：

- 单条摘要重生成
- 单条翻译重生成
- 单条重新 AI 判定
- 聚合摘要重生成

统一返回：

- `202 Accepted`
- `taskRun`

如需兼容现有调用方，可在保留核心响应字段的同时新增 `taskRun`，但页面与客户端逻辑应以异步任务为准。

## 测试策略

### 单元测试

- `nextRunAt` 计算逻辑
- 调度启停与频率变更后的状态更新
- `FetchRun` 到 `BackgroundTaskRun` 的进度映射
- 任务状态迁移规则
- 抓取任务互斥判断

### 服务层集成测试

- 手动抓取任务创建、认领与完成流程
- 修改默认抓取任务启停和频率后的调度状态更新
- 已有抓取任务运行时，新的定时轮次不会重复入队
- 单条内容重生成、重新 AI 判定和聚合摘要重生成能够写入任务记录

### API 测试

- `GET /api/admin/monitor`
- `PATCH /api/admin/monitor/schedule/ingestion-default`
- `POST /api/ingest/run`
- 相关后台动作接口新的 `202 + taskRun` 返回语义

### 页面测试

- `/admin/monitor` 展示调度状态、运行中任务和最近任务
- 修改启用状态和抓取频率后页面正确刷新
- 运行中任务随轮询更新
- 空状态、失败状态、离线心跳状态展示正确

## 兼容性与迁移策略

- 默认抓取任务 `TaskSchedule` 记录可在迁移或启动初始化时自动补齐。
- 若历史数据中不存在 `BackgroundTaskRun`，不影响旧 `FetchRun` 数据保留。
- 本期不对旧任务记录做回填，监控页只保证新增任务具备统一任务记录。

## 成功标准

- 管理员可在后台页面启用、停用默认抓取任务，并修改抓取频率。
- 管理员可在后台页面准确看到默认抓取任务的最近执行状态与下次执行时间。
- 手动抓取、内容重生成和重新 AI 判定等后台动作均可在监控页看到排队、运行中和完成状态。
- 抓取任务在运行中能够展示可理解的实时进度。
- worker 异常退出后，后台页面不会长期显示失真的运行状态。
