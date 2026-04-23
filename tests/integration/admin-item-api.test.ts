import { afterEach, describe, expect, it, vi } from "vitest";

const requireAdmin = vi.fn();
const enqueueItemReanalyzeTask = vi.fn();
const enqueueItemRegenerationTask = vi.fn();
const deleteItem = vi.fn();

vi.mock("@/lib/admin/session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/admin/session")>();

  return {
    ...actual,
    requireAdmin,
  };
});

vi.mock("@/lib/items/service", () => ({
  deleteItem,
  enqueueItemReanalyzeTask,
  enqueueItemRegenerationTask,
}));

afterEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

describe("/api/admin/items/[id]/regenerate", () => {
  it("rejects anonymous regeneration requests", async () => {
    requireAdmin.mockRejectedValue(new Error("Unauthorized"));

    const { POST } = await import("@/app/api/admin/items/[id]/regenerate/route");
    const response = await POST(
      new Request("http://localhost/api/admin/items/item-1/regenerate", {
        method: "POST",
        body: JSON.stringify({ target: "summary" }),
        headers: { "content-type": "application/json" },
      }),
      {
        params: Promise.resolve({ id: "item-1" }),
      },
    );
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(json.error).toBe("Unauthorized");
    expect(enqueueItemRegenerationTask).not.toHaveBeenCalled();
  });

  it("returns a queued task run for admins", async () => {
    requireAdmin.mockResolvedValue(undefined);
    enqueueItemRegenerationTask.mockResolvedValue({
      id: "task-1",
      kind: "item_regenerate_summary",
      status: "queued",
      triggerType: "admin_action",
      label: "重生成摘要",
      entityId: "item-1",
    });

    const { POST } = await import("@/app/api/admin/items/[id]/regenerate/route");
    const response = await POST(
      new Request("http://localhost/api/admin/items/item-1/regenerate", {
        method: "POST",
        body: JSON.stringify({ target: "summary" }),
        headers: { "content-type": "application/json" },
      }),
      {
        params: Promise.resolve({ id: "item-1" }),
      },
    );
    const json = await response.json();

    expect(response.status).toBe(202);
    expect(enqueueItemRegenerationTask).toHaveBeenCalledWith("item-1", "summary");
    expect(json.taskRun.id).toBe("task-1");
    expect(json.taskRun.kind).toBe("item_regenerate_summary");
  });

  it("returns a queued reanalyze task for admins", async () => {
    requireAdmin.mockResolvedValue(undefined);
    enqueueItemReanalyzeTask.mockResolvedValue({
      id: "task-2",
      kind: "item_reanalyze",
      status: "queued",
      triggerType: "admin_action",
      label: "重新 AI 判定",
      entityId: "item-1",
    });

    const { POST } = await import("@/app/api/admin/items/[id]/reanalyze/route");
    const response = await POST(
      new Request("http://localhost/api/admin/items/item-1/reanalyze", { method: "POST" }),
      {
        params: Promise.resolve({ id: "item-1" }),
      },
    );
    const json = await response.json();

    expect(response.status).toBe(202);
    expect(enqueueItemReanalyzeTask).toHaveBeenCalledWith("item-1");
    expect(json.taskRun.id).toBe("task-2");
    expect(json.taskRun.kind).toBe("item_reanalyze");
  });
});

describe("/api/admin/items/[id]", () => {
  it("rejects anonymous delete requests", async () => {
    requireAdmin.mockRejectedValue(new Error("Unauthorized"));

    const { DELETE } = await import("@/app/api/admin/items/[id]/route");
    const response = await DELETE(
      new Request("http://localhost/api/admin/items/item-1", {
        method: "DELETE",
      }),
      {
        params: Promise.resolve({ id: "item-1" }),
      },
    );
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(json.error).toBe("Unauthorized");
    expect(deleteItem).not.toHaveBeenCalled();
  });

  it("deletes an item for admins", async () => {
    requireAdmin.mockResolvedValue(undefined);
    deleteItem.mockResolvedValue({
      id: "item-1",
      previousClusterId: "cluster-1",
    });

    const { DELETE } = await import("@/app/api/admin/items/[id]/route");
    const response = await DELETE(
      new Request("http://localhost/api/admin/items/item-1", {
        method: "DELETE",
      }),
      {
        params: Promise.resolve({ id: "item-1" }),
      },
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(deleteItem).toHaveBeenCalledWith("item-1");
    expect(json.success).toBe(true);
  });
});
