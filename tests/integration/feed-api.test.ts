import { beforeEach, describe, expect, it, vi } from "vitest";

import { prisma } from "@/lib/db";

describe("/api/feed", () => {
  beforeEach(async () => {
    await prisma.item.deleteMany();
    await prisma.contentCluster.deleteMany();
    await prisma.fetchRun.deleteMany();
    await prisma.source.deleteMany();

    const source = await prisma.source.create({
      data: {
        name: "API Feed",
        rssUrl: "https://api.example.com/feed.xml",
        siteUrl: "https://api.example.com",
        enabled: true,
        fetchFullTextWhenMissing: true,
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

    expect(json.items).toHaveLength(3);
    expect(json.items[0]).toMatchObject({
      type: "cluster",
      id: "cluster-a",
      title: "OpenAI Agent 发布",
      itemCount: 2,
      score: 90,
    });
    expect(json.items[1]).toMatchObject({
      type: "single",
      id: "item-b1",
      title: "故事 B",
      itemCount: 1,
      score: 62,
    });
    expect(json.items[2]).toMatchObject({
      type: "single",
      id: "item-c1",
      title: "故事 C1",
      itemCount: 1,
      score: 98,
    });
    expect(json.sort).toBe("time_desc");

    vi.useRealTimers();
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

  it("sorts the mixed feed by score when requested", async () => {
    const { GET } = await import("@/app/api/feed/route");
    const response = await GET(new Request("http://localhost/api/feed?range=7d&sort=score_desc"));

    const json = await response.json();

    expect(json.items).toHaveLength(3);
    expect(json.items[0]).toMatchObject({
      type: "single",
      id: "item-c1",
      score: 98,
    });
    expect(json.items[1]).toMatchObject({
      type: "cluster",
      id: "cluster-a",
      score: 90,
    });
    expect(json.items[2]).toMatchObject({
      type: "single",
      id: "item-b1",
      score: 62,
    });
    expect(json.sort).toBe("score_desc");
  });
});
