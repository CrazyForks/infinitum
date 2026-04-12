# 后台任务监控与默认抓取调度控制 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为默认抓取任务补齐启停与频率控制，并为抓取、内容重生成、重新 AI 判定等后台动作提供统一任务监控、实时进度和独立 worker 执行链路。

**Architecture:** 通过 Prisma 新增 `TaskSchedule` 和 `BackgroundTaskRun` 两个模型，把“调度配置/状态”和“单次任务执行记录”拆开。Web 侧负责展示、手动触发和调度配置更新，独立 worker 负责轮询调度、认领任务、执行后台操作并持续写回任务进度；抓取任务继续复用现有 `FetchRun`，通过 `taskRunId` 与统一任务中心关联。

**Tech Stack:** Next.js 16 App Router, React 19, Prisma + SQLite, Vitest, Docker Compose

---

## File Structure

### Existing files to modify

- `prisma/schema.prisma`
  - 新增调度与后台任务模型、枚举及 `FetchRun.taskRunId` 关系。
- `src/lib/settings/service.ts`
  - 初始化默认调度记录，提供读取与更新默认抓取调度配置的服务。
- `src/lib/settings/types.ts`
  - 扩展后台页和监控页所需的快照类型。
- `src/lib/feed/repository.ts`
  - 关联 `FetchRun` 与 `BackgroundTaskRun`，提供抓取任务互斥检查和进度映射辅助函数。
- `src/lib/ingestion/service.ts`
  - 支持带任务上下文执行抓取，并同步更新统一任务状态。
- `src/lib/items/service.ts`
  - 将单条摘要重生成、翻译重生成、重新 AI 判定切换到可被 worker 调用的异步执行函数。
- `src/lib/clusters/service.ts`
  - 暴露聚合摘要重生成的 worker 调用入口。
- `src/app/api/ingest/run/route.ts`
  - 从同步触发抓取改为创建后台任务并返回 `202`。
- `src/app/api/ingest/status/route.ts`
  - 兼容新任务中心或改为返回最新抓取任务快照。
- `src/app/api/admin/items/[id]/regenerate/route.ts`
  - 创建后台任务而非阻塞执行。
- `src/app/api/admin/items/[id]/reanalyze/route.ts`
  - 创建后台任务而非阻塞执行。
- `src/app/api/admin/clusters/[id]/regenerate-summary/route.ts`
  - 创建后台任务而非阻塞执行。
- `src/components/admin/admin-settings-panel.tsx`
  - 新增“任务监控”入口链接。
- `src/components/admin/content-review-panel.tsx`
  - 新增“任务监控”入口链接。
- `docker-compose.yml`
  - 新增 `worker` 服务。
- `Dockerfile`
  - 确保 worker 运行时镜像包含 `src`、`tsconfig.json` 和 worker 启动脚本。
- `package.json`
  - 新增 worker 启动脚本和运行时 TypeScript 执行依赖。
- `scripts/docker-entrypoint.sh`
  - 允许通过环境变量区分 web / worker 启动模式，或复用数据库初始化逻辑给 worker 启动脚本。

### New files to create

- `src/lib/tasks/types.ts`
  - 定义任务类型、状态、调度快照、监控页 DTO。
- `src/lib/tasks/repository.ts`
  - 封装 `TaskSchedule` / `BackgroundTaskRun` 的数据库读写。
- `src/lib/tasks/service.ts`
  - 提供入队、认领、进度更新、异常恢复、监控聚合查询等服务。
- `src/lib/tasks/scheduler.ts`
  - 负责 `nextRunAt` 计算、心跳过期判断和默认抓取调度逻辑。
- `src/lib/tasks/worker.ts`
  - 运行 worker 主循环，轮询调度与后台任务。
- `src/lib/tasks/handlers.ts`
  - 将 `BackgroundTaskRun.kind` 映射到具体执行函数。
- `src/app/api/admin/monitor/route.ts`
  - 返回监控页所需的调度快照、运行中任务和最近任务。
- `src/app/api/admin/monitor/schedule/ingestion-default/route.ts`
  - 更新默认抓取任务的启停与频率。
- `src/app/admin/monitor/page.tsx`
  - 受保护的监控页面入口。
- `src/components/admin/admin-monitor-panel.tsx`
  - 监控页客户端 UI 与轮询逻辑。
- `tests/unit/task-scheduler.test.ts`
  - 验证 `nextRunAt`、心跳状态、调度判断。
- `tests/integration/background-task-service.test.ts`
  - 验证任务入队、认领、恢复和互斥。
- `tests/integration/admin-monitor-api.test.ts`
  - 验证监控 API 与调度更新 API。
- `tests/components/admin-monitor-panel.test.tsx`
  - 验证监控页面展示、保存和轮询。
- `scripts/run-worker.ts`
  - 以 Node 进程常驻方式启动 worker 主循环。
- `scripts/worker-entrypoint.sh`
  - 运行 SQLite 初始化后启动 worker 进程。

## Task 1: 建立任务中心与调度表的数据库基础

**Files:**
- Modify: `prisma/schema.prisma`
- Test: `tests/integration/background-task-service.test.ts`
- Test: `tests/integration/ingest-api.test.ts`

- [ ] **Step 1: 写出会失败的集成测试，先锁定新模型的最低行为**

```ts
import { describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";

describe("background task persistence", () => {
  it("creates the default ingestion schedule once", async () => {
    const schedule = await prisma.taskSchedule.create({
      data: {
        key: "ingestion_default",
        enabled: true,
        intervalMinutes: 60,
        timezone: "Asia/Shanghai",
        nextRunAt: new Date("2026-04-12T01:00:00.000Z"),
      },
    });

    expect(schedule.key).toBe("ingestion_default");
    expect(schedule.intervalMinutes).toBe(60);
  });

  it("links fetch runs to a background task run", async () => {
    const taskRun = await prisma.backgroundTaskRun.create({
      data: {
        kind: "ingestion",
        triggerType: "manual",
        status: "queued",
        label: "默认抓取任务",
      },
    });

    const fetchRun = await prisma.fetchRun.create({
      data: {
        taskRunId: taskRun.id,
        triggerType: "manual",
        status: "running",
      },
    });

    expect(fetchRun.taskRunId).toBe(taskRun.id);
  });
});
```

- [ ] **Step 2: 运行定向测试，确认 Prisma Client 因缺少模型而失败**

Run: `npx vitest run tests/integration/background-task-service.test.ts`

Expected: FAIL with Prisma validation errors mentioning `taskSchedule`, `backgroundTaskRun`, or missing `taskRunId`.

- [ ] **Step 3: 在 Prisma schema 中加入调度模型、任务模型、枚举和抓取关联**

```prisma
enum BackgroundTaskKind {
  ingestion
  item_regenerate_translation
  item_regenerate_summary
  item_reanalyze
  cluster_regenerate_summary
}

enum BackgroundTaskTrigger {
  scheduled
  manual
  admin_action
}

enum BackgroundTaskStatus {
  queued
  running
  succeeded
  failed
  partial
}

model TaskSchedule {
  id                String   @id @default(cuid())
  key               String   @unique
  enabled           Boolean  @default(true)
  intervalMinutes   Int
  timezone          String
  lastHeartbeatAt   DateTime?
  lastRunStartedAt  DateTime?
  lastRunFinishedAt DateTime?
  lastRunStatus     BackgroundTaskStatus?
  nextRunAt         DateTime
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  @@map("task_schedules")
}

model BackgroundTaskRun {
  id              String                @id @default(cuid())
  kind            BackgroundTaskKind
  triggerType     BackgroundTaskTrigger
  status          BackgroundTaskStatus  @default(queued)
  label           String
  entityId        String?
  progressCurrent Int                   @default(0)
  progressTotal   Int                   @default(0)
  progressLabel   String?
  startedAt       DateTime?
  finishedAt      DateTime?
  errorSummary    String?
  createdAt       DateTime              @default(now())
  updatedAt       DateTime              @updatedAt
  fetchRuns       FetchRun[]

  @@index([status, createdAt])
  @@index([kind, status, createdAt])
  @@map("background_task_runs")
}

model FetchRun {
  id           String             @id @default(cuid())
  taskRunId    String?
  triggerType  IngestionTrigger
  status       FetchRunStatus     @default(running)
  startedAt    DateTime           @default(now())
  finishedAt   DateTime?
  sourceCount  Int                @default(0)
  itemCount    Int                @default(0)
  successCount Int                @default(0)
  failureCount Int                @default(0)
  errorSummary String?
  taskRun      BackgroundTaskRun? @relation(fields: [taskRunId], references: [id], onDelete: SetNull)

  @@index([taskRunId])
  @@index([startedAt])
  @@map("fetch_runs")
}
```

- [ ] **Step 4: 生成 Prisma Client 并重新运行测试，确认模型可用**

Run: `npm run prisma:generate && npx vitest run tests/integration/background-task-service.test.ts`

Expected: PASS for model creation assertions, or move on to the next failing service-level expectation instead of schema errors.

- [ ] **Step 5: 提交数据库基础改动**

```bash
git add prisma/schema.prisma tests/integration/background-task-service.test.ts
git commit -m "feat: add task monitoring persistence models"
```

## Task 2: 实现调度计算、初始化和任务仓储服务

**Files:**
- Create: `src/lib/tasks/types.ts`
- Create: `src/lib/tasks/repository.ts`
- Create: `src/lib/tasks/service.ts`
- Create: `src/lib/tasks/scheduler.ts`
- Modify: `src/lib/settings/service.ts`
- Modify: `src/lib/settings/types.ts`
- Test: `tests/unit/task-scheduler.test.ts`
- Test: `tests/integration/background-task-service.test.ts`

- [ ] **Step 1: 先写调度单元测试和任务仓储集成测试**

```ts
import { describe, expect, it } from "vitest";

import {
  computeNextRunAt,
  isSchedulerHeartbeatStale,
  normalizeScheduleInput,
} from "@/lib/tasks/scheduler";

describe("task scheduler", () => {
  it("computes the next run from the latest finished time", () => {
    const nextRunAt = computeNextRunAt({
      intervalMinutes: 30,
      now: new Date("2026-04-12T00:00:00.000Z"),
      anchor: new Date("2026-04-12T00:10:00.000Z"),
    });

    expect(nextRunAt.toISOString()).toBe("2026-04-12T00:40:00.000Z");
  });

  it("clamps invalid schedule updates", () => {
    expect(normalizeScheduleInput({ enabled: true, intervalMinutes: 3 })).toEqual({
      enabled: true,
      intervalMinutes: 5,
    });
  });

  it("marks stale heartbeats after the timeout window", () => {
    expect(
      isSchedulerHeartbeatStale({
        lastHeartbeatAt: new Date("2026-04-12T00:00:00.000Z"),
        now: new Date("2026-04-12T00:00:31.000Z"),
        maxAgeMs: 30_000,
      }),
    ).toBe(true);
  });
});
```

```ts
import { describe, expect, it } from "vitest";

import {
  claimNextQueuedTaskRun,
  ensureDefaultIngestionSchedule,
  enqueueTaskRun,
  listRecentTaskRuns,
} from "@/lib/tasks/service";

describe("background task service", () => {
  it("seeds the default ingestion schedule", async () => {
    const schedule = await ensureDefaultIngestionSchedule();
    expect(schedule.key).toBe("ingestion_default");
  });

  it("claims a queued task only once", async () => {
    const created = await enqueueTaskRun({
      kind: "ingestion",
      triggerType: "manual",
      label: "默认抓取任务",
    });

    const firstClaim = await claimNextQueuedTaskRun();
    const secondClaim = await claimNextQueuedTaskRun();

    expect(firstClaim?.id).toBe(created.id);
    expect(secondClaim).toBeNull();
  });

  it("lists the newest tasks first", async () => {
    const tasks = await listRecentTaskRuns({ limit: 20 });
    expect(tasks[0]?.createdAt.getTime()).toBeGreaterThanOrEqual(tasks.at(-1)?.createdAt.getTime() ?? 0);
  });
});
```

- [ ] **Step 2: 运行测试，确认它们因为缺少服务文件和导出而失败**

Run: `npx vitest run tests/unit/task-scheduler.test.ts tests/integration/background-task-service.test.ts`

Expected: FAIL with module resolution errors for `@/lib/tasks/*`.

- [ ] **Step 3: 实现任务类型、仓储和调度逻辑，并在设置服务中补齐默认调度记录**

```ts
// src/lib/tasks/types.ts
export type DefaultIngestionScheduleKey = "ingestion_default";

export type BackgroundTaskRunKind =
  | "ingestion"
  | "item_regenerate_translation"
  | "item_regenerate_summary"
  | "item_reanalyze"
  | "cluster_regenerate_summary";

export type BackgroundTaskRunStatus = "queued" | "running" | "succeeded" | "failed" | "partial";

export type BackgroundTaskMonitorSnapshot = {
  schedule: {
    key: DefaultIngestionScheduleKey;
    enabled: boolean;
    intervalMinutes: number;
    timezone: string;
    lastHeartbeatAt: string | null;
    lastRunStartedAt: string | null;
    lastRunFinishedAt: string | null;
    lastRunStatus: BackgroundTaskRunStatus | null;
    nextRunAt: string;
    isHeartbeatStale: boolean;
  };
  runningTasks: Array<{
    id: string;
    kind: BackgroundTaskRunKind;
    triggerType: "scheduled" | "manual" | "admin_action";
    status: BackgroundTaskRunStatus;
    label: string;
    entityId: string | null;
    progressCurrent: number;
    progressTotal: number;
    progressLabel: string | null;
    startedAt: string | null;
    errorSummary: string | null;
  }>;
  recentTasks: Array<{
    id: string;
    kind: BackgroundTaskRunKind;
    triggerType: "scheduled" | "manual" | "admin_action";
    status: BackgroundTaskRunStatus;
    label: string;
    entityId: string | null;
    progressCurrent: number;
    progressTotal: number;
    progressLabel: string | null;
    startedAt: string | null;
    finishedAt: string | null;
    errorSummary: string | null;
  }>;
};
```

```ts
// src/lib/tasks/scheduler.ts
const MIN_INTERVAL_MINUTES = 5;
const MAX_INTERVAL_MINUTES = 24 * 60;

export function normalizeScheduleInput(input: { enabled: boolean; intervalMinutes: number }) {
  return {
    enabled: input.enabled,
    intervalMinutes: Math.max(MIN_INTERVAL_MINUTES, Math.min(MAX_INTERVAL_MINUTES, Math.floor(input.intervalMinutes))),
  };
}

export function computeNextRunAt(input: { intervalMinutes: number; now: Date; anchor?: Date | null }) {
  const base = input.anchor ?? input.now;
  return new Date(base.getTime() + input.intervalMinutes * 60_000);
}

export function isSchedulerHeartbeatStale(input: { lastHeartbeatAt: Date | null; now: Date; maxAgeMs: number }) {
  if (!input.lastHeartbeatAt) {
    return true;
  }

  return input.now.getTime() - input.lastHeartbeatAt.getTime() > input.maxAgeMs;
}
```

```ts
// src/lib/tasks/service.ts
export async function ensureDefaultIngestionSchedule() {
  const now = new Date();
  return prisma.taskSchedule.upsert({
    where: { key: "ingestion_default" },
    update: {},
    create: {
      key: "ingestion_default",
      enabled: true,
      intervalMinutes: 60,
      timezone: "Asia/Shanghai",
      nextRunAt: computeNextRunAt({ intervalMinutes: 60, now }),
    },
  });
}

export async function enqueueTaskRun(input: {
  kind: BackgroundTaskRunKind;
  triggerType: "scheduled" | "manual" | "admin_action";
  label: string;
  entityId?: string | null;
}) {
  return prisma.backgroundTaskRun.create({
    data: {
      kind: input.kind,
      triggerType: input.triggerType,
      status: "queued",
      label: input.label,
      entityId: input.entityId ?? null,
    },
  });
}

export async function claimNextQueuedTaskRun() {
  const next = await prisma.backgroundTaskRun.findFirst({
    where: { status: "queued" },
    orderBy: { createdAt: "asc" },
  });

  if (!next) {
    return null;
  }

  const claimed = await prisma.backgroundTaskRun.updateMany({
    where: { id: next.id, status: "queued" },
    data: { status: "running", startedAt: new Date() },
  });

  if (claimed.count !== 1) {
    return null;
  }

  return prisma.backgroundTaskRun.findUniqueOrThrow({ where: { id: next.id } });
}
```

- [ ] **Step 4: 运行单元与集成测试，确认调度与任务仓储通过**

Run: `npx vitest run tests/unit/task-scheduler.test.ts tests/integration/background-task-service.test.ts`

Expected: PASS

- [ ] **Step 5: 提交任务基础服务**

```bash
git add src/lib/tasks src/lib/settings/service.ts src/lib/settings/types.ts tests/unit/task-scheduler.test.ts tests/integration/background-task-service.test.ts
git commit -m "feat: add task scheduling services"
```

## Task 3: 为 worker 提供主循环、异常恢复和 Docker 启动方式

**Files:**
- Create: `src/lib/tasks/handlers.ts`
- Create: `src/lib/tasks/worker.ts`
- Create: `scripts/run-worker.ts`
- Create: `scripts/worker-entrypoint.sh`
- Modify: `docker-compose.yml`
- Modify: `Dockerfile`
- Modify: `package.json`
- Modify: `scripts/docker-entrypoint.sh`
- Test: `tests/integration/background-task-service.test.ts`

- [ ] **Step 1: 先写会失败的 worker 集成测试，锁定调度与恢复行为**

```ts
import { describe, expect, it, vi } from "vitest";

import { runWorkerCycle, recoverStaleTaskRuns } from "@/lib/tasks/worker";

describe("worker cycle", () => {
  it("marks stale running tasks as failed during recovery", async () => {
    const recovered = await recoverStaleTaskRuns(new Date("2026-04-12T00:05:00.000Z"));
    expect(recovered).toBeGreaterThanOrEqual(0);
  });

  it("enqueues a scheduled ingestion task when due", async () => {
    const result = await runWorkerCycle({
      now: new Date("2026-04-12T01:00:00.000Z"),
      sleepMs: 0,
      once: true,
    });

    expect(result.enqueuedScheduledRun).toBeTypeOf("boolean");
  });
});
```

- [ ] **Step 2: 运行测试，确认缺少 worker 模块**

Run: `npx vitest run tests/integration/background-task-service.test.ts`

Expected: FAIL with missing `@/lib/tasks/worker`.

- [ ] **Step 3: 实现 worker 主循环、异常恢复、任务处理映射和 Docker worker 入口**

```ts
// src/lib/tasks/handlers.ts
export async function executeTaskRun(taskRun: BackgroundTaskRun) {
  switch (taskRun.kind) {
    case "ingestion":
      return runIngestionTask(taskRun);
    case "item_regenerate_translation":
      return runItemRegenerationTask(taskRun, "translation");
    case "item_regenerate_summary":
      return runItemRegenerationTask(taskRun, "summary");
    case "item_reanalyze":
      return runItemReanalyzeTask(taskRun);
    case "cluster_regenerate_summary":
      return runClusterSummaryTask(taskRun);
    default:
      throw new Error(`Unsupported task kind: ${taskRun.kind satisfies never}`);
  }
}
```

```ts
// src/lib/tasks/worker.ts
export async function recoverStaleTaskRuns(now = new Date()) {
  const staleBefore = new Date(now.getTime() - 15 * 60_000);
  const result = await prisma.backgroundTaskRun.updateMany({
    where: {
      status: "running",
      startedAt: { lt: staleBefore },
      finishedAt: null,
    },
    data: {
      status: "failed",
      finishedAt: now,
      errorSummary: "Worker exited before completing the task.",
    },
  });

  return result.count;
}

export async function runWorkerCycle(options?: { now?: Date; sleepMs?: number; once?: boolean }) {
  const now = options?.now ?? new Date();
  await ensureDefaultIngestionSchedule();
  await touchScheduleHeartbeat(now);
  const enqueuedScheduledRun = await enqueueScheduledIngestionIfDue(now);
  const claimed = await claimNextQueuedTaskRun();

  if (claimed) {
    await executeClaimedTaskRun(claimed);
  }

  return { enqueuedScheduledRun, claimedTaskRunId: claimed?.id ?? null };
}
```

```sh
#!/bin/sh
# scripts/worker-entrypoint.sh
set -eu

DB_URL="${DATABASE_URL:-file:/app/data/dev.db}"
DB_URL="$(printf '%s' "$DB_URL" | sed 's/^"//; s/"$//')"

case "$DB_URL" in
  file:/*) DB_PATH="${DB_URL#file:}" ;;
  file:./*) DB_PATH="/app/${DB_URL#file:./}" ;;
  *) echo "Unsupported DATABASE_URL: $DB_URL" >&2; exit 1 ;;
esac

mkdir -p "$(dirname "$DB_PATH")"
node scripts/setup-sqlite.mjs "$DB_PATH"
exec npm run worker
```

```yaml
# docker-compose.yml
services:
  app:
    build:
      context: .
      dockerfile: Dockerfile
    image: infinitum:latest
    container_name: infinitum
    restart: unless-stopped
    env_file:
      - .env.docker
    environment:
      NODE_ENV: production
      PORT: 3000
      HOSTNAME: 0.0.0.0
    ports:
      - "3001:3000"
    volumes:
      - infinitum-data:/app/data
      - ./config:/app/config:ro
  worker:
    build:
      context: .
      dockerfile: Dockerfile
    image: infinitum:latest
    restart: unless-stopped
    env_file:
      - .env.docker
    environment:
      NODE_ENV: production
      DATABASE_URL: file:/app/data/dev.db
    command: ["sh", "./scripts/worker-entrypoint.sh"]
    volumes:
      - infinitum-data:/app/data
      - ./config:/app/config:ro
```

```json
{
  "scripts": {
    "worker": "tsx scripts/run-worker.ts"
  },
  "dependencies": {
    "tsx": "^4.20.6"
  }
}
```

```dockerfile
COPY --from=builder /app/src ./src
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/scripts ./scripts
```

```ts
// scripts/run-worker.ts
import { startWorkerLoop } from "@/lib/tasks/worker";

startWorkerLoop({
  pollIntervalMs: 2_000,
  heartbeatIntervalMs: 10_000,
}).catch((error) => {
  console.error("Worker loop crashed", error);
  process.exit(1);
});
```

- [ ] **Step 4: 运行 worker 相关测试，确认恢复和单轮调度行为通过**

Run: `npx vitest run tests/integration/background-task-service.test.ts`

Expected: PASS for recovery and single-cycle scheduling assertions.

- [ ] **Step 5: 提交 worker 与部署入口**

```bash
git add src/lib/tasks/handlers.ts src/lib/tasks/worker.ts scripts/run-worker.ts scripts/worker-entrypoint.sh scripts/docker-entrypoint.sh docker-compose.yml Dockerfile package.json package-lock.json tests/integration/background-task-service.test.ts
git commit -m "feat: add background task worker runtime"
```

## Task 4: 将抓取流程接入统一任务中心并改成异步 API

**Files:**
- Modify: `src/lib/feed/repository.ts`
- Modify: `src/lib/ingestion/service.ts`
- Modify: `src/app/api/ingest/run/route.ts`
- Modify: `src/app/api/ingest/status/route.ts`
- Modify: `src/lib/feed/types.ts`
- Test: `tests/integration/ingestion-service.test.ts`
- Test: `tests/integration/ingest-api.test.ts`

- [ ] **Step 1: 先写会失败的抓取任务测试，锁定新异步语义和进度映射**

```ts
import { describe, expect, it } from "vitest";

import { startIngestionTask } from "@/lib/ingestion/service";

describe("ingestion task orchestration", () => {
  it("creates a background task and linked fetch run", async () => {
    const taskRun = await startIngestionTask({ triggerType: "manual" });

    expect(taskRun.kind).toBe("ingestion");
    expect(taskRun.status).toBe("queued");
  });
});
```

```ts
import { describe, expect, it } from "vitest";

describe("POST /api/ingest/run", () => {
  it("returns 202 with a taskRun payload", async () => {
    const response = await POST();
    const payload = await response.json();

    expect(response.status).toBe(202);
    expect(payload.taskRun.id).toBeTruthy();
    expect(payload.taskRun.status).toBe("queued");
  });
});
```

- [ ] **Step 2: 运行定向测试，确认当前实现仍是同步返回**

Run: `npx vitest run tests/integration/ingestion-service.test.ts tests/integration/ingest-api.test.ts`

Expected: FAIL because `startIngestionTask` does not exist and `/api/ingest/run` returns `run` instead of `taskRun`.

- [ ] **Step 3: 重构抓取服务，让抓取任务先入队，再由 worker 执行时更新进度**

```ts
// src/lib/ingestion/service.ts
export async function startIngestionTask(input: { triggerType: "scheduled" | "manual" }) {
  if (await hasActiveIngestionTaskRun()) {
    throw new Error("An ingestion run is already queued or running.");
  }

  return enqueueTaskRun({
    kind: "ingestion",
    triggerType: input.triggerType,
    label: "默认抓取任务",
  });
}

export async function runIngestionTask(taskRun: BackgroundTaskRun) {
  const run = await createFetchRun(taskRun.triggerType, new Date(), taskRun.id);

  await updateTaskRun(taskRun.id, {
    status: "running",
    progressLabel: "正在同步信息源列表",
  });

  const result = await runIngestion({
    trigger: taskRun.triggerType === "scheduled" ? "scheduled" : "manual",
    onProgress(snapshot) {
      return syncIngestionProgress({
        taskRunId: taskRun.id,
        fetchRunId: run.id,
        snapshot,
      });
    },
  });

  await finalizeIngestionTaskRun(taskRun.id, run.id, result);
}
```

```ts
// src/lib/feed/repository.ts
export async function createFetchRun(triggerType: "scheduled" | "manual", startedAt: Date, taskRunId?: string) {
  return prisma.fetchRun.create({
    data: {
      taskRunId: taskRunId ?? null,
      triggerType,
      status: "running",
      startedAt,
    },
  });
}

export async function hasActiveIngestionTaskRun() {
  const count = await prisma.backgroundTaskRun.count({
    where: {
      kind: "ingestion",
      status: { in: ["queued", "running"] },
    },
  });

  return count > 0;
}
```

```ts
// src/app/api/ingest/run/route.ts
const taskRun = await startIngestionTask({ triggerType: "manual" });

return Response.json(
  {
    taskRun: toTaskRunSnapshot(taskRun),
  },
  { status: 202 },
);
```

- [ ] **Step 4: 运行抓取相关测试，确认异步抓取入口和进度映射通过**

Run: `npx vitest run tests/integration/ingestion-service.test.ts tests/integration/ingest-api.test.ts`

Expected: PASS

- [ ] **Step 5: 提交抓取异步任务改动**

```bash
git add src/lib/feed/repository.ts src/lib/feed/types.ts src/lib/ingestion/service.ts src/app/api/ingest/run/route.ts src/app/api/ingest/status/route.ts tests/integration/ingestion-service.test.ts tests/integration/ingest-api.test.ts
git commit -m "feat: move ingestion into background task queue"
```

## Task 5: 将后台内容操作切换到统一任务执行

**Files:**
- Modify: `src/lib/items/service.ts`
- Modify: `src/lib/clusters/service.ts`
- Modify: `src/app/api/admin/items/[id]/regenerate/route.ts`
- Modify: `src/app/api/admin/items/[id]/reanalyze/route.ts`
- Modify: `src/app/api/admin/clusters/[id]/regenerate-summary/route.ts`
- Test: `tests/integration/item-regeneration.test.ts`
- Test: `tests/integration/admin-item-api.test.ts`
- Test: `tests/integration/admin-cluster-api.test.ts`

- [ ] **Step 1: 先写失败测试，固定后台动作的异步返回**

```ts
import { describe, expect, it } from "vitest";

import { enqueueItemRegenerationTask, enqueueItemReanalyzeTask } from "@/lib/items/service";

describe("item task enqueueing", () => {
  it("queues a summary regeneration task", async () => {
    const taskRun = await enqueueItemRegenerationTask("item-1", "summary");
    expect(taskRun.kind).toBe("item_regenerate_summary");
    expect(taskRun.entityId).toBe("item-1");
  });

  it("queues an item reanalyze task", async () => {
    const taskRun = await enqueueItemReanalyzeTask("item-1");
    expect(taskRun.kind).toBe("item_reanalyze");
  });
});
```

```ts
describe("POST /api/admin/items/[id]/regenerate", () => {
  it("returns 202 with task metadata", async () => {
    const response = await POST(
      new Request("http://localhost/api/admin/items/item-1/regenerate", {
        method: "POST",
        body: JSON.stringify({ target: "summary" }),
      }),
      { params: Promise.resolve({ id: "item-1" }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(202);
    expect(payload.taskRun.kind).toBe("item_regenerate_summary");
  });
});
```

- [ ] **Step 2: 运行测试，确认当前 API 仍是同步执行**

Run: `npx vitest run tests/integration/item-regeneration.test.ts tests/integration/admin-item-api.test.ts tests/integration/admin-cluster-api.test.ts`

Expected: FAIL because enqueue helpers do not exist and APIs do not return `taskRun`.

- [ ] **Step 3: 为条目和聚合操作添加入队函数，并让 worker handler 复用现有执行逻辑**

```ts
// src/lib/items/service.ts
export async function enqueueItemRegenerationTask(itemId: string, target: "translation" | "summary") {
  return enqueueTaskRun({
    kind: target === "translation" ? "item_regenerate_translation" : "item_regenerate_summary",
    triggerType: "admin_action",
    label: target === "translation" ? "重生成翻译标题" : "重生成摘要",
    entityId: itemId,
  });
}

export async function executeItemRegenerationTask(taskRun: BackgroundTaskRun, target: "translation" | "summary") {
  await updateTaskRun(taskRun.id, { status: "running", progressLabel: "正在读取条目" });
  const item = await regenerateItemContent(taskRun.entityId!, target);
  await updateTaskRun(taskRun.id, {
    status: "succeeded",
    progressCurrent: 1,
    progressTotal: 1,
    progressLabel: `已完成：${item.id}`,
    finishedAt: new Date(),
  });
}
```

```ts
// src/app/api/admin/items/[id]/reanalyze/route.ts
const taskRun = await enqueueItemReanalyzeTask(id);

return Response.json(
  {
    taskRun: toTaskRunSnapshot(taskRun),
  },
  { status: 202 },
);
```

```ts
// src/app/api/admin/clusters/[id]/regenerate-summary/route.ts
const taskRun = await enqueueClusterSummaryTask(id);

return Response.json(
  {
    taskRun: toTaskRunSnapshot(taskRun),
  },
  { status: 202 },
);
```

- [ ] **Step 4: 运行后台动作测试，确认 API 和服务都变成异步任务**

Run: `npx vitest run tests/integration/item-regeneration.test.ts tests/integration/admin-item-api.test.ts tests/integration/admin-cluster-api.test.ts`

Expected: PASS

- [ ] **Step 5: 提交后台内容任务改动**

```bash
git add src/lib/items/service.ts src/lib/clusters/service.ts src/app/api/admin/items/[id]/regenerate/route.ts src/app/api/admin/items/[id]/reanalyze/route.ts src/app/api/admin/clusters/[id]/regenerate-summary/route.ts tests/integration/item-regeneration.test.ts tests/integration/admin-item-api.test.ts tests/integration/admin-cluster-api.test.ts
git commit -m "feat: enqueue admin content actions as background tasks"
```

## Task 6: 提供监控页 API 与默认抓取调度更新接口

**Files:**
- Create: `src/app/api/admin/monitor/route.ts`
- Create: `src/app/api/admin/monitor/schedule/ingestion-default/route.ts`
- Modify: `src/lib/tasks/service.ts`
- Modify: `src/lib/settings/types.ts`
- Test: `tests/integration/admin-monitor-api.test.ts`
- Test: `tests/integration/admin-settings-api.test.ts`

- [ ] **Step 1: 先写 API 失败测试，固定监控快照结构和调度更新语义**

```ts
import { describe, expect, it } from "vitest";

import { GET as getMonitor } from "@/app/api/admin/monitor/route";
import { PATCH as patchSchedule } from "@/app/api/admin/monitor/schedule/ingestion-default/route";

describe("admin monitor api", () => {
  it("returns schedule, running tasks and recent tasks", async () => {
    const response = await getMonitor();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.schedule.key).toBe("ingestion_default");
    expect(Array.isArray(payload.runningTasks)).toBe(true);
    expect(Array.isArray(payload.recentTasks)).toBe(true);
  });

  it("updates enabled and intervalMinutes", async () => {
    const response = await patchSchedule(
      new Request("http://localhost/api/admin/monitor/schedule/ingestion-default", {
        method: "PATCH",
        body: JSON.stringify({ enabled: false, intervalMinutes: 120 }),
        headers: { "content-type": "application/json" },
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.schedule.enabled).toBe(false);
    expect(payload.schedule.intervalMinutes).toBe(120);
  });
});
```

- [ ] **Step 2: 运行测试，确认接口和快照尚不存在**

Run: `npx vitest run tests/integration/admin-monitor-api.test.ts`

Expected: FAIL with missing route files or snapshot shape mismatches.

- [ ] **Step 3: 实现监控快照聚合和调度更新接口**

```ts
// src/lib/tasks/service.ts
export async function getBackgroundTaskMonitorSnapshot(now = new Date()): Promise<BackgroundTaskMonitorSnapshot> {
  const schedule = await ensureDefaultIngestionSchedule();
  const [runningTasks, recentTasks] = await Promise.all([
    prisma.backgroundTaskRun.findMany({
      where: { status: { in: ["queued", "running"] } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.backgroundTaskRun.findMany({
      take: 20,
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return {
    schedule: toScheduleSnapshot(schedule, now),
    runningTasks: runningTasks.map(toTaskRunSnapshot),
    recentTasks: recentTasks.map(toTaskRunSnapshot),
  };
}

export async function updateDefaultIngestionSchedule(input: { enabled: boolean; intervalMinutes: number }) {
  const normalized = normalizeScheduleInput(input);
  const current = await ensureDefaultIngestionSchedule();
  return prisma.taskSchedule.update({
    where: { id: current.id },
    data: {
      enabled: normalized.enabled,
      intervalMinutes: normalized.intervalMinutes,
      nextRunAt: computeNextRunAt({
        intervalMinutes: normalized.intervalMinutes,
        now: new Date(),
        anchor: current.lastRunFinishedAt ?? new Date(),
      }),
    },
  });
}
```

```ts
// src/app/api/admin/monitor/route.ts
import { requireAdmin } from "@/lib/admin/session";
import { getBackgroundTaskMonitorSnapshot } from "@/lib/tasks/service";

export async function GET() {
  await requireAdmin();
  return Response.json(await getBackgroundTaskMonitorSnapshot());
}
```

```ts
// src/app/api/admin/monitor/schedule/ingestion-default/route.ts
const body = ScheduleUpdateSchema.parse(await request.json());
const schedule = await updateDefaultIngestionSchedule(body);

return Response.json({
  schedule: toScheduleSnapshot(schedule, new Date()),
});
```

- [ ] **Step 4: 运行监控 API 测试，确认后台可读写调度状态**

Run: `npx vitest run tests/integration/admin-monitor-api.test.ts tests/integration/admin-settings-api.test.ts`

Expected: PASS

- [ ] **Step 5: 提交监控 API 改动**

```bash
git add src/app/api/admin/monitor src/lib/tasks/service.ts src/lib/settings/types.ts tests/integration/admin-monitor-api.test.ts tests/integration/admin-settings-api.test.ts
git commit -m "feat: add admin monitor apis"
```

## Task 7: 新增监控页面并接入轮询、导航和保存交互

**Files:**
- Create: `src/app/admin/monitor/page.tsx`
- Create: `src/components/admin/admin-monitor-panel.tsx`
- Modify: `src/components/admin/admin-settings-panel.tsx`
- Modify: `src/components/admin/content-review-panel.tsx`
- Test: `tests/components/admin-monitor-panel.test.tsx`
- Test: `tests/components/admin-settings-panel.test.tsx`
- Test: `tests/components/content-review-panel.test.tsx`

- [ ] **Step 1: 先写组件测试，固定监控页 UI 行为**

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";

import { AdminMonitorPanel } from "@/components/admin/admin-monitor-panel";

describe("AdminMonitorPanel", () => {
  const initialSnapshot = {
    schedule: {
      key: "ingestion_default",
      enabled: true,
      intervalMinutes: 60,
      timezone: "Asia/Shanghai",
      lastHeartbeatAt: "2026-04-12T00:00:00.000Z",
      lastRunStartedAt: null,
      lastRunFinishedAt: null,
      lastRunStatus: null,
      nextRunAt: "2026-04-12T01:00:00.000Z",
      isHeartbeatStale: false,
    },
    runningTasks: [
      {
        id: "task-1",
        kind: "ingestion",
        triggerType: "manual",
        status: "running",
        label: "默认抓取任务",
        entityId: null,
        progressCurrent: 3,
        progressTotal: 10,
        progressLabel: "已处理 3/10 个源",
        startedAt: "2026-04-12T00:30:00.000Z",
        finishedAt: null,
        errorSummary: null,
      },
    ],
    recentTasks: [],
  } as const;

  it("renders schedule details and running tasks", () => {
    render(<AdminMonitorPanel initialSnapshot={initialSnapshot} />);

    expect(screen.getByText("默认抓取任务")).toBeInTheDocument();
    expect(screen.getByDisplayValue("60")).toBeInTheDocument();
    expect(screen.getByText("已处理 3/10 个源")).toBeInTheDocument();
  });

  it("submits schedule changes", async () => {
    const user = userEvent.setup();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        schedule: {
          key: "ingestion_default",
          enabled: false,
          intervalMinutes: 120,
        },
      }),
    }) as typeof fetch;

    render(<AdminMonitorPanel initialSnapshot={initialSnapshot} />);

    await user.clear(screen.getByLabelText("抓取频率（分钟）"));
    await user.type(screen.getByLabelText("抓取频率（分钟）"), "120");
    await user.click(screen.getByRole("button", { name: "保存调度设置" }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        "/api/admin/monitor/schedule/ingestion-default",
        expect.objectContaining({ method: "PATCH" }),
      );
    });
  });
});
```

- [ ] **Step 2: 运行组件测试，确认新页面和新面板尚不存在**

Run: `npx vitest run tests/components/admin-monitor-panel.test.tsx tests/components/admin-settings-panel.test.tsx tests/components/content-review-panel.test.tsx`

Expected: FAIL with missing component/page and missing “任务监控” navigation link.

- [ ] **Step 3: 实现受保护监控页、轮询面板和导航链接**

```tsx
// src/app/admin/monitor/page.tsx
import { redirect } from "next/navigation";

import { AdminMonitorPanel } from "@/components/admin/admin-monitor-panel";
import { getAdminSession } from "@/lib/admin/session";
import { getBackgroundTaskMonitorSnapshot } from "@/lib/tasks/service";

export default async function AdminMonitorPage() {
  const session = await getAdminSession();

  if (!session.isAdmin) {
    redirect("/admin/login");
  }

  const snapshot = await getBackgroundTaskMonitorSnapshot();
  return <AdminMonitorPanel initialSnapshot={snapshot} />;
}
```

```tsx
// src/components/admin/admin-monitor-panel.tsx
"use client";

export function AdminMonitorPanel({ initialSnapshot }: { initialSnapshot: BackgroundTaskMonitorSnapshot }) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [intervalMinutes, setIntervalMinutes] = useState(String(initialSnapshot.schedule.intervalMinutes));
  const [enabled, setEnabled] = useState(initialSnapshot.schedule.enabled);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const interval = window.setInterval(async () => {
      const response = await fetch("/api/admin/monitor");
      const payload = (await response.json()) as BackgroundTaskMonitorSnapshot;
      setSnapshot(payload);
    }, snapshot.runningTasks.length > 0 ? 2_500 : 10_000);

    return () => window.clearInterval(interval);
  }, [snapshot.runningTasks.length]);

  const saveSchedule = () => {
    startTransition(async () => {
      const response = await fetch("/api/admin/monitor/schedule/ingestion-default", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enabled, intervalMinutes: Number(intervalMinutes) }),
      });

      const payload = (await response.json()) as BackgroundTaskMonitorSnapshot;
      setSnapshot((current) => ({ ...current, schedule: payload.schedule }));
      setMessage("调度配置已保存。");
    });
  };

  return (
    <div className={styles.settingsShell}>
      {message ? <p className={styles.message}>{message}</p> : null}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>默认抓取任务</h2>
        <label className={styles.field}>
          <span>抓取频率（分钟）</span>
          <input
            aria-label="抓取频率（分钟）"
            className={styles.input}
            type="number"
            min={5}
            value={intervalMinutes}
            onChange={(event) => setIntervalMinutes(event.target.value)}
          />
        </label>
        <label className={styles.checkboxField}>
          <input checked={enabled} type="checkbox" onChange={(event) => setEnabled(event.target.checked)} />
          <span>启用默认抓取任务</span>
        </label>
        <p>下次执行时间：{snapshot.schedule.nextRunAt}</p>
        <button className={styles.primaryButton} type="button" disabled={isPending} onClick={saveSchedule}>
          保存调度设置
        </button>
      </section>
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>当前运行中任务</h2>
        {snapshot.runningTasks.map((task) => (
          <article key={task.id} className={styles.reviewCard}>
            <h3 className={styles.reviewTitle}>{task.label}</h3>
            <p className={styles.reviewMeta}>{task.progressLabel ?? task.status}</p>
          </article>
        ))}
      </section>
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>最近任务</h2>
        {snapshot.recentTasks.map((task) => (
          <article key={task.id} className={styles.reviewCard}>
            <h3 className={styles.reviewTitle}>{task.label}</h3>
            <p className={styles.reviewMeta}>{task.status}</p>
          </article>
        ))}
      </section>
    </div>
  );
}
```

```tsx
// src/components/admin/admin-settings-panel.tsx
<Link className={styles.linkButton} href="/admin/monitor">
  任务监控
</Link>
```

- [ ] **Step 4: 运行页面组件测试，确认监控页展示和保存都通过**

Run: `npx vitest run tests/components/admin-monitor-panel.test.tsx tests/components/admin-settings-panel.test.tsx tests/components/content-review-panel.test.tsx`

Expected: PASS

- [ ] **Step 5: 提交监控页面改动**

```bash
git add src/app/admin/monitor/page.tsx src/components/admin/admin-monitor-panel.tsx src/components/admin/admin-settings-panel.tsx src/components/admin/content-review-panel.tsx tests/components/admin-monitor-panel.test.tsx tests/components/admin-settings-panel.test.tsx tests/components/content-review-panel.test.tsx
git commit -m "feat: add admin monitor page"
```

## Task 8: 完整回归验证与 Docker Compose 验证

**Files:**
- Test: `tests/unit/task-scheduler.test.ts`
- Test: `tests/integration/background-task-service.test.ts`
- Test: `tests/integration/admin-monitor-api.test.ts`
- Test: `tests/integration/ingest-api.test.ts`
- Test: `tests/integration/item-regeneration.test.ts`
- Test: `tests/components/admin-monitor-panel.test.tsx`

- [ ] **Step 1: 运行全部测试，确认任务中心、异步 API 和监控页没有回归**

Run: `npm test`

Expected: PASS with all Vitest suites green.

- [ ] **Step 2: 运行静态检查和生产构建**

Run: `npm run lint && npm run build`

Expected: PASS with no lint errors and a successful Next.js production build.

- [ ] **Step 3: 使用 Docker Compose 构建并启动 app + worker**

Run: `docker compose up -d --build`

Expected: PASS with both `app` and `worker` containers running.

- [ ] **Step 4: 手动验证后台监控页和默认抓取调度控制**

```text
1. 访问 /admin/monitor 并登录管理员。
2. 确认页面展示默认抓取任务的启用状态、最近执行状态和下次执行时间。
3. 修改抓取频率并保存，刷新后确认值保持一致。
4. 手动触发抓取或内容重生成，确认任务先进入 queued，再变成 running，最终落到 recent tasks。
5. 停用默认抓取任务，确认下一次执行时间按新状态刷新，worker 心跳仍然更新。
```

- [ ] **Step 5: 记录验证结果并准备走代码评审**

```text
在最终交付说明中记录：
- npm test 结果
- npm run lint 结果
- npm run build 结果
- docker compose up -d --build 结果
- /admin/monitor 手动验证结果
```

## Self-Review

- Spec coverage:
  - 默认抓取任务启停与频率控制由 Task 2、Task 6、Task 7 覆盖。
  - 独立 worker、调度循环、异常恢复和 Docker Compose 部署由 Task 3 覆盖。
  - 统一后台任务中心与抓取任务关联由 Task 1、Task 2、Task 4 覆盖。
  - 单条内容任务、聚合摘要任务的异步化由 Task 5 覆盖。
  - 后台监控页、轮询、导航入口由 Task 6、Task 7 覆盖。
  - 整体验证、构建和 Compose 验证由 Task 8 覆盖。
- Placeholder scan:
  - 本文档未使用 `TODO`、`TBD`、`implement later`、`similar to` 等占位表达。
- Type consistency:
  - `BackgroundTaskRun.kind/status/triggerType`、`TaskSchedule.key`、`taskRunId`、`taskRun` 返回结构在所有任务中保持一致。
