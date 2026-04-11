import { afterEach, describe, expect, it, vi } from "vitest";

const requireAdmin = vi.fn();
const regenerateItemContent = vi.fn();
const mapItemToFeedItem = vi.fn((item) => ({
  id: item.id,
  title: item.translatedTitle || item.originalTitle,
  originalUrl: item.originalUrl,
  publishedAt: item.publishedAt.toISOString(),
  sourceName: item.source.name,
  author: item.author,
  summary: item.summaryText,
  canRegenerateTranslation: true,
}));

vi.mock("@/lib/admin/session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/admin/session")>();

  return {
    ...actual,
    requireAdmin,
  };
});

vi.mock("@/lib/items/service", () => ({
  regenerateItemContent,
}));

vi.mock("@/lib/feed/repository", () => ({
  mapItemToFeedItem,
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
    expect(regenerateItemContent).not.toHaveBeenCalled();
  });

  it("returns the updated feed item for admins", async () => {
    requireAdmin.mockResolvedValue(undefined);
    regenerateItemContent.mockResolvedValue({
      id: "item-1",
      originalTitle: "OpenAI ships a new toolkit",
      translatedTitle: "新的中文标题",
      originalUrl: "https://example.com/posts/1",
      publishedAt: new Date("2026-04-10T09:00:00.000Z"),
      summaryText: "新的摘要",
      author: "Alex",
      source: {
        name: "Example Feed",
      },
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

    expect(response.status).toBe(200);
    expect(regenerateItemContent).toHaveBeenCalledWith("item-1", "summary");
    expect(json.item.id).toBe("item-1");
    expect(json.item.summary).toBe("新的摘要");
  });
});
