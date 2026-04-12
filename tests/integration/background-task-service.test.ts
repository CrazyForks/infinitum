import { beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";

describe("background task persistence", () => {
  beforeEach(async () => {
    await prisma.item.deleteMany();
    await prisma.fetchRun.deleteMany();
    await prisma.source.deleteMany();
    await prisma.sourceGroup.deleteMany();
    await prisma.blacklistKeyword.deleteMany();
    await prisma.appConfig.deleteMany();
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
});
