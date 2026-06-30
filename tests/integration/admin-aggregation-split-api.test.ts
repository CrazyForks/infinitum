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

describe("/api/admin/items/aggregation", () => {
  beforeEach(async () => {
    await prisma.aggregationSplitLink.deleteMany();
    await prisma.item.deleteMany();
    await prisma.contentCluster.deleteMany();
    await prisma.fetchRun.deleteMany();
    await prisma.source.deleteMany();

    const source = await prisma.source.create({
      data: {
        name: "Split Feed",
        rssUrl: "https://split.example.com/feed.xml",
        siteUrl: "https://split.example.com",
        enabled: true,
        aiParsingEnabled: true,
      },
    });

    const parent = await prisma.item.create({
      data: {
        id: "split-parent",
        sourceId: source.id,
        originalUrl: "https://split.example.com/posts/parent",
        canonicalUrl: "https://split.example.com/posts/parent",
        urlHash: "hash-parent",
        originalTitle: "Split Parent",
        translatedTitle: "拆分父项",
        publishedAt: new Date("2026-04-10T09:00:00.000Z"),
        summaryText: "父项摘要",
        status: "processed",
        moderationStatus: "allowed",
        qualityScore: 81,
        qualityRationale: "高质量",
        isAggregation: true,
        aggregationParseStatus: "parsed",
        aggregationCheckedAt: new Date("2026-04-10T10:00:00.000Z"),
        language: "en",
      },
    });

    await prisma.item.createMany({
      data: [
        {
          id: "split-child-1",
          sourceId: source.id,
          parentItemId: parent.id,
          clusterId: null,
          originalUrl: "https://split.example.com/posts/event-1",
          canonicalUrl: "https://split.example.com/posts/event-1",
          urlHash: "hash-child-1",
          originalTitle: "Split Child 1",
          translatedTitle: "拆分子项 1",
          publishedAt: new Date("2026-04-10T09:10:00.000Z"),
          summaryText: "子项摘要 1",
          status: "processed",
          moderationStatus: "allowed",
          qualityScore: 79,
          qualityRationale: "子项",
          eventType: "launch",
          eventSubject: "OpenAI",
          eventAction: "发布",
          eventObject: "toolkit",
          eventDate: "2026-04-10",
          language: "en",
        },
        {
          id: "split-child-2",
          sourceId: source.id,
          parentItemId: parent.id,
          clusterId: null,
          originalUrl: "https://split.example.com/posts/parent",
          canonicalUrl: "https://split.example.com/posts/parent",
          urlHash: "hash-child-2",
          originalTitle: "Split Child 2",
          translatedTitle: "拆分子项 2",
          publishedAt: new Date("2026-04-10T09:20:00.000Z"),
          summaryText: "子项摘要 2",
          status: "processed",
          moderationStatus: "allowed",
          qualityScore: 77,
          qualityRationale: "子项",
          eventType: "update",
          eventSubject: "OpenAI",
          eventAction: "更新",
          eventObject: "model",
          eventDate: "2026-04-10",
          language: "en",
        },
      ],
    });
  });

  it("lists split parents for admins", async () => {
    requireAdmin.mockResolvedValue(undefined);

    const { GET } = await import("@/app/api/admin/items/aggregation/route");
    const response = await GET(new Request("http://localhost/api/admin/items/aggregation"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.aggregationSplits).toHaveLength(1);
    expect(json.aggregationSplits[0]).toMatchObject({
      id: "split-parent",
      childCount: 2,
      eventUrlCount: 1,
      parentUrlCount: 1,
      aggregationParseStatus: "parsed",
      aggregationCheckedAt: "2026-04-10T10:00:00.000Z",
    });
  });

  it("sorts split parents by split time descending", async () => {
    requireAdmin.mockResolvedValue(undefined);

    const source = await prisma.source.findFirstOrThrow({
      where: { name: "Split Feed" },
    });
    await prisma.item.create({
      data: {
        id: "split-parent-newer",
        sourceId: source.id,
        originalUrl: "https://split.example.com/posts/parent-newer",
        canonicalUrl: "https://split.example.com/posts/parent-newer",
        urlHash: "hash-parent-newer",
        originalTitle: "Split Parent Newer",
        translatedTitle: "较新的拆分父项",
        publishedAt: new Date("2026-04-10T08:00:00.000Z"),
        summaryText: "较新的父项摘要",
        status: "processed",
        moderationStatus: "allowed",
        qualityScore: 82,
        qualityRationale: "高质量",
        isAggregation: true,
        aggregationParseStatus: "parsed",
        aggregationCheckedAt: new Date("2026-04-10T12:00:00.000Z"),
        language: "en",
      },
    });

    const { GET } = await import("@/app/api/admin/items/aggregation/route");
    const response = await GET(new Request("http://localhost/api/admin/items/aggregation"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.aggregationSplits.map((item: { id: string }) => item.id)).toEqual([
      "split-parent-newer",
      "split-parent",
    ]);
  });

  it("filters split parents by recent range", async () => {
    requireAdmin.mockResolvedValue(undefined);

    const source = await prisma.source.findFirstOrThrow({
      where: { name: "Split Feed" },
    });
    await prisma.item.create({
      data: {
        id: "split-parent-old",
        sourceId: source.id,
        originalUrl: "https://split.example.com/posts/parent-old",
        canonicalUrl: "https://split.example.com/posts/parent-old",
        urlHash: "hash-parent-old",
        originalTitle: "Old Split Parent",
        translatedTitle: "较早拆分父项",
        publishedAt: new Date("2026-04-01T09:00:00.000Z"),
        summaryText: "较早父项摘要",
        status: "processed",
        moderationStatus: "allowed",
        qualityScore: 70,
        qualityRationale: "历史数据",
        isAggregation: true,
        aggregationParseStatus: "parsed",
        aggregationCheckedAt: new Date("2026-04-01T10:00:00.000Z"),
        language: "en",
        createdAt: new Date("2026-04-01T10:00:00.000Z"),
        updatedAt: new Date("2026-04-01T10:00:00.000Z"),
      },
    });

    const { GET } = await import("@/app/api/admin/items/aggregation/route");
    const response = await GET(new Request("http://localhost/api/admin/items/aggregation?rangeDays=7"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.aggregationSplits.map((item: { id: string }) => item.id)).toContain("split-parent");
    expect(json.aggregationSplits.map((item: { id: string }) => item.id)).not.toContain("split-parent-old");
  });

  it("loads split detail with children for admins", async () => {
    requireAdmin.mockResolvedValue(undefined);

    const { GET } = await import("@/app/api/admin/items/aggregation/[id]/route");
    const response = await GET(
      new Request("http://localhost/api/admin/items/aggregation/split-parent"),
      {
        params: Promise.resolve({ id: "split-parent" }),
      },
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.aggregationSplit.children).toHaveLength(2);
    const parentUrlChild = json.aggregationSplit.children.find(
      (child: { id: string }) => child.id === "split-child-2",
    );
    expect(parentUrlChild?.usesParentUrl).toBe(true);
  });

  it("cancels split and hides children for admins", async () => {
    requireAdmin.mockResolvedValue(undefined);

    const { POST } = await import("@/app/api/admin/items/aggregation/[id]/cancel/route");
    const response = await POST(
      new Request("http://localhost/api/admin/items/aggregation/split-parent/cancel", {
        method: "POST",
      }),
      {
        params: Promise.resolve({ id: "split-parent" }),
      },
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);

    const parent = await prisma.item.findUniqueOrThrow({
      where: { id: "split-parent" },
    });
    expect(parent.isAggregation).toBe(false);
    expect(parent.aggregationParseStatus).toBe("manual_cancelled");

    const child = await prisma.item.findUniqueOrThrow({
      where: { id: "split-child-1" },
    });
    expect(child.moderationStatus).toBe("filtered");
    expect(child.filterReason).toBe("aggregation_split_cancelled");
  });

  it("cancels only the selected split link without filtering a child reused by another parent", async () => {
    requireAdmin.mockResolvedValue(undefined);

    const source = await prisma.source.findFirstOrThrow({
      where: { name: "Split Feed" },
    });
    const secondParent = await prisma.item.create({
      data: {
        id: "split-parent-second",
        sourceId: source.id,
        originalUrl: "https://split.example.com/posts/parent-second",
        canonicalUrl: "https://split.example.com/posts/parent-second",
        urlHash: "hash-parent-second",
        originalTitle: "Split Parent Second",
        translatedTitle: "第二个拆分父项",
        publishedAt: new Date("2026-04-11T09:00:00.000Z"),
        summaryText: "第二个父项摘要",
        status: "processed",
        moderationStatus: "allowed",
        qualityScore: 81,
        qualityRationale: "高质量",
        isAggregation: true,
        aggregationParseStatus: "parsed",
        aggregationCheckedAt: new Date("2026-04-11T10:00:00.000Z"),
        language: "en",
      },
    });
    await prisma.aggregationSplitLink.createMany({
      data: [
        {
          parentItemId: "split-parent",
          childItemId: "split-child-1",
          eventIndex: 0,
          fingerprint: "shared-event",
          oneLiner: "共享事件",
          sourceUrl: "https://split.example.com/posts/event-1",
        },
        {
          parentItemId: secondParent.id,
          childItemId: "split-child-1",
          eventIndex: 0,
          fingerprint: "shared-event",
          oneLiner: "共享事件",
          sourceUrl: "https://split.example.com/posts/event-1",
        },
      ],
    });

    const { POST } = await import("@/app/api/admin/items/aggregation/[id]/cancel/route");
    const response = await POST(
      new Request("http://localhost/api/admin/items/aggregation/split-parent/cancel", {
        method: "POST",
      }),
      {
        params: Promise.resolve({ id: "split-parent" }),
      },
    );

    expect(response.status).toBe(200);
    await expect(
      prisma.aggregationSplitLink.findFirstOrThrow({
        where: {
          parentItemId: secondParent.id,
          childItemId: "split-child-1",
        },
      }),
    ).resolves.toBeTruthy();
    expect(
      await prisma.aggregationSplitLink.count({
        where: {
          parentItemId: "split-parent",
        },
      }),
    ).toBe(0);

    const sharedChild = await prisma.item.findUniqueOrThrow({
      where: { id: "split-child-1" },
    });
    expect(sharedChild.status).toBe("processed");
    expect(sharedChild.moderationStatus).toBe("allowed");
    expect(sharedChild.parentItemId).toBe(secondParent.id);
  });
});
