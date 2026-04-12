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
    status?: "queued" | "running" | "succeeded" | "failed" | "partial";
    progressCurrent?: number;
    progressTotal?: number;
    progressLabel?: string | null;
    startedAt?: Date | null;
    finishedAt?: Date | null;
    errorSummary?: string | null;
  },
) {
  return prisma.backgroundTaskRun.update({
    where: { id },
    data,
  });
}

export function toTaskRunSnapshot(taskRun: {
  id: string;
  kind: EnqueueTaskRunInput["kind"];
  triggerType: EnqueueTaskRunInput["triggerType"];
  status: "queued" | "running" | "succeeded" | "failed" | "partial";
  label: string;
  entityId: string | null;
  progressCurrent: number;
  progressTotal: number;
  progressLabel: string | null;
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
    startedAt: taskRun.startedAt?.toISOString() ?? null,
    finishedAt: taskRun.finishedAt?.toISOString() ?? null,
    errorSummary: taskRun.errorSummary,
  };
}

export function toTaskScheduleSnapshot(schedule: {
  key: "ingestion_default";
  enabled: boolean;
  intervalMinutes: number;
  timezone: string;
  lastHeartbeatAt: Date | null;
  lastRunStartedAt: Date | null;
  lastRunFinishedAt: Date | null;
  lastRunStatus: "queued" | "running" | "succeeded" | "failed" | "partial" | null;
  nextRunAt: Date;
}, now = new Date()): TaskScheduleSnapshot {
  return {
    key: schedule.key,
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
