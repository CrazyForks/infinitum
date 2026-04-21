import { prisma } from "@/lib/db";
import {
  computeNextRunAt,
  DEFAULT_SCHEDULE_CRON_EXPRESSION,
  DEFAULT_FULL_TEXT_FETCH_THRESHOLD,
  DEFAULT_SCHEDULE_TIMEZONE,
  DEFAULT_SOURCE_CONCURRENCY,
  DEFAULT_PER_SOURCE_ITEM_LIMIT,
} from "@/lib/tasks/scheduler";
import { DEFAULT_INGESTION_SCHEDULE_KEY, type EnqueueTaskRunInput } from "@/lib/tasks/types";

export async function upsertDefaultIngestionSchedule() {
  const now = new Date();

  return prisma.taskSchedule.upsert({
    where: { key: DEFAULT_INGESTION_SCHEDULE_KEY },
    update: {},
    create: {
      key: DEFAULT_INGESTION_SCHEDULE_KEY,
      enabled: true,
      cronExpression: DEFAULT_SCHEDULE_CRON_EXPRESSION,
      sourceConcurrency: DEFAULT_SOURCE_CONCURRENCY,
      fullTextFetchThreshold: DEFAULT_FULL_TEXT_FETCH_THRESHOLD,
      perSourceItemLimit: DEFAULT_PER_SOURCE_ITEM_LIMIT,
      timezone: DEFAULT_SCHEDULE_TIMEZONE,
      nextRunAt: computeNextRunAt({
        cronExpression: DEFAULT_SCHEDULE_CRON_EXPRESSION,
        now,
        timezone: DEFAULT_SCHEDULE_TIMEZONE,
      }),
    },
  });
}

export async function createTaskRun(input: EnqueueTaskRunInput) {
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

export async function findNextQueuedTaskRun() {
  return prisma.backgroundTaskRun.findFirst({
    where: { status: "queued" },
    orderBy: { createdAt: "asc" },
  });
}

export async function claimTaskRun(id: string) {
  const claimed = await prisma.backgroundTaskRun.updateMany({
    where: {
      id,
      status: "queued",
    },
    data: {
      status: "running",
      startedAt: new Date(),
    },
  });

  if (claimed.count !== 1) {
    return null;
  }

  return prisma.backgroundTaskRun.findUniqueOrThrow({
    where: { id },
  });
}

export async function findRecentTaskRuns(limit: number) {
  return prisma.backgroundTaskRun.findMany({
    take: limit,
    orderBy: { createdAt: "desc" },
  });
}
