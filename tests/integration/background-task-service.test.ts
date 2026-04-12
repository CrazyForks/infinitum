import { beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import {
  claimNextQueuedTaskRun,
  ensureDefaultIngestionSchedule,
  enqueueTaskRun,
  listRecentTaskRuns,
} from "@/lib/tasks/service";

describe("background task persistence", () => {
  beforeEach(async () => {
    await prisma.item.deleteMany();
    await prisma.fetchRun.deleteMany();
    await prisma.backgroundTaskRun.deleteMany();
    await prisma.source.deleteMany();
    await prisma.sourceGroup.deleteMany();
    await prisma.blacklistKeyword.deleteMany();
    await prisma.appConfig.deleteMany();
    await prisma.taskSchedule.deleteMany();
  });

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

  it("seeds the default ingestion schedule", async () => {
    const schedule = await ensureDefaultIngestionSchedule();

    expect(schedule.key).toBe("ingestion_default");
    expect(schedule.intervalMinutes).toBe(60);
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
    await enqueueTaskRun({
      kind: "ingestion",
      triggerType: "manual",
      label: "默认抓取任务",
    });
    await enqueueTaskRun({
      kind: "item_reanalyze",
      triggerType: "admin_action",
      label: "重新 AI 判定",
      entityId: "item-1",
    });

    const tasks = await listRecentTaskRuns({ limit: 20 });

    expect(tasks).toHaveLength(2);
    expect(tasks[0]?.createdAt.getTime()).toBeGreaterThanOrEqual(tasks[1]?.createdAt.getTime() ?? 0);
  });
});
