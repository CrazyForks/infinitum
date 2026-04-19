import { beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import {
  claimNextQueuedTaskRun,
  getBackgroundTaskMonitorSnapshot,
  ensureDefaultIngestionSchedule,
  enqueueTaskRun,
  listRecentTaskRuns,
  requestTaskRunCancellation,
  updateTaskRun,
  updateDefaultIngestionSchedule,
} from "@/lib/tasks/service";
import { recoverStaleTaskRuns, runWorkerCycle } from "@/lib/tasks/worker";

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

  it("marks stale running tasks as failed during recovery", async () => {
    const taskRun = await prisma.backgroundTaskRun.create({
      data: {
        kind: "ingestion",
        triggerType: "manual",
        status: "running",
        label: "默认抓取任务",
        startedAt: new Date("2026-04-12T00:00:00.000Z"),
      },
    });
    const fetchRun = await prisma.fetchRun.create({
      data: {
        taskRunId: taskRun.id,
        triggerType: "manual",
        status: "running",
        startedAt: new Date("2026-04-12T00:00:00.000Z"),
      },
    });

    const recovered = await recoverStaleTaskRuns(new Date("2026-04-12T00:20:00.000Z"));
    const updatedTaskRun = await prisma.backgroundTaskRun.findUniqueOrThrow({
      where: { id: taskRun.id },
    });
    const updatedFetchRun = await prisma.fetchRun.findUniqueOrThrow({
      where: { id: fetchRun.id },
    });

    expect(recovered).toBe(1);
    expect(updatedTaskRun.status).toBe("failed");
    expect(updatedTaskRun.errorSummary).toContain("Worker exited");
    expect(updatedFetchRun.status).toBe("failed");
    expect(updatedFetchRun.errorSummary).toContain("Worker exited");
    expect(updatedFetchRun.finishedAt).not.toBeNull();
  });

  it("reconciles running fetch runs whose linked task is already terminal", async () => {
    const taskRun = await prisma.backgroundTaskRun.create({
      data: {
        kind: "ingestion",
        triggerType: "manual",
        status: "failed",
        label: "默认抓取任务",
        startedAt: new Date("2026-04-12T00:00:00.000Z"),
        finishedAt: new Date("2026-04-12T00:05:00.000Z"),
        errorSummary: "Worker exited before completing the task.",
      },
    });
    const fetchRun = await prisma.fetchRun.create({
      data: {
        taskRunId: taskRun.id,
        triggerType: "manual",
        status: "running",
        startedAt: new Date("2026-04-12T00:00:00.000Z"),
      },
    });

    const recovered = await recoverStaleTaskRuns(new Date("2026-04-12T00:20:00.000Z"));
    const updatedFetchRun = await prisma.fetchRun.findUniqueOrThrow({
      where: { id: fetchRun.id },
    });

    expect(recovered).toBe(0);
    expect(updatedFetchRun.status).toBe("failed");
    expect(updatedFetchRun.errorSummary).toContain("Worker exited");
    expect(updatedFetchRun.finishedAt).not.toBeNull();
  });

  it("enqueues a scheduled ingestion task when due", async () => {
    await prisma.taskSchedule.create({
      data: {
        key: "ingestion_default",
        enabled: true,
        intervalMinutes: 60,
        timezone: "Asia/Shanghai",
        nextRunAt: new Date("2026-04-12T01:00:00.000Z"),
      },
    });

    const result = await runWorkerCycle({
      now: new Date("2026-04-12T01:00:00.000Z"),
      executeTaskRun: async () => undefined,
    });
    const ingestionTasks = await prisma.backgroundTaskRun.findMany({
      where: { kind: "ingestion" },
      orderBy: { createdAt: "asc" },
    });

    expect(result.enqueuedScheduledRun).toBe(true);
    expect(ingestionTasks).toHaveLength(1);
    expect(ingestionTasks[0]?.triggerType).toBe("scheduled");
    expect(ingestionTasks[0]?.status).toBe("running");
  });

  it("updates the default ingestion schedule", async () => {
    await ensureDefaultIngestionSchedule();

    const updated = await updateDefaultIngestionSchedule({
      enabled: false,
      intervalMinutes: 120,
    });

    expect(updated.enabled).toBe(false);
    expect(updated.intervalMinutes).toBe(120);
  });

  it("builds a monitor snapshot with schedule and task lists", async () => {
    await ensureDefaultIngestionSchedule();
    const taskRun = await enqueueTaskRun({
      kind: "ingestion",
      triggerType: "manual",
      label: "默认抓取任务",
    });
    await updateTaskRun(taskRun.id, {
      status: "running",
      aiCallCountActual: 3,
      aiCallCountEstimated: 8,
    });

    const snapshot = await getBackgroundTaskMonitorSnapshot(new Date("2026-04-12T01:00:00.000Z"));

    expect(snapshot.schedule.key).toBe("ingestion_default");
    expect(Array.isArray(snapshot.runningTasks)).toBe(true);
    expect(Array.isArray(snapshot.recentTasks)).toBe(true);
    expect(snapshot.recentTasks[0]?.label).toBe("默认抓取任务");
    expect(snapshot.recentTasks[0]?.aiCallCountActual).toBe(3);
    expect(snapshot.recentTasks[0]?.aiCallCountEstimated).toBe(8);
  });

  it("cancels a queued task immediately", async () => {
    const taskRun = await enqueueTaskRun({
      kind: "ingestion",
      triggerType: "manual",
      label: "默认抓取任务",
    });

    const cancelledTaskRun = await requestTaskRunCancellation(taskRun.id);

    expect(cancelledTaskRun.status).toBe("cancelled");
    expect(cancelledTaskRun.finishedAt).not.toBeNull();
    expect(cancelledTaskRun.cancelRequestedAt).not.toBeNull();
    expect(cancelledTaskRun.progressLabel).toBe("任务已终止");
  });

  it("marks a running task as cancellation requested", async () => {
    const taskRun = await prisma.backgroundTaskRun.create({
      data: {
        kind: "ingestion",
        triggerType: "manual",
        status: "running",
        label: "默认抓取任务",
        startedAt: new Date("2026-04-12T00:31:00.000Z"),
      },
    });

    const updatedTaskRun = await requestTaskRunCancellation(taskRun.id);

    expect(updatedTaskRun.status).toBe("running");
    expect(updatedTaskRun.cancelRequestedAt).not.toBeNull();
  });

  it("refreshes the scheduler heartbeat while a task is reporting progress", async () => {
    const schedule = await prisma.taskSchedule.create({
      data: {
        key: "ingestion_default",
        enabled: true,
        intervalMinutes: 60,
        timezone: "Asia/Shanghai",
        nextRunAt: new Date("2026-04-12T01:00:00.000Z"),
        lastHeartbeatAt: new Date("2026-04-12T00:00:00.000Z"),
      },
    });
    const taskRun = await prisma.backgroundTaskRun.create({
      data: {
        kind: "ingestion",
        triggerType: "manual",
        status: "running",
        label: "默认抓取任务",
        startedAt: new Date("2026-04-12T00:31:00.000Z"),
      },
    });

    await updateTaskRun(taskRun.id, {
      status: "running",
      progressCurrent: 1,
      progressTotal: 10,
      progressLabel: "已处理 1/10 条内容",
    });

    const updatedSchedule = await prisma.taskSchedule.findUniqueOrThrow({
      where: { id: schedule.id },
    });

    expect(updatedSchedule.lastHeartbeatAt).not.toBeNull();
    expect(updatedSchedule.lastHeartbeatAt?.getTime()).toBeGreaterThan(schedule.lastHeartbeatAt?.getTime() ?? 0);
  });
});
