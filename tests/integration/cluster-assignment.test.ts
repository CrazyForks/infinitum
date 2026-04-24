import { beforeEach, describe, expect, it } from "vitest";

import { assignItemToCluster } from "@/lib/clusters/service";
import { prisma } from "@/lib/db";

describe("cluster assignment", () => {
  beforeEach(async () => {
    await prisma.visitorClusterVote.deleteMany();
    await prisma.item.deleteMany();
    await prisma.contentCluster.deleteMany();
    await prisma.source.deleteMany();
  });

  it("keeps sources with aggregation disabled out of cluster matching", async () => {
    const [aggregatingSource, isolatedSource] = await Promise.all([
      prisma.source.create({
        data: {
          name: "Aggregating Feed",
          rssUrl: "https://aggregating.example.com/feed.xml",
          siteUrl: "https://aggregating.example.com",
          enabled: true,
          aiParsingEnabled: true,
          aggregationEnabled: true,
        },
      }),
      prisma.source.create({
        data: {
          name: "Isolated Feed",
          rssUrl: "https://isolated.example.com/feed.xml",
          siteUrl: "https://isolated.example.com",
          enabled: true,
          aiParsingEnabled: true,
          aggregationEnabled: false,
        },
      }),
    ]);
    const eventSignature = {
      eventType: "release" as const,
      eventSubject: "Acme",
      eventAction: "发布",
      eventObject: "Widget",
      eventDate: "2026-04-20",
    };
    const baseItemData = {
      originalTitle: "Acme 发布 Widget",
      translatedTitle: "Acme 发布 Widget",
      author: null,
      publishedAt: new Date("2026-04-20T08:00:00.000Z"),
      rssExcerpt: "Acme 发布 Widget",
      rssContent: "Acme 发布 Widget",
      fullText: null,
      summaryText: "Acme 发布 Widget",
      language: "zh",
      status: "processed" as const,
      summaryStatus: "succeeded" as const,
      analysisStatus: "succeeded" as const,
      moderationStatus: "allowed" as const,
      qualityScore: 80,
      qualityRationale: "relevant",
      eventType: eventSignature.eventType,
      eventSubject: eventSignature.eventSubject,
      eventAction: eventSignature.eventAction,
      eventObject: eventSignature.eventObject,
      eventDate: eventSignature.eventDate,
    };

    const firstItem = await prisma.item.create({
      data: {
        ...baseItemData,
        sourceId: aggregatingSource.id,
        originalUrl: "https://aggregating.example.com/acme-widget",
        canonicalUrl: "https://aggregating.example.com/acme-widget",
        urlHash: "aggregating-acme-widget",
        dedupeSignature: "aggregating|acme-widget",
      },
    });
    const firstAssignment = await assignItemToCluster(firstItem.id, { eventSignature });
    const secondItem = await prisma.item.create({
      data: {
        ...baseItemData,
        sourceId: isolatedSource.id,
        originalUrl: "https://isolated.example.com/acme-widget",
        canonicalUrl: "https://isolated.example.com/acme-widget",
        urlHash: "isolated-acme-widget",
        dedupeSignature: "isolated|acme-widget",
      },
    });

    const secondAssignment = await assignItemToCluster(secondItem.id, { eventSignature });

    expect(secondAssignment.matchSource).toBeNull();
    expect(secondAssignment.createdNewCluster).toBe(true);
    expect(secondAssignment.clusterId).not.toBe(firstAssignment.clusterId);
    await expect(prisma.contentCluster.count()).resolves.toBe(2);
  });
});
