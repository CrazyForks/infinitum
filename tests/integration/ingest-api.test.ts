import { afterEach, describe, expect, it, vi } from "vitest";

const hasActiveFetchRun = vi.fn();
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
const startIngestion = vi.fn();

vi.mock("@/lib/feed/repository", () => ({
  hasActiveFetchRun,
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
  startIngestion,
}));

afterEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

describe("/api/ingest", () => {
  it("starts ingestion asynchronously and returns 202 with the running snapshot", async () => {
    requireAdmin.mockResolvedValue(undefined);
    hasActiveFetchRun.mockResolvedValue(false);
    startIngestion.mockResolvedValue({
      id: "run-1",
      status: "running",
      triggerType: "manual",
      startedAt: new Date("2026-04-10T10:00:00.000Z"),
      finishedAt: null,
      sourceCount: 1,
      itemCount: 0,
      successCount: 0,
      failureCount: 0,
      errorSummary: null,
    });

    const { POST } = await import("@/app/api/ingest/run/route");
    const response = await POST(new Request("http://localhost/api/ingest/run", { method: "POST" }));
    const json = await response.json();

    expect(response.status).toBe(202);
    expect(requireAdmin).toHaveBeenCalledOnce();
    expect(startIngestion).toHaveBeenCalledWith({ trigger: "manual" });
    expect(json.run.id).toBe("run-1");
    expect(json.run.status).toBe("running");
  });

  it("rejects manual ingestion when the requester is not an admin", async () => {
    requireAdmin.mockRejectedValue(new Error("Unauthorized"));

    const { POST } = await import("@/app/api/ingest/run/route");
    const response = await POST(new Request("http://localhost/api/ingest/run", { method: "POST" }));
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(startIngestion).not.toHaveBeenCalled();
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
