import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { prisma } from "@/lib/db";

const requireAdmin = vi.fn();

vi.mock("@/lib/admin/session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/admin/session")>();

  return {
    ...actual,
    requireAdmin,
  };
});

afterEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

describe("/api/admin/items", () => {
  beforeEach(async () => {
    await prisma.item.deleteMany();
    await prisma.contentCluster.deleteMany();
    await prisma.fetchRun.deleteMany();
    await prisma.source.deleteMany();

    const source = await prisma.source.create({
      data: {
        name: "Review Feed",
        rssUrl: "https://review.example.com/feed.xml",
        siteUrl: "https://review.example.com",
        enabled: true,
        aiParsingEnabled: false,
      },
    });

    await prisma.contentCluster.create({
      data: {
        id: "cluster-1",
        kind: "topic",
        title: "Agent toolkit launch",
        summary: "聚合摘要",
        score: 78,
        itemCount: 1,
        latestPublishedAt: new Date("2026-04-10T09:00:00.000Z"),
        status: "active",
        fingerprint: "agent-toolkit-launch",
      },
    });

    await prisma.item.create({
      data: {
        id: "item-filtered",
        sourceId: source.id,
        clusterId: "cluster-1",
        originalUrl: "https://review.example.com/posts/1",
        canonicalUrl: "https://review.example.com/posts/1",
        urlHash: "hash-filtered",
        dedupeSignature: "review|1",
        originalTitle: "Sponsored AI roundup",
        translatedTitle: "赞助 AI 汇总",
        publishedAt: new Date("2026-04-10T09:00:00.000Z"),
        summaryText: "疑似营销内容",
        status: "processed",
        moderationStatus: "filtered",
        moderationReason: "marketing",
        moderationDetail: "标题和摘要明显带有营销措辞",
        qualityScore: 18,
        qualityRationale: "营销导向且信息密度低",
        language: "en",
      },
    });
  });

  it("lists filtered items for admins", async () => {
    requireAdmin.mockResolvedValue(undefined);

    const { GET } = await import("@/app/api/admin/items/route");
    const response = await GET(new Request("http://localhost/api/admin/items?moderationStatus=filtered"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.items).toHaveLength(1);
    expect(json.items[0]).toMatchObject({
      id: "item-filtered",
      moderationStatus: "filtered",
      moderationReason: "marketing",
      qualityScore: 18,
    });
    expect(json.items[0]).not.toHaveProperty("topicLabel");
  });

  it("restores a filtered item for admins", async () => {
    requireAdmin.mockResolvedValue(undefined);

    const { POST } = await import("@/app/api/admin/items/[id]/restore/route");
    const response = await POST(
      new Request("http://localhost/api/admin/items/item-filtered/restore", { method: "POST" }),
      {
        params: Promise.resolve({ id: "item-filtered" }),
      },
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.item.moderationStatus).toBe("restored");

    const stored = await prisma.item.findUniqueOrThrow({
      where: { id: "item-filtered" },
    });
    expect(stored.moderationStatus).toBe("restored");
    expect(stored.restoredByAdminAt).not.toBeNull();
  });
});
