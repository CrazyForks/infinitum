import { beforeEach, describe, expect, it, vi } from "vitest";

import { prisma } from "@/lib/db";
import { resolveFeedFilters } from "@/lib/feed/range";
import { listFeedItems } from "@/lib/feed/repository";

describe("/api/feed", () => {
  beforeEach(async () => {
    await prisma.item.deleteMany();
    await prisma.contentCluster.deleteMany();
    await prisma.fetchRun.deleteMany();
    await prisma.source.deleteMany();
    await prisma.sourceGroup.deleteMany();

    const source = await prisma.source.create({
      data: {
        name: "API Feed",
        rssUrl: "https://api.example.com/feed.xml",
        siteUrl: "https://api.example.com",
        enabled: true,
        aiParsingEnabled: true,
      },
    });

    await prisma.contentCluster.createMany({
      data: [
        {
          id: "cluster-a",
          kind: "topic",
          title: "OpenAI Agent 发布",
          summary: "聚合摘要 A",
          score: 90,
          itemCount: 2,
          latestPublishedAt: new Date("2026-04-10T09:00:00.000Z"),
          status: "active",
          fingerprint: "openai-agent",
        },
        {
          id: "cluster-b",
          kind: "topic",
          title: "独立内容",
          summary: "单条摘要",
          score: 62,
          itemCount: 1,
          latestPublishedAt: new Date("2026-04-09T09:00:00.000Z"),
          status: "active",
          fingerprint: "single-story",
        },
        {
          id: "cluster-c",
          kind: "topic",
          title: "高分旧内容",
          summary: "高分摘要",
          score: 98,
          itemCount: 1,
          latestPublishedAt: new Date("2026-04-08T09:00:00.000Z"),
          status: "active",
          fingerprint: "high-score-story",
        },
      ],
    });

    await prisma.item.createMany({
      data: [
        {
          id: "item-a1",
          sourceId: source.id,
          clusterId: "cluster-a",
          originalUrl: "https://api.example.com/a",
          canonicalUrl: "https://api.example.com/a",
          urlHash: "hash-a",
          dedupeSignature: "api feed|story a|2026-04-10t09:00:00.000z",
          originalTitle: "Story A",
          translatedTitle: "故事 A",
          author: "Author A",
          publishedAt: new Date("2026-04-10T09:00:00.000Z"),
          summaryText: "摘要 A",
          status: "processed",
          moderationStatus: "allowed",
          qualityScore: 92,
          qualityRationale: "高质量",
          language: "en",
          createdAt: new Date("2026-04-10T09:05:00.000Z"),
        },
        {
          id: "item-a2",
          sourceId: source.id,
          clusterId: "cluster-a",
          originalUrl: "https://api.example.com/a-2",
          canonicalUrl: "https://api.example.com/a-2",
          urlHash: "hash-a2",
          dedupeSignature: "api feed|story a2|2026-04-10t08:30:00.000z",
          originalTitle: "Story A 2",
          translatedTitle: "故事 A2",
          author: "Author A2",
          publishedAt: new Date("2026-04-10T08:30:00.000Z"),
          summaryText: "摘要 A2",
          status: "processed",
          moderationStatus: "allowed",
          qualityScore: 88,
          qualityRationale: "高质量",
          language: "en",
          createdAt: new Date("2026-04-10T08:35:00.000Z"),
        },
        {
          id: "item-b1",
          sourceId: source.id,
          clusterId: "cluster-b",
          originalUrl: "https://api.example.com/b",
          canonicalUrl: "https://api.example.com/b",
          urlHash: "hash-b",
          dedupeSignature: "api feed|story b|2026-04-09t09:00:00.000z",
          originalTitle: "Story B",
          translatedTitle: "故事 B",
          author: "Author B",
          publishedAt: new Date("2026-04-09T09:00:00.000Z"),
          summaryText: "摘要 B",
          status: "processed",
          moderationStatus: "allowed",
          qualityScore: 62,
          qualityRationale: "一般质量",
          language: "en",
          createdAt: new Date("2026-04-09T09:05:00.000Z"),
        },
        {
          id: "item-c1",
          sourceId: source.id,
          clusterId: "cluster-c",
          originalUrl: "https://api.example.com/c1",
          canonicalUrl: "https://api.example.com/c1",
          urlHash: "hash-c1",
          dedupeSignature: "api feed|story c1|2026-04-08t09:00:00.000z",
          originalTitle: "Story C1",
          translatedTitle: "故事 C1",
          author: "Author C1",
          publishedAt: new Date("2026-04-08T09:00:00.000Z"),
          summaryText: "摘要 C1",
          status: "processed",
          moderationStatus: "allowed",
          qualityScore: 98,
          qualityRationale: "非常高质量",
          language: "en",
          createdAt: new Date("2026-04-08T09:05:00.000Z"),
        },
        {
          id: "item-d1",
          sourceId: source.id,
          originalUrl: "https://api.example.com/c",
          canonicalUrl: "https://api.example.com/c",
          urlHash: "hash-c",
          dedupeSignature: "api feed|story c|2026-04-10t08:00:00.000z",
          originalTitle: "Story C",
          publishedAt: new Date("2026-04-10T08:00:00.000Z"),
          summaryText: "摘要 C",
          status: "filtered",
          moderationStatus: "filtered",
          moderationReason: "low_quality",
          qualityScore: 20,
          qualityRationale: "低质量",
          language: "en",
          createdAt: new Date("2026-04-10T08:05:00.000Z"),
        },
        {
          id: "item-timezone-created",
          sourceId: source.id,
          originalUrl: "https://api.example.com/timezone-created",
          canonicalUrl: "https://api.example.com/timezone-created",
          urlHash: "hash-timezone-created",
          dedupeSignature: "api feed|timezone created|2026-04-01t00:00:00.000z",
          originalTitle: "Timezone Created",
          translatedTitle: "按创建时间归档",
          author: "Author TZ",
          publishedAt: new Date("2026-04-01T00:00:00.000Z"),
          summaryText: "创建时间落在东八区当天",
          status: "processed",
          moderationStatus: "allowed",
          qualityScore: 75,
          qualityRationale: "测试创建时间筛选",
          language: "en",
          createdAt: new Date("2026-04-09T18:00:00.000Z"),
        },
        {
          id: "item-created-too-old",
          sourceId: source.id,
          originalUrl: "https://api.example.com/created-too-old",
          canonicalUrl: "https://api.example.com/created-too-old",
          urlHash: "hash-created-too-old",
          dedupeSignature: "api feed|created too old|2026-04-10t11:00:00.000z",
          originalTitle: "Created Too Old",
          translatedTitle: "发布时间新但创建时间旧",
          author: "Author Old",
          publishedAt: new Date("2026-04-10T11:00:00.000Z"),
          summaryText: "应该被创建时间筛掉",
          status: "processed",
          moderationStatus: "allowed",
          qualityScore: 66,
          qualityRationale: "测试创建时间优先",
          language: "en",
          createdAt: new Date("2026-04-01T11:00:00.000Z"),
        },
      ],
    });
  });

  it("returns a mixed feed with clusters and single items for the selected range", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-10T12:00:00.000Z"));

    const { GET } = await import("@/app/api/feed/route");
    const response = await GET(
      new Request("http://localhost/api/feed?range=7d"),
    );

    const json = await response.json();

    expect(json.items).toHaveLength(4);
    expect(json.items[0]).toMatchObject({
      type: "cluster",
      id: "cluster-a",
      title: "OpenAI Agent 发布",
      itemCount: 2,
      score: 91,
    });
    expect(json.items[1]).toMatchObject({
      type: "single",
      id: "item-timezone-created",
      title: "按创建时间归档",
      itemCount: 1,
      score: 75,
    });
    expect(json.items[2]).toMatchObject({
      type: "single",
      id: "item-b1",
      title: "故事 B",
      itemCount: 1,
      score: 62,
    });
    expect(json.items[3]).toMatchObject({
      type: "single",
      id: "item-c1",
      title: "故事 C1",
      itemCount: 1,
      score: 98,
    });
    expect(json.pagination).toMatchObject({
      page: 1,
      size: 20,
      total: 4,
      totalPages: 1,
    });
    expect(json.sort).toBe("time_desc");

    vi.useRealTimers();
  });

  it("supports page and size parameters for feed pagination", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-10T12:00:00.000Z"));

    try {
      const { GET } = await import("@/app/api/feed/route");
      const response = await GET(new Request("http://localhost/api/feed?range=7d&page=2&size=2"));

      const json = await response.json();

      expect(json.items).toHaveLength(2);
      expect(json.items[0]).toMatchObject({
        type: "single",
        id: "item-b1",
      });
      expect(json.items[1]).toMatchObject({
        type: "single",
        id: "item-c1",
      });
      expect(json.pagination).toMatchObject({
        page: 2,
        size: 2,
        total: 4,
        totalPages: 2,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("paginates aggregated entries without materializing the full feed item set", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-10T12:00:00.000Z"));

    const findManySpy = vi.spyOn(prisma.item, "findMany");

    try {
      const filters = resolveFeedFilters(
        {
          range: "7d",
          sort: "time_desc",
          start: null,
          end: null,
          groupId: null,
          sourceId: null,
          title: null,
        },
        new Date("2026-04-10T12:00:00.000Z"),
        0,
      );

      const result = await listFeedItems(filters, { page: 1, size: 2 });

      expect(result.pagination).toMatchObject({
        page: 1,
        size: 2,
        total: 4,
        totalPages: 2,
      });
      expect(result.items).toHaveLength(2);
      expect(findManySpy).not.toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.objectContaining({
            cluster: true,
          }),
        }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("filters the mixed feed by a custom start and end date range", async () => {
    const { GET } = await import("@/app/api/feed/route");
    const response = await GET(new Request("http://localhost/api/feed?range=7d&start=2026-04-10&end=2026-04-10"));

    const json = await response.json();

    expect(json.items).toHaveLength(1);
    expect(json.items[0]).toMatchObject({
      type: "cluster",
      id: "cluster-a",
      itemCount: 2,
    });
    expect(json.start).toBe("2026-04-10");
    expect(json.end).toBe("2026-04-10");
  });

  it("filters by item createdAt and respects the user's timezone offset", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-10T12:00:00.000Z"));

    try {
      const { GET } = await import("@/app/api/feed/route");
      const response = await GET(new Request("http://localhost/api/feed?range=today&tzOffsetMinutes=-480"));

      const json = await response.json();
      const itemIds = json.items.map((item: { id: string }) => item.id);

      expect(itemIds).toContain("cluster-a");
      expect(itemIds).toContain("item-timezone-created");
      expect(itemIds).not.toContain("item-created-too-old");
    } finally {
      vi.useRealTimers();
    }
  });

  it("sorts the mixed feed by score when requested", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-10T12:00:00.000Z"));

    try {
      const { GET } = await import("@/app/api/feed/route");
      const response = await GET(new Request("http://localhost/api/feed?range=7d&sort=score_desc"));

      const json = await response.json();

      expect(json.items).toHaveLength(4);
      expect(json.items[0]).toMatchObject({
        type: "single",
        id: "item-c1",
        score: 98,
      });
      expect(json.items[1]).toMatchObject({
        type: "cluster",
        id: "cluster-a",
        score: 91,
      });
      expect(json.items[2]).toMatchObject({
        type: "single",
        id: "item-timezone-created",
        score: 75,
      });
      expect(json.items[3]).toMatchObject({
        type: "single",
        id: "item-b1",
        score: 62,
      });
      expect(json.sort).toBe("score_desc");
    } finally {
      vi.useRealTimers();
    }
  });

  it("boosts multi-source clusters in score sorting", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-10T12:00:00.000Z"));

    try {
      const [firstSource, secondSource, thirdSource] = await Promise.all([
        prisma.source.create({
          data: {
            name: "Boost Feed 1",
            rssUrl: "https://boost-1.example.com/feed.xml",
            siteUrl: "https://boost-1.example.com",
            enabled: true,
            aiParsingEnabled: true,
          },
        }),
        prisma.source.create({
          data: {
            name: "Boost Feed 2",
            rssUrl: "https://boost-2.example.com/feed.xml",
            siteUrl: "https://boost-2.example.com",
            enabled: true,
            aiParsingEnabled: true,
          },
        }),
        prisma.source.create({
          data: {
            name: "Boost Feed 3",
            rssUrl: "https://boost-3.example.com/feed.xml",
            siteUrl: "https://boost-3.example.com",
            enabled: true,
            aiParsingEnabled: true,
          },
        }),
      ]);

      await prisma.contentCluster.create({
        data: {
          id: "cluster-boosted",
          kind: "topic",
          title: "多来源聚合内容",
          summary: "多来源聚合摘要",
          score: 93,
          itemCount: 3,
          latestPublishedAt: new Date("2026-04-07T09:00:00.000Z"),
          status: "active",
          fingerprint: "boosted-cluster",
        },
      });

      await prisma.item.createMany({
        data: [firstSource, secondSource, thirdSource].map((source, index) => ({
          id: `item-boosted-${index + 1}`,
          sourceId: source.id,
          clusterId: "cluster-boosted",
          originalUrl: `https://boost-${index + 1}.example.com/story`,
          canonicalUrl: `https://boost-${index + 1}.example.com/story`,
          urlHash: `hash-boosted-${index + 1}`,
          dedupeSignature: `boosted|story|${index + 1}`,
          originalTitle: `Boosted Story ${index + 1}`,
          translatedTitle: `加权内容 ${index + 1}`,
          publishedAt: new Date(`2026-04-07T09:0${index}:00.000Z`),
          summaryText: `加权摘要 ${index + 1}`,
          status: "processed",
          moderationStatus: "allowed",
          qualityScore: 93,
          qualityRationale: "多来源高质量",
          language: "zh",
          createdAt: new Date(`2026-04-07T09:1${index}:00.000Z`),
        })),
      });

      const { GET } = await import("@/app/api/feed/route");
      const response = await GET(new Request("http://localhost/api/feed?range=7d&sort=score_desc"));
      const json = await response.json();

      expect(json.items[0]).toMatchObject({
        type: "cluster",
        id: "cluster-boosted",
        score: 100,
        sourceCount: 3,
        itemCount: 3,
      });
      expect(json.items[1]).toMatchObject({
        type: "single",
        id: "item-c1",
        score: 98,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("filters the feed by fuzzy title match", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-10T12:00:00.000Z"));

    try {
      const { GET } = await import("@/app/api/feed/route");
      const response = await GET(new Request("http://localhost/api/feed?range=7d&title=OpenAI"));

      const json = await response.json();

      expect(json.items).toHaveLength(1);
      expect(json.items[0]).toMatchObject({
        type: "cluster",
        id: "cluster-a",
        title: "OpenAI Agent 发布",
      });
      expect(json.title).toBe("OpenAI");
    } finally {
      vi.useRealTimers();
    }
  });

  it("filters feed entries by group and only returns matching content", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-10T12:00:00.000Z"));

    try {
      const group = await prisma.sourceGroup.create({
        data: {
          name: "Infra",
        },
      });

      const groupedSource = await prisma.source.create({
        data: {
          name: "Grouped Feed",
          rssUrl: "https://grouped.example.com/feed.xml",
          siteUrl: "https://grouped.example.com",
          enabled: true,
          aiParsingEnabled: true,
          groupId: group.id,
        },
      });

      await prisma.contentCluster.create({
        data: {
          id: "cluster-grouped",
          kind: "topic",
          title: "Infra Launch",
          summary: "Infra summary",
          score: 85,
          itemCount: 1,
          latestPublishedAt: new Date("2026-04-10T10:00:00.000Z"),
          status: "active",
          fingerprint: "infra-launch",
        },
      });

      await prisma.item.create({
        data: {
          id: "item-grouped-1",
          sourceId: groupedSource.id,
          clusterId: "cluster-grouped",
          originalUrl: "https://grouped.example.com/post-1",
          canonicalUrl: "https://grouped.example.com/post-1",
          urlHash: "hash-grouped-1",
          dedupeSignature: "grouped feed|post 1|2026-04-10t10:00:00.000z",
          originalTitle: "Infra story",
          translatedTitle: "基础设施动态",
          publishedAt: new Date("2026-04-10T10:00:00.000Z"),
          summaryText: "Infra item summary",
          status: "processed",
          moderationStatus: "allowed",
          qualityScore: 85,
          qualityRationale: "高质量",
          language: "en",
        },
      });

      const { GET } = await import("@/app/api/feed/route");
      const response = await GET(
        new Request(`http://localhost/api/feed?range=7d&groupId=${group.id}`),
      );

      const json = await response.json();

      expect(json.items).toHaveLength(1);
      expect(json.items[0]).toMatchObject({
        type: "single",
        id: "item-grouped-1",
        title: "基础设施动态",
        sourceName: "Grouped Feed",
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns dynamic group counts for the current filter range while ignoring the selected group filter", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-10T12:00:00.000Z"));

    try {
      const infra = await prisma.sourceGroup.create({
        data: {
          name: "Infra",
        },
      });

      const ai = await prisma.sourceGroup.create({
        data: {
          name: "AI",
        },
      });

      const infraSource = await prisma.source.create({
        data: {
          name: "Infra Feed",
          rssUrl: "https://infra.example.com/feed.xml",
          siteUrl: "https://infra.example.com",
          enabled: true,
          aiParsingEnabled: true,
          groupId: infra.id,
        },
      });

      const aiSource = await prisma.source.create({
        data: {
          name: "AI Feed",
          rssUrl: "https://ai.example.com/feed.xml",
          siteUrl: "https://ai.example.com",
          enabled: true,
          aiParsingEnabled: true,
          groupId: ai.id,
        },
      });

      await prisma.item.createMany({
        data: [
          {
            id: "item-group-count-infra",
            sourceId: infraSource.id,
            originalUrl: "https://infra.example.com/post-1",
            canonicalUrl: "https://infra.example.com/post-1",
            urlHash: "hash-group-count-infra",
            dedupeSignature: "infra feed|post 1|2026-04-10t08:00:00.000z",
            originalTitle: "Infra count story",
            translatedTitle: "基础设施统计",
            publishedAt: new Date("2026-04-10T08:00:00.000Z"),
            summaryText: "Infra summary",
            status: "processed",
            moderationStatus: "allowed",
            qualityScore: 80,
            qualityRationale: "高质量",
            language: "en",
          },
          {
            id: "item-group-count-ai",
            sourceId: aiSource.id,
            originalUrl: "https://ai.example.com/post-1",
            canonicalUrl: "https://ai.example.com/post-1",
            urlHash: "hash-group-count-ai",
            dedupeSignature: "ai feed|post 1|2026-04-10t09:00:00.000z",
            originalTitle: "AI count story",
            translatedTitle: "AI 统计",
            publishedAt: new Date("2026-04-10T09:00:00.000Z"),
            summaryText: "AI summary",
            status: "processed",
            moderationStatus: "allowed",
            qualityScore: 81,
            qualityRationale: "高质量",
            language: "en",
          },
        ],
      });

      const { GET } = await import("@/app/api/feed/route");
      const response = await GET(
        new Request(`http://localhost/api/feed?range=7d&groupId=${infra.id}`),
      );

      const json = await response.json();

      expect(json.items).toHaveLength(1);
      expect(json.groupTotalCount).toBe(7);
      expect(json.groups).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: infra.id, name: "Infra", count: 1 }),
          expect.objectContaining({ id: ai.id, name: "AI", count: 1 }),
        ]),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps the all-groups total for ungrouped items", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-10T12:00:00.000Z"));

    try {
      const ungroupedSource = await prisma.source.create({
        data: {
          name: "Ungrouped Feed",
          rssUrl: "https://ungrouped.example.com/feed.xml",
          siteUrl: "https://ungrouped.example.com",
          enabled: true,
          aiParsingEnabled: true,
        },
      });

      await prisma.item.createMany({
        data: [
          {
            id: "item-ungrouped-total-1",
            sourceId: ungroupedSource.id,
            originalUrl: "https://ungrouped.example.com/post-1",
            canonicalUrl: "https://ungrouped.example.com/post-1",
            urlHash: "hash-ungrouped-total-1",
            dedupeSignature: "ungrouped feed|post 1|2026-04-10t08:00:00.000z",
            originalTitle: "Ungrouped story one",
            translatedTitle: "未分组内容一",
            publishedAt: new Date("2026-04-10T08:00:00.000Z"),
            summaryText: "summary 1",
            status: "processed",
            moderationStatus: "allowed",
            qualityScore: 70,
            qualityRationale: "ok",
            language: "en",
          },
          {
            id: "item-ungrouped-total-2",
            sourceId: ungroupedSource.id,
            originalUrl: "https://ungrouped.example.com/post-2",
            canonicalUrl: "https://ungrouped.example.com/post-2",
            urlHash: "hash-ungrouped-total-2",
            dedupeSignature: "ungrouped feed|post 2|2026-04-10t09:00:00.000z",
            originalTitle: "Ungrouped story two",
            translatedTitle: "未分组内容二",
            publishedAt: new Date("2026-04-10T09:00:00.000Z"),
            summaryText: "summary 2",
            status: "processed",
            moderationStatus: "allowed",
            qualityScore: 71,
            qualityRationale: "ok",
            language: "en",
          },
        ],
      });

      const { GET } = await import("@/app/api/feed/route");
      const response = await GET(new Request("http://localhost/api/feed?range=7d"));
      const json = await response.json();

      expect(json.groupTotalCount).toBeGreaterThanOrEqual(2);
      expect(json.groups).toEqual(expect.any(Array));
    } finally {
      vi.useRealTimers();
    }
  });

  it("downgrades a filtered cluster into a single entry when only one source item matches", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-10T12:00:00.000Z"));

    try {
      const otherSource = await prisma.source.create({
        data: {
          name: "Other Feed",
          rssUrl: "https://other.example.com/feed.xml",
          siteUrl: "https://other.example.com",
          enabled: true,
          aiParsingEnabled: true,
        },
      });

      await prisma.contentCluster.create({
        data: {
          id: "cluster-mixed",
          kind: "topic",
          title: "Mixed Cluster",
          summary: "Mixed summary",
          score: 77,
          itemCount: 2,
          latestPublishedAt: new Date("2026-04-10T11:00:00.000Z"),
          status: "active",
          fingerprint: "mixed-cluster",
        },
      });

      const baseSource = await prisma.source.findFirstOrThrow({
        where: { rssUrl: "https://api.example.com/feed.xml" },
      });

      await prisma.item.createMany({
        data: [
          {
            id: "item-mixed-source-a",
            sourceId: baseSource.id,
            clusterId: "cluster-mixed",
            originalUrl: "https://api.example.com/mixed-a",
            canonicalUrl: "https://api.example.com/mixed-a",
            urlHash: "hash-mixed-a",
            dedupeSignature: "api feed|mixed a|2026-04-10t11:00:00.000z",
            originalTitle: "Mixed Story A",
            translatedTitle: "混合来源 A",
            publishedAt: new Date("2026-04-10T11:00:00.000Z"),
            summaryText: "摘要 A",
            status: "processed",
            moderationStatus: "allowed",
            qualityScore: 75,
            qualityRationale: "质量稳定",
            language: "en",
          },
          {
            id: "item-mixed-source-b",
            sourceId: otherSource.id,
            clusterId: "cluster-mixed",
            originalUrl: "https://other.example.com/mixed-b",
            canonicalUrl: "https://other.example.com/mixed-b",
            urlHash: "hash-mixed-b",
            dedupeSignature: "other feed|mixed b|2026-04-10t10:30:00.000z",
            originalTitle: "Mixed Story B",
            translatedTitle: "混合来源 B",
            publishedAt: new Date("2026-04-10T10:30:00.000Z"),
            summaryText: "摘要 B",
            status: "processed",
            moderationStatus: "allowed",
            qualityScore: 71,
            qualityRationale: "质量稳定",
            language: "en",
          },
        ],
      });

      const { GET } = await import("@/app/api/feed/route");
      const response = await GET(
        new Request(`http://localhost/api/feed?range=7d&sourceId=${baseSource.id}`),
      );

      const json = await response.json();
      const downgradedEntry = json.items.find((entry: { id: string }) => entry.id === "item-mixed-source-a");

      expect(downgradedEntry).toMatchObject({
        type: "single",
        id: "item-mixed-source-a",
        title: "混合来源 A",
        sourceName: "API Feed",
        itemCount: 1,
        sourceCount: 1,
      });
      expect(json.items.find((entry: { id: string }) => entry.id === "cluster-mixed")).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });
});
