import type { BackgroundTaskRun } from "@prisma/client";

import { prisma } from "@/lib/db";
import { executeTaskRun as defaultExecuteTaskRun } from "@/lib/tasks/handlers";
import { computeNextRunAt } from "@/lib/tasks/scheduler";
import { claimNextQueuedTaskRun, ensureDefaultIngestionSchedule, enqueueTaskRun } from "@/lib/tasks/service";

const DEFAULT_TASK_STALE_MS = 15 * 60_000;
const DEFAULT_POLL_INTERVAL_MS = 2_000;

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function touchScheduleHeartbeat(now: Date) {
  const schedule = await ensureDefaultIngestionSchedule();

  return prisma.taskSchedule.update({
    where: { id: schedule.id },
    data: {
      lastHeartbeatAt: now,
    },
  });
}

async function enqueueScheduledIngestionIfDue(now: Date) {
  const schedule = await ensureDefaultIngestionSchedule();

  if (!schedule.enabled || schedule.nextRunAt.getTime() > now.getTime()) {
    return false;
  }

  const activeIngestionCount = await prisma.backgroundTaskRun.count({
    where: {
      kind: "ingestion",
      status: {
        in: ["queued", "running"],
      },
    },
  });

  if (activeIngestionCount > 0) {
    return false;
  }

  await enqueueTaskRun({
    kind: "ingestion",
    triggerType: "scheduled",
    label: "默认抓取任务",
  });

  await prisma.taskSchedule.update({
    where: { id: schedule.id },
    data: {
      nextRunAt: computeNextRunAt({
        intervalMinutes: schedule.intervalMinutes,
        now,
        anchor: schedule.nextRunAt,
      }),
    },
  });

  return true;
}

export async function recoverStaleTaskRuns(now = new Date()) {
  const staleBefore = new Date(now.getTime() - DEFAULT_TASK_STALE_MS);
  const result = await prisma.backgroundTaskRun.updateMany({
    where: {
      status: "running",
      startedAt: {
        lt: staleBefore,
      },
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

export async function runWorkerCycle(options?: {
  now?: Date;
  executeTaskRun?: (taskRun: BackgroundTaskRun) => Promise<void>;
}) {
  const now = options?.now ?? new Date();

  await ensureDefaultIngestionSchedule();
  await touchScheduleHeartbeat(now);
  const enqueuedScheduledRun = await enqueueScheduledIngestionIfDue(now);
  const claimedTaskRun = await claimNextQueuedTaskRun();

  if (claimedTaskRun) {
    await (options?.executeTaskRun ?? defaultExecuteTaskRun)(claimedTaskRun);
  }

  return {
    enqueuedScheduledRun,
    claimedTaskRunId: claimedTaskRun?.id ?? null,
  };
}

export async function startWorkerLoop(options?: {
  pollIntervalMs?: number;
  executeTaskRun?: (taskRun: BackgroundTaskRun) => Promise<void>;
}) {
  await recoverStaleTaskRuns();

  while (true) {
    await runWorkerCycle({
      executeTaskRun: options?.executeTaskRun,
    });
    await sleep(options?.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS);
  }
}
