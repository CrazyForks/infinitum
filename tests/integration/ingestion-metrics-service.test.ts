import { beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import { getIngestionMetrics } from "@/lib/ingestion/metrics-service";

describe("ingestion metrics service", () => {
  beforeEach(async () => {
    await prisma.visitorClusterVote.deleteMany();
    await prisma.item.deleteMany();
    await prisma.contentCluster.deleteMany();
    await prisma.source.deleteMany();
  });

  it("builds the quality distribution from composite feed scores", async () => {
    const source = await prisma.source.create({
      data: {
        name: "Metrics Feed",
        rssUrl: "https://metrics.example.com/feed.xml",
        siteUrl: "https://metrics.example.com",
        enabled: true,
        aiParsingEnabled: true,
      },
    });

    await prisma.contentCluster.create({
      data: {
        id: "metrics-cluster",
        kind: "topic",
        title: "Metrics Cluster",
        summary: "Metrics summary",
        score: 90,
        itemCount: 2,
        latestPublishedAt: new Date("2026-04-29T10:00:00.000Z"),
        status: "active",
        fingerprint: "metrics-cluster",
      },
    });

    await prisma.item.createMany({
      data: [
        {
          id: "metrics-cluster-item-1",
          sourceId: source.id,
          clusterId: "metrics-cluster",
          originalUrl: "https://metrics.example.com/cluster-1",
          canonicalUrl: "https://metrics.example.com/cluster-1",
          urlHash: "hash-metrics-cluster-1",
          dedupeSignature: "metrics|cluster|1",
          originalTitle: "Cluster Item 1",
          publishedAt: new Date("2026-04-29T10:00:00.000Z"),
          status: "processed",
          moderationStatus: "allowed",
          qualityScore: 92,
          qualityRationale: "高质量",
          language: "en",
        },
        {
          id: "metrics-cluster-item-2",
          sourceId: source.id,
          clusterId: "metrics-cluster",
          originalUrl: "https://metrics.example.com/cluster-2",
          canonicalUrl: "https://metrics.example.com/cluster-2",
          urlHash: "hash-metrics-cluster-2",
          dedupeSignature: "metrics|cluster|2",
          originalTitle: "Cluster Item 2",
          publishedAt: new Date("2026-04-29T09:00:00.000Z"),
          status: "processed",
          moderationStatus: "allowed",
          qualityScore: 88,
          qualityRationale: "高质量",
          language: "en",
        },
        {
          id: "metrics-single-high",
          sourceId: source.id,
          originalUrl: "https://metrics.example.com/single-high",
          canonicalUrl: "https://metrics.example.com/single-high",
          urlHash: "hash-metrics-single-high",
          dedupeSignature: "metrics|single|high",
          originalTitle: "Single High",
          publishedAt: new Date("2026-04-29T08:00:00.000Z"),
          status: "processed",
          moderationStatus: "allowed",
          qualityScore: 98,
          qualityRationale: "非常高质量",
          language: "en",
        },
        {
          id: "metrics-single-mid",
          sourceId: source.id,
          originalUrl: "https://metrics.example.com/single-mid",
          canonicalUrl: "https://metrics.example.com/single-mid",
          urlHash: "hash-metrics-single-mid",
          dedupeSignature: "metrics|single|mid",
          originalTitle: "Single Mid",
          publishedAt: new Date("2026-04-29T07:00:00.000Z"),
          status: "processed",
          moderationStatus: "allowed",
          qualityScore: 75,
          qualityRationale: "中高质量",
          language: "en",
        },
      ],
    });

    const metrics = await getIngestionMetrics(1);
    const countByRange = new Map(metrics.qualityScoreDistribution.map((bucket) => [bucket.range, bucket.count]));

    expect(countByRange.get("70-79")).toBe(1);
    expect(countByRange.get("80-89")).toBe(2);
    expect(countByRange.get("90-100")).toBe(0);
  });
});
