import {
  claimTaskRun,
  createTaskRun,
  findNextQueuedTaskRun,
  findRecentTaskRuns,
  upsertDefaultIngestionSchedule,
} from "@/lib/tasks/repository";
import { computeNextRunAt, isSchedulerHeartbeatStale, normalizeScheduleInput } from "@/lib/tasks/scheduler";
import type { BackgroundTaskMonitorSnapshot, EnqueueTaskRunInput, TaskRunSnapshot, TaskScheduleSnapshot } from "@/lib/tasks/types";
import { prisma } from "@/lib/db";

export const TASK_RUN_CANCELLED_MESSAGE = "管理员手动终止任务。";
export const TASK_RUN_CANCELLED_LABEL = "任务已终止";

export async function ensureDefaultIngestionSchedule() {
  return upsertDefaultIngestionSchedule();
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
    aiCallCountActual?: number;
    aiCallCountEstimated?: number;
    cancelRequestedAt?: Date | null;
    startedAt?: Date | null;
    finishedAt?: Date | null;
    errorSummary?: string | null;
  },
) {
  const now = new Date();
  const [taskRun] = await prisma.$transaction([
    prisma.backgroundTaskRun.update({
      where: { id },
      data,
    }),
    prisma.taskSchedule.updateMany({
      where: { key: "ingestion_default" },
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
  aiCallCountActual: number;
  aiCallCountEstimated: number;
  cancelRequestedAt: Date | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  errorSummary: string | null;
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
    aiCallCountActual: taskRun.aiCallCountActual,
    aiCallCountEstimated: taskRun.aiCallCountEstimated,
    cancelRequestedAt: taskRun.cancelRequestedAt?.toISOString() ?? null,
    startedAt: taskRun.startedAt?.toISOString() ?? null,
    finishedAt: taskRun.finishedAt?.toISOString() ?? null,
    errorSummary: taskRun.errorSummary,
  };
}

export function toTaskScheduleSnapshot(schedule: {
  key: string;
  enabled: boolean;
  intervalMinutes: number;
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
    intervalMinutes: schedule.intervalMinutes,
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

export async function updateDefaultIngestionSchedule(input: { enabled: boolean; intervalMinutes: number }) {
  const normalizedInput = normalizeScheduleInput(input);
  const currentSchedule = await ensureDefaultIngestionSchedule();
  const now = new Date();
  const nextRunAt = computeNextRunAt({
    intervalMinutes: normalizedInput.intervalMinutes,
    now,
    anchor: currentSchedule.lastRunFinishedAt ?? now,
  });

  return prisma.taskSchedule.update({
    where: { id: currentSchedule.id },
    data: {
      enabled: normalizedInput.enabled,
      intervalMinutes: normalizedInput.intervalMinutes,
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
    runningTasks: runningTasks.map(toTaskRunSnapshot),
    recentTasks: recentTasks.map(toTaskRunSnapshot),
  };
}
