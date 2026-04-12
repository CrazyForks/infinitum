import { afterEach, describe, expect, it, vi } from "vitest";

const getLatestFetchRun = vi.fn();
const requireAdmin = vi.fn();
const toFetchRunSnapshot = vi.fn((run) => ({
  id: run.id,
  status: run.status,
  triggerType: run.triggerType,
  startedAt: run.startedAt.toISOString(),
  finishedAt: run.finishedAt?.toISOString() ?? null,
  sourceCount: run.sourceCount,
  itemCount: run.itemCount,
  successCount: run.successCount,
  failureCount: run.failureCount,
  errorSummary: run.errorSummary,
}));
const startIngestionTask = vi.fn();

vi.mock("@/lib/feed/repository", () => ({
  getLatestFetchRun,
  toFetchRunSnapshot,
}));

vi.mock("@/lib/admin/session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/admin/session")>();

  return {
    ...actual,
    requireAdmin,
  };
});

vi.mock("@/lib/ingestion/service", () => ({
  startIngestionTask,
}));

afterEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

describe("/api/ingest", () => {
  it("starts ingestion asynchronously and returns 202 with the queued task snapshot", async () => {
    requireAdmin.mockResolvedValue(undefined);
    startIngestionTask.mockResolvedValue({
      id: "task-1",
      kind: "ingestion",
      status: "queued",
      triggerType: "manual",
      label: "默认抓取任务",
      entityId: null,
      progressCurrent: 0,
      progressTotal: 0,
      progressLabel: null,
      startedAt: null,
      finishedAt: null,
      errorSummary: null,
    });

    const { POST } = await import("@/app/api/ingest/run/route");
    const response = await POST(new Request("http://localhost/api/ingest/run", { method: "POST" }));
    const json = await response.json();

    expect(response.status).toBe(202);
    expect(requireAdmin).toHaveBeenCalledOnce();
    expect(startIngestionTask).toHaveBeenCalledWith({ triggerType: "manual" });
    expect(json.taskRun.id).toBe("task-1");
    expect(json.taskRun.status).toBe("queued");
  });

  it("rejects manual ingestion when the requester is not an admin", async () => {
    requireAdmin.mockRejectedValue(new Error("Unauthorized"));

    const { POST } = await import("@/app/api/ingest/run/route");
    const response = await POST(new Request("http://localhost/api/ingest/run", { method: "POST" }));
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(startIngestionTask).not.toHaveBeenCalled();
    expect(json.error).toBe("Unauthorized");
  });

  it("returns the latest run status including progress counters", async () => {
    getLatestFetchRun.mockResolvedValue({
      id: "run-2",
      status: "running",
      triggerType: "manual",
      startedAt: new Date("2026-04-10T10:00:00.000Z"),
      finishedAt: null,
      sourceCount: 1,
      itemCount: 10,
      successCount: 6,
      failureCount: 1,
      errorSummary: null,
    });

    const { GET } = await import("@/app/api/ingest/status/route");
    const response = await GET();
    const json = await response.json();

    expect(json.run.id).toBe("run-2");
    expect(json.run.itemCount).toBe(10);
    expect(json.run.successCount).toBe(6);
    expect(json.run.failureCount).toBe(1);
  });
});
