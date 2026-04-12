import { afterEach, describe, expect, it, vi } from "vitest";

const requireAdmin = vi.fn();
const getBackgroundTaskMonitorSnapshot = vi.fn();
const updateDefaultIngestionSchedule = vi.fn();

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
        intervalMinutes: 60,
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

  it("updates enabled and intervalMinutes", async () => {
    requireAdmin.mockResolvedValue(undefined);
    updateDefaultIngestionSchedule.mockResolvedValue({
      key: "ingestion_default",
      enabled: false,
      intervalMinutes: 120,
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
        body: JSON.stringify({ enabled: false, intervalMinutes: 120 }),
        headers: { "content-type": "application/json" },
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(updateDefaultIngestionSchedule).toHaveBeenCalledWith({
      enabled: false,
      intervalMinutes: 120,
    });
    expect(json.schedule.enabled).toBe(false);
    expect(json.schedule.intervalMinutes).toBe(120);
  });
});
