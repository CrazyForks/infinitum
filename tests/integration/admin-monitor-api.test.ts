import { afterEach, describe, expect, it, vi } from "vitest";

const requireAdmin = vi.fn();
const getBackgroundTaskMonitorSnapshot = vi.fn();
const updateDefaultIngestionSchedule = vi.fn();
const requestTaskRunCancellation = vi.fn();

vi.mock("@/lib/admin/session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/admin/session")>();

  return {
    ...actual,
    requireAdmin,
  };
});

vi.mock("@/lib/tasks/service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/tasks/service")>();

  return {
    ...actual,
    getBackgroundTaskMonitorSnapshot,
    updateDefaultIngestionSchedule,
    requestTaskRunCancellation,
  };
});

afterEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

describe("/api/admin/monitor", () => {
  it("returns schedule, running tasks and recent tasks", async () => {
    requireAdmin.mockResolvedValue(undefined);
    getBackgroundTaskMonitorSnapshot.mockResolvedValue({
      schedule: {
        key: "ingestion_default",
        enabled: true,
        cronExpression: "0 * * * *",
        sourceConcurrency: 2,
        fullTextFetchThreshold: 80,
        timezone: "Asia/Shanghai",
        lastHeartbeatAt: "2026-04-12T00:00:00.000Z",
        lastRunStartedAt: null,
        lastRunFinishedAt: null,
        lastRunStatus: null,
        nextRunAt: "2026-04-12T01:00:00.000Z",
        isHeartbeatStale: false,
      },
      runningTasks: [],
      recentTasks: [],
    });

    const { GET } = await import("@/app/api/admin/monitor/route");
    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.schedule.key).toBe("ingestion_default");
    expect(Array.isArray(json.runningTasks)).toBe(true);
    expect(Array.isArray(json.recentTasks)).toBe(true);
  });

  it("updates enabled and cronExpression", async () => {
    requireAdmin.mockResolvedValue(undefined);
    updateDefaultIngestionSchedule.mockResolvedValue({
      key: "ingestion_default",
      enabled: false,
      cronExpression: "*/15 * * * *",
      sourceConcurrency: 4,
      fullTextFetchThreshold: 120,
      timezone: "Asia/Shanghai",
      lastHeartbeatAt: null,
      lastRunStartedAt: null,
      lastRunFinishedAt: null,
      lastRunStatus: null,
      nextRunAt: new Date("2026-04-12T02:00:00.000Z"),
    });

    const { PATCH } = await import("@/app/api/admin/monitor/schedule/ingestion-default/route");
    const response = await PATCH(
      new Request("http://localhost/api/admin/monitor/schedule/ingestion-default", {
        method: "PATCH",
        body: JSON.stringify({
          enabled: false,
          cronExpression: "*/15 * * * *",
          sourceConcurrency: 4,
          fullTextFetchThreshold: 120,
        }),
        headers: { "content-type": "application/json" },
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(updateDefaultIngestionSchedule).toHaveBeenCalledWith({
      enabled: false,
      cronExpression: "*/15 * * * *",
      sourceConcurrency: 4,
      fullTextFetchThreshold: 120,
    });
    expect(json.schedule.enabled).toBe(false);
    expect(json.schedule.cronExpression).toBe("*/15 * * * *");
    expect(json.schedule.sourceConcurrency).toBe(4);
    expect(json.schedule.fullTextFetchThreshold).toBe(120);
  });

  it("requests cancellation for a running task", async () => {
    requireAdmin.mockResolvedValue(undefined);
    requestTaskRunCancellation.mockResolvedValue({
      id: "task-1",
      kind: "ingestion",
      triggerType: "manual",
      status: "running",
      label: "默认抓取任务",
      entityId: null,
      progressCurrent: 3,
      progressTotal: 10,
      progressLabel: "已处理 3/10 条内容，来自 1 个源，失败 0 项",
      startedAt: new Date("2026-04-12T00:30:00.000Z"),
      finishedAt: null,
      cancelRequestedAt: new Date("2026-04-12T00:31:00.000Z"),
      errorSummary: null,
    });

    const { POST } = await import("@/app/api/admin/monitor/tasks/[id]/cancel/route");
    const response = await POST(new Request("http://localhost/api/admin/monitor/tasks/task-1/cancel", { method: "POST" }), {
      params: Promise.resolve({ id: "task-1" }),
    });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(requestTaskRunCancellation).toHaveBeenCalledWith("task-1");
    expect(json.task.id).toBe("task-1");
    expect(json.task.cancelRequestedAt).toBe("2026-04-12T00:31:00.000Z");
  });
});
