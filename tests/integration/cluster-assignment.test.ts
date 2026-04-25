import { beforeEach, describe, expect, it } from "vitest";

import { assignItemToCluster, mergeClusters } from "@/lib/clusters/service";
import { prisma } from "@/lib/db";
import { getAdminCluster } from "@/lib/feed/repository";

describe("cluster assignment", () => {
  beforeEach(async () => {
    await prisma.visitorClusterVote.deleteMany();
    await prisma.backgroundTaskRun.deleteMany();
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

  it("joins an active cluster with the same generated title even when fingerprints differ", async () => {
    const source = await prisma.source.create({
      data: {
        name: "Aggregating Feed",
        rssUrl: "https://title-match.example.com/feed.xml",
        siteUrl: "https://title-match.example.com",
        enabled: true,
        aiParsingEnabled: true,
        aggregationEnabled: true,
      },
    });
    await prisma.contentCluster.create({
      data: {
        id: "cluster-title-match",
        kind: "topic",
        title: "Acme 发布 Widget",
        summary: "已有聚合",
        score: 80,
        itemCount: 1,
        latestPublishedAt: new Date("2026-04-20T08:00:00.000Z"),
        status: "active",
        fingerprint: "legacy-fingerprint",
      },
    });
    await prisma.item.create({
      data: {
        id: "title-seed-item",
        sourceId: source.id,
        clusterId: "cluster-title-match",
        originalUrl: "https://title-match.example.com/seed",
        canonicalUrl: "https://title-match.example.com/seed",
        urlHash: "title-seed-hash",
        dedupeSignature: "title|seed",
        originalTitle: "Acme 发布 Widget",
        translatedTitle: "Acme 发布 Widget",
        publishedAt: new Date("2026-04-20T08:00:00.000Z"),
        summaryText: "已有条目",
        language: "zh",
        status: "processed",
        moderationStatus: "allowed",
        qualityScore: 80,
        qualityRationale: "relevant",
      },
    });
    const item = await prisma.item.create({
      data: {
        id: "title-new-item",
        sourceId: source.id,
        originalUrl: "https://title-match.example.com/new",
        canonicalUrl: "https://title-match.example.com/new",
        urlHash: "title-new-hash",
        dedupeSignature: "title|new",
        originalTitle: "Acme launches Widget",
        translatedTitle: "Acme 发布 Widget",
        publishedAt: new Date("2026-04-20T09:00:00.000Z"),
        summaryText: "新条目",
        language: "en",
        status: "processed",
        moderationStatus: "allowed",
        qualityScore: 82,
        qualityRationale: "relevant",
      },
    });

    const assignment = await assignItemToCluster(item.id, {
      eventSignature: {
        eventType: "launch",
        eventSubject: "Acme",
        eventAction: "发布",
        eventObject: "Widget",
        eventDate: "2026-04-20",
      },
    });

    expect(assignment.clusterId).toBe("cluster-title-match");
    expect(assignment.matchSource).toBe("exact_match");
    await expect(prisma.contentCluster.count()).resolves.toBe(1);
    await expect(prisma.item.findUnique({ where: { id: item.id } })).resolves.toMatchObject({
      clusterId: "cluster-title-match",
    });
  });

  it("deletes merged clusters, transfers their items and refreshes target counts", async () => {
    const source = await prisma.source.create({
      data: {
        name: "Merge Feed",
        rssUrl: "https://merge.example.com/feed.xml",
        siteUrl: "https://merge.example.com",
        enabled: true,
        aiParsingEnabled: true,
        aggregationEnabled: true,
      },
    });
    await prisma.contentCluster.createMany({
      data: [
        {
          id: "cluster-target",
          kind: "topic",
          title: "目标聚合",
          summary: "目标摘要",
          score: 70,
          itemCount: 1,
          latestPublishedAt: new Date("2026-04-20T10:00:00.000Z"),
          status: "active",
          fingerprint: "merge-target",
        },
        {
          id: "cluster-source",
          kind: "topic",
          title: "目标聚合",
          summary: "源摘要",
          score: 80,
          itemCount: 2,
          latestPublishedAt: new Date("2026-04-20T09:00:00.000Z"),
          status: "active",
          fingerprint: "merge-source",
        },
      ],
    });
    await prisma.item.createMany({
      data: [
        {
          id: "merge-target-item",
          sourceId: source.id,
          clusterId: "cluster-target",
          originalUrl: "https://merge.example.com/target",
          canonicalUrl: "https://merge.example.com/target",
          urlHash: "merge-target-hash",
          dedupeSignature: "merge|target",
          originalTitle: "目标条目",
          publishedAt: new Date("2026-04-20T10:00:00.000Z"),
          summaryText: "目标条目摘要",
          language: "zh",
          status: "processed",
          moderationStatus: "allowed",
          qualityScore: 70,
          qualityRationale: "relevant",
        },
        {
          id: "merge-source-item-1",
          sourceId: source.id,
          clusterId: "cluster-source",
          originalUrl: "https://merge.example.com/source-1",
          canonicalUrl: "https://merge.example.com/source-1",
          urlHash: "merge-source-hash-1",
          dedupeSignature: "merge|source-1",
          originalTitle: "源条目 1",
          publishedAt: new Date("2026-04-20T09:00:00.000Z"),
          summaryText: "源条目摘要 1",
          language: "zh",
          status: "processed",
          moderationStatus: "allowed",
          qualityScore: 82,
          qualityRationale: "relevant",
        },
        {
          id: "merge-source-item-2",
          sourceId: source.id,
          clusterId: "cluster-source",
          originalUrl: "https://merge.example.com/source-2",
          canonicalUrl: "https://merge.example.com/source-2",
          urlHash: "merge-source-hash-2",
          dedupeSignature: "merge|source-2",
          originalTitle: "源条目 2",
          publishedAt: new Date("2026-04-20T08:00:00.000Z"),
          summaryText: "源条目摘要 2",
          language: "zh",
          status: "processed",
          moderationStatus: "allowed",
          qualityScore: 78,
          qualityRationale: "relevant",
        },
      ],
    });

    const result = await mergeClusters("cluster-target", ["cluster-source"]);

    expect(result).toMatchObject({
      targetClusterId: "cluster-target",
      mergedClusterIds: ["cluster-source"],
      itemsMoved: 2,
    });
    await expect(prisma.contentCluster.findUnique({ where: { id: "cluster-source" } })).resolves.toBeNull();
    await expect(
      prisma.item.count({
        where: {
          id: { in: ["merge-target-item", "merge-source-item-1", "merge-source-item-2"] },
          clusterId: "cluster-target",
        },
      }),
    ).resolves.toBe(3);
    await expect(prisma.contentCluster.findUnique({ where: { id: "cluster-target" } })).resolves.toMatchObject({
      itemCount: 3,
      score: 82,
    });
    await expect(getAdminCluster("cluster-target")).resolves.toMatchObject({
      itemCount: 3,
    });
  });
});
