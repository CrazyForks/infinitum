import {
  claimTaskRun,
  createTaskRun,
  findNextQueuedTaskRun,
  findRecentTaskRuns,
  upsertDefaultIngestionSchedule,
} from "@/lib/tasks/repository";
import type { EnqueueTaskRunInput } from "@/lib/tasks/types";
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
