import {
  claimTaskRun,
  createTaskRun,
  findNextQueuedTaskRun,
  findRecentTaskRuns,
  upsertDefaultIngestionSchedule,
} from "@/lib/tasks/repository";
import type { EnqueueTaskRunInput } from "@/lib/tasks/types";

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
