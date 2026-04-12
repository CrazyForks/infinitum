import { prisma } from "@/lib/db";
import { computeNextRunAt } from "@/lib/tasks/scheduler";
import type { EnqueueTaskRunInput } from "@/lib/tasks/types";

const DEFAULT_SCHEDULE_KEY = "ingestion_default" as const;
const DEFAULT_TIMEZONE = "Asia/Shanghai" as const;
const DEFAULT_INTERVAL_MINUTES = 60;

export async function upsertDefaultIngestionSchedule() {
  const now = new Date();

  return prisma.taskSchedule.upsert({
    where: { key: DEFAULT_SCHEDULE_KEY },
    update: {},
    create: {
      key: DEFAULT_SCHEDULE_KEY,
      enabled: true,
      intervalMinutes: DEFAULT_INTERVAL_MINUTES,
      timezone: DEFAULT_TIMEZONE,
      nextRunAt: computeNextRunAt({
        intervalMinutes: DEFAULT_INTERVAL_MINUTES,
        now,
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
