import {
  claimTaskRun,
  createTaskRun,
  findNextQueuedTaskRun,
  findRecentTaskRuns,
  upsertDefaultDailyReportSchedule,
  upsertDefaultIngestionSchedule,
} from "@/lib/tasks/repository";
import {
  computeNextRunAt,
  DEFAULT_DAILY_REPORT_CANDIDATE_LIMIT,
  isSchedulerHeartbeatStale,
  MAX_DAILY_REPORT_CANDIDATE_LIMIT,
  MIN_DAILY_REPORT_CANDIDATE_LIMIT,
  normalizeScheduleInput,
} from "@/lib/tasks/scheduler";
import {
  DEFAULT_INGESTION_SCHEDULE_KEY,
  type TaskAiCallBreakdownKey,
  type TaskAiCallBreakdownSnapshot,
  type BackgroundTaskMonitorSnapshot,
  type EnqueueTaskRunInput,
  type TaskStageTimingSnapshot,
  type TaskTimelineMetricSnapshot,
  type TaskTimelineNodeKey,
  type TaskTimelineNodeSnapshot,
  type TaskTimelineNodeStatus,
  type TaskRunSnapshot,
  type TaskScheduleSnapshot,
} from "@/lib/tasks/types";
import { prisma } from "@/lib/db";

export const TASK_RUN_CANCELLED_MESSAGE = "管理员手动终止任务。";
export const TASK_RUN_CANCELLED_LABEL = "任务已终止";

const TASK_AI_CALL_BREAKDOWN_LABELS: Record<TaskAiCallBreakdownKey, string> = {
  item_summary: "条目摘要",
  item_analysis: "内容分析",
  cluster_match: "聚合匹配",
  cluster_summary: "聚合摘要",
  daily_report: "AI 日报",
};

function getDefaultTaskAiCallBreakdown(): TaskAiCallBreakdownSnapshot[] {
  return (Object.keys(TASK_AI_CALL_BREAKDOWN_LABELS) as TaskAiCallBreakdownKey[]).map((key) => ({
    key,
    label: TASK_AI_CALL_BREAKDOWN_LABELS[key],
    actual: 0,
    estimated: 0,
  }));
}

function normalizeTaskAiCallBreakdownSnapshot(value: unknown): TaskAiCallBreakdownSnapshot | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const maybeSnapshot = value as Record<string, unknown>;

  if (
    maybeSnapshot.key !== "item_summary" &&
    maybeSnapshot.key !== "item_analysis" &&
    maybeSnapshot.key !== "cluster_match" &&
    maybeSnapshot.key !== "cluster_summary" &&
    maybeSnapshot.key !== "daily_report"
  ) {
    return null;
  }

  return {
    key: maybeSnapshot.key,
    label:
      typeof maybeSnapshot.label === "string"
        ? maybeSnapshot.label
        : TASK_AI_CALL_BREAKDOWN_LABELS[maybeSnapshot.key],
    actual:
      typeof maybeSnapshot.actual === "number" && Number.isFinite(maybeSnapshot.actual)
        ? maybeSnapshot.actual
        : 0,
    estimated:
      typeof maybeSnapshot.estimated === "number" && Number.isFinite(maybeSnapshot.estimated)
        ? maybeSnapshot.estimated
        : 0,
  };
}

function parseTaskAiCallBreakdownJson(value: string | null | undefined): TaskAiCallBreakdownSnapshot[] {
  const defaultBreakdown = getDefaultTaskAiCallBreakdown();

  if (!value) {
    return defaultBreakdown;
  }

  try {
    const parsed = JSON.parse(value) as unknown;

    if (!Array.isArray(parsed)) {
      return defaultBreakdown;
    }

    const parsedEntries = parsed
      .map(normalizeTaskAiCallBreakdownSnapshot)
      .filter((snapshot): snapshot is TaskAiCallBreakdownSnapshot => snapshot !== null);
    const parsedMap = new Map(parsedEntries.map((entry) => [entry.key, entry]));

    return defaultBreakdown.map((entry) => parsedMap.get(entry.key) ?? entry);
  } catch {
    return defaultBreakdown;
  }
}

function serializeTaskAiCallBreakdown(value: TaskAiCallBreakdownSnapshot[] | null) {
  if (!value) {
    return null;
  }

  return JSON.stringify(value);
}

function normalizeTaskStageTimingSnapshot(value: unknown): TaskStageTimingSnapshot | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const maybeSnapshot = value as Record<string, unknown>;

  if (typeof maybeSnapshot.key !== "string" || typeof maybeSnapshot.label !== "string") {
    return null;
  }

  const startedAt =
    typeof maybeSnapshot.startedAt === "string" || maybeSnapshot.startedAt === null
      ? maybeSnapshot.startedAt
      : null;
  const finishedAt =
    typeof maybeSnapshot.finishedAt === "string" || maybeSnapshot.finishedAt === null
      ? maybeSnapshot.finishedAt
      : null;
  const durationMs =
    typeof maybeSnapshot.durationMs === "number" && Number.isFinite(maybeSnapshot.durationMs)
      ? maybeSnapshot.durationMs
      : null;

  return {
    key: maybeSnapshot.key,
    label: maybeSnapshot.label,
    startedAt,
    finishedAt,
    durationMs,
  };
}

function parseTaskStageTimingsJson(value: string | null | undefined): TaskStageTimingSnapshot[] {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map(normalizeTaskStageTimingSnapshot)
      .filter((snapshot): snapshot is TaskStageTimingSnapshot => snapshot !== null);
  } catch {
    return [];
  }
}

function serializeTaskStageTimings(stageTimings: TaskStageTimingSnapshot[] | null) {
  if (!stageTimings) {
    return null;
  }

  return JSON.stringify(stageTimings);
}

function normalizeTaskTimelineMetricSnapshot(value: unknown): TaskTimelineMetricSnapshot | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const maybeMetric = value as Record<string, unknown>;

  if (typeof maybeMetric.label !== "string") {
    return null;
  }

  return {
    label: maybeMetric.label,
    value:
      typeof maybeMetric.value === "number" && Number.isFinite(maybeMetric.value)
        ? maybeMetric.value
        : 0,
  };
}

function normalizeTaskTimelineNodeSnapshot(value: unknown): TaskTimelineNodeSnapshot | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const maybeNode = value as Record<string, unknown>;
  const key = maybeNode.key;
  const status = maybeNode.status;
  const supportedKeys = new Set<TaskTimelineNodeKey>([
    "source_fetch",
    "rule_filter",
    "item_summary",
    "item_analysis",
    "cluster_assignment",
    "cluster_finalize",
  ]);
  const supportedStatuses = new Set<TaskTimelineNodeStatus>([
    "pending",
    "running",
    "succeeded",
    "failed",
    "partial",
    "skipped",
  ]);

  if (
    typeof key !== "string" ||
    !supportedKeys.has(key as TaskTimelineNodeKey) ||
    typeof maybeNode.label !== "string" ||
    typeof status !== "string" ||
    !supportedStatuses.has(status as TaskTimelineNodeStatus)
  ) {
    return null;
  }

  const startedAt =
    typeof maybeNode.startedAt === "string" || maybeNode.startedAt === null
      ? maybeNode.startedAt
      : null;
  const finishedAt =
    typeof maybeNode.finishedAt === "string" || maybeNode.finishedAt === null
      ? maybeNode.finishedAt
      : null;
  const durationMs =
    typeof maybeNode.durationMs === "number" && Number.isFinite(maybeNode.durationMs)
      ? maybeNode.durationMs
      : null;
  const modelName =
    typeof maybeNode.modelName === "string" || maybeNode.modelName === null
      ? maybeNode.modelName
      : null;
  const metrics = Array.isArray(maybeNode.metrics)
    ? maybeNode.metrics
        .map(normalizeTaskTimelineMetricSnapshot)
        .filter((metric): metric is TaskTimelineMetricSnapshot => metric !== null)
    : [];

  return {
    key: key as TaskTimelineNodeKey,
    label: maybeNode.label,
    status: status as TaskTimelineNodeStatus,
    startedAt,
    finishedAt,
    durationMs,
    modelName,
    metrics,
  };
}

function parseTaskTimelineJson(value: string | null | undefined): TaskTimelineNodeSnapshot[] {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map(normalizeTaskTimelineNodeSnapshot)
      .filter((node): node is TaskTimelineNodeSnapshot => node !== null);
  } catch {
    return [];
  }
}

function serializeTaskTimeline(taskTimeline: TaskTimelineNodeSnapshot[] | null) {
  if (!taskTimeline) {
    return null;
  }

  return JSON.stringify(taskTimeline);
}

export async function ensureDefaultIngestionSchedule() {
  return upsertDefaultIngestionSchedule();
}

export async function ensureDefaultDailyReportSchedule() {
  return upsertDefaultDailyReportSchedule();
}

export async function enqueueTaskRun(input: EnqueueTaskRunInput) {
  return createTaskRun(input);
}

export async function claimNextQueuedTaskRun() {
  const nextQueuedTaskRun = await findNextQueuedTaskRun();

  if (!nextQueuedTaskRun) {
    return null;
  }

  return claimTaskRun(nextQueuedTaskRun.id);
}

export async function listRecentTaskRuns(input: { limit: number }) {
  return findRecentTaskRuns(input.limit);
}

export async function updateTaskRun(
  id: string,
  data: {
    status?: "queued" | "running" | "succeeded" | "failed" | "partial" | "cancelled";
    progressCurrent?: number;
    progressTotal?: number;
    progressLabel?: string | null;
    itemsAdded?: number;
    fullTextFetchedCount?: number;
    aiCallCountActual?: number;
    aiCallCountEstimated?: number;
    aiCallBreakdown?: TaskAiCallBreakdownSnapshot[] | null;
    cancelRequestedAt?: Date | null;
    startedAt?: Date | null;
    finishedAt?: Date | null;
    errorSummary?: string | null;
    stageTimings?: TaskStageTimingSnapshot[] | null;
    taskTimeline?: TaskTimelineNodeSnapshot[] | null;
  },
) {
  const now = new Date();
  const { stageTimings, aiCallBreakdown, taskTimeline, ...taskRunData } = data;
  const [taskRun] = await prisma.$transaction([
    prisma.backgroundTaskRun.update({
      where: { id },
      data: {
        ...taskRunData,
        aiCallBreakdownJson:
          aiCallBreakdown === undefined ? undefined : serializeTaskAiCallBreakdown(aiCallBreakdown),
        stageTimingsJson:
          stageTimings === undefined ? undefined : serializeTaskStageTimings(stageTimings),
        taskTimelineJson:
          taskTimeline === undefined ? undefined : serializeTaskTimeline(taskTimeline),
      },
    }),
    prisma.taskSchedule.updateMany({
      where: { key: DEFAULT_INGESTION_SCHEDULE_KEY },
      data: {
        lastHeartbeatAt: now,
      },
    }),
  ]);

  return taskRun;
}

export function toTaskRunSnapshot(taskRun: {
  id: string;
  kind: EnqueueTaskRunInput["kind"];
  triggerType: EnqueueTaskRunInput["triggerType"];
  status: "queued" | "running" | "succeeded" | "failed" | "partial" | "cancelled";
  label: string;
  entityId: string | null;
  progressCurrent: number;
  progressTotal: number;
  progressLabel: string | null;
  itemsAdded: number;
  fullTextFetchedCount: number;
  aiCallCountActual: number;
  aiCallCountEstimated: number;
  aiCallBreakdownJson: string | null;
  cancelRequestedAt: Date | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  errorSummary: string | null;
  stageTimingsJson: string | null;
  taskTimelineJson: string | null;
}): TaskRunSnapshot {
  return {
    id: taskRun.id,
    kind: taskRun.kind,
    triggerType: taskRun.triggerType,
    status: taskRun.status,
    label: taskRun.label,
    entityId: taskRun.entityId,
    progressCurrent: taskRun.progressCurrent,
    progressTotal: taskRun.progressTotal,
    progressLabel: taskRun.progressLabel,
    itemsAdded: taskRun.itemsAdded,
    fullTextFetchedCount: taskRun.fullTextFetchedCount,
    aiCallCountActual: taskRun.aiCallCountActual,
    aiCallCountEstimated: taskRun.aiCallCountEstimated,
    aiCallBreakdown: parseTaskAiCallBreakdownJson(taskRun.aiCallBreakdownJson),
    cancelRequestedAt: taskRun.cancelRequestedAt?.toISOString() ?? null,
    startedAt: taskRun.startedAt?.toISOString() ?? null,
    finishedAt: taskRun.finishedAt?.toISOString() ?? null,
    errorSummary: taskRun.errorSummary,
    stageTimings: parseTaskStageTimingsJson(taskRun.stageTimingsJson),
    taskTimeline: parseTaskTimelineJson(taskRun.taskTimelineJson),
  };
}

export function toTaskScheduleSnapshot(schedule: {
  key: string;
  enabled: boolean;
  cronExpression: string;
  sourceConcurrency: number;
  fullTextFetchThreshold: number;
  perSourceItemLimit: number | null;
  dailyReportCandidateLimit: number | null;
  dailyReportAutoPublish: boolean | null;
  processingStartAt: Date | null;
  timezone: string;
  lastHeartbeatAt: Date | null;
  lastRunStartedAt: Date | null;
  lastRunFinishedAt: Date | null;
  lastRunStatus: "queued" | "running" | "succeeded" | "failed" | "partial" | "cancelled" | null;
  nextRunAt: Date;
}, now = new Date()): TaskScheduleSnapshot {
  return {
    key: schedule.key as TaskScheduleSnapshot["key"],
    enabled: schedule.enabled,
    cronExpression: schedule.cronExpression,
    sourceConcurrency: schedule.sourceConcurrency,
    fullTextFetchThreshold: schedule.fullTextFetchThreshold,
    perSourceItemLimit: schedule.perSourceItemLimit ?? 20,
    dailyReportCandidateLimit: schedule.dailyReportCandidateLimit ?? DEFAULT_DAILY_REPORT_CANDIDATE_LIMIT,
    dailyReportAutoPublish: schedule.dailyReportAutoPublish ?? false,
    processingStartAt: schedule.processingStartAt?.toISOString() ?? null,
    timezone: schedule.timezone,
    lastHeartbeatAt: schedule.lastHeartbeatAt?.toISOString() ?? null,
    lastRunStartedAt: schedule.lastRunStartedAt?.toISOString() ?? null,
    lastRunFinishedAt: schedule.lastRunFinishedAt?.toISOString() ?? null,
    lastRunStatus: schedule.lastRunStatus,
    nextRunAt: schedule.nextRunAt.toISOString(),
    isHeartbeatStale: isSchedulerHeartbeatStale({
      lastHeartbeatAt: schedule.lastHeartbeatAt,
      now,
      maxAgeMs: 30_000,
    }),
  };
}

export async function updateDefaultIngestionSchedule(input: {
  enabled: boolean;
  cronExpression: string;
  sourceConcurrency: number;
  fullTextFetchThreshold: number;
  perSourceItemLimit: number;
  processingStartAt?: string | null;
}) {
  const normalizedInput = normalizeScheduleInput(input);
  const currentSchedule = await ensureDefaultIngestionSchedule();
  const now = new Date();
  const nextRunAt = computeNextRunAt({
    cronExpression: normalizedInput.cronExpression,
    now,
    anchor: currentSchedule.lastRunFinishedAt ?? now,
    timezone: currentSchedule.timezone,
  });

  return prisma.taskSchedule.update({
    where: { id: currentSchedule.id },
    data: {
      enabled: normalizedInput.enabled,
      cronExpression: normalizedInput.cronExpression,
      sourceConcurrency: normalizedInput.sourceConcurrency,
      fullTextFetchThreshold: normalizedInput.fullTextFetchThreshold,
      perSourceItemLimit: normalizedInput.perSourceItemLimit,
      processingStartAt: normalizedInput.processingStartAt ? new Date(normalizedInput.processingStartAt) : null,
      nextRunAt,
    },
  });
}

export async function updateDefaultDailyReportSchedule(input: {
  enabled: boolean;
  cronExpression: string;
  dailyReportCandidateLimit: number;
  dailyReportAutoPublish: boolean;
}) {
  const cronExpression = input.cronExpression.trim();

  if (!cronExpression) {
    throw new Error("Cron expression is required.");
  }

  computeNextRunAt({
    cronExpression,
    now: new Date(),
    timezone: "Asia/Shanghai",
  });

  if (
    !Number.isInteger(input.dailyReportCandidateLimit) ||
    input.dailyReportCandidateLimit < MIN_DAILY_REPORT_CANDIDATE_LIMIT ||
    input.dailyReportCandidateLimit > MAX_DAILY_REPORT_CANDIDATE_LIMIT
  ) {
    throw new Error(
      `Daily report candidate limit must be an integer between ${MIN_DAILY_REPORT_CANDIDATE_LIMIT} and ${MAX_DAILY_REPORT_CANDIDATE_LIMIT}.`,
    );
  }

  const currentSchedule = await ensureDefaultDailyReportSchedule();
  const now = new Date();
  const nextRunAt = computeNextRunAt({
    cronExpression,
    now,
    anchor: currentSchedule.lastRunFinishedAt ?? now,
    timezone: currentSchedule.timezone,
  });

  return prisma.taskSchedule.update({
    where: { id: currentSchedule.id },
    data: {
      enabled: input.enabled,
      cronExpression,
      dailyReportCandidateLimit: input.dailyReportCandidateLimit,
      dailyReportAutoPublish: input.dailyReportAutoPublish,
      nextRunAt,
    },
  });
}

export async function getTaskRun(id: string) {
  return prisma.backgroundTaskRun.findUnique({
    where: { id },
  });
}

export async function isTaskRunCancellationRequested(id: string) {
  const taskRun = await getTaskRun(id);

  return Boolean(taskRun?.cancelRequestedAt);
}

export async function requestTaskRunCancellation(id: string) {
  const taskRun = await prisma.backgroundTaskRun.findUnique({
    where: { id },
  });

  if (!taskRun) {
    throw new Error("Task run not found.");
  }

  if (taskRun.status === "cancelled") {
    return taskRun;
  }

  const now = new Date();

  if (taskRun.status === "queued") {
    return prisma.backgroundTaskRun.update({
      where: { id },
      data: {
        status: "cancelled",
        cancelRequestedAt: taskRun.cancelRequestedAt ?? now,
        progressLabel: TASK_RUN_CANCELLED_LABEL,
        finishedAt: now,
        errorSummary: TASK_RUN_CANCELLED_MESSAGE,
      },
    });
  }

  if (taskRun.status !== "running") {
    throw new Error("Task is no longer active.");
  }

  return prisma.backgroundTaskRun.update({
    where: { id },
    data: {
      cancelRequestedAt: taskRun.cancelRequestedAt ?? now,
      errorSummary: taskRun.errorSummary ?? TASK_RUN_CANCELLED_MESSAGE,
    },
  });
}

export async function getBackgroundTaskMonitorSnapshot(now = new Date()): Promise<BackgroundTaskMonitorSnapshot> {
  const schedule = await ensureDefaultIngestionSchedule();
  await ensureDefaultDailyReportSchedule();
  const [runningTasks, recentTasks] = await Promise.all([
    prisma.backgroundTaskRun.findMany({
      where: {
        status: {
          in: ["queued", "running"],
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.backgroundTaskRun.findMany({
      take: 20,
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return {
    schedule: toTaskScheduleSnapshot(schedule, now),
    runningTasks: await attachTaskEntityTitles(runningTasks.map(toTaskRunSnapshot)),
    recentTasks: await attachTaskEntityTitles(recentTasks.map(toTaskRunSnapshot)),
  };
}

async function attachTaskEntityTitles(tasks: TaskRunSnapshot[]): Promise<TaskRunSnapshot[]> {
  const itemIds = Array.from(
    new Set(
      tasks
        .filter((task) => task.entityId && task.kind.startsWith("item_"))
        .map((task) => task.entityId as string),
    ),
  );
  const clusterIds = Array.from(
    new Set(
      tasks
        .filter((task) => task.entityId && task.kind.startsWith("cluster_"))
        .map((task) => task.entityId as string),
    ),
  );

  if (itemIds.length === 0 && clusterIds.length === 0) {
    return tasks;
  }

  const [items, clusters] = await Promise.all([
    itemIds.length > 0
      ? prisma.item.findMany({
          where: { id: { in: itemIds } },
          select: { id: true, translatedTitle: true, originalTitle: true },
        })
      : [],
    clusterIds.length > 0
      ? prisma.contentCluster.findMany({
          where: { id: { in: clusterIds } },
          select: { id: true, title: true },
        })
      : [],
  ]);
  const itemTitles = new Map(items.map((item) => [item.id, item.translatedTitle?.trim() || item.originalTitle]));
  const clusterTitles = new Map(clusters.map((cluster) => [cluster.id, cluster.title]));

  return tasks.map((task) => {
    if (!task.entityId) {
      return task;
    }

    const entityTitle = task.kind.startsWith("item_")
      ? itemTitles.get(task.entityId)
      : task.kind.startsWith("cluster_")
        ? clusterTitles.get(task.entityId)
        : null;

    return entityTitle ? { ...task, entityTitle } : task;
  });
}
