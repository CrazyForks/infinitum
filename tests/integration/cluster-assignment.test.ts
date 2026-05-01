import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AiProvider } from "@/lib/ai/provider";
import {
  assignItemToCluster,
  detachItemFromCluster,
  executeClusterMerge,
  mergeClusters,
  mergeSelectedItemsToLargestCluster,
} from "@/lib/clusters/service";
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

  it("merges selected items into the largest selected cluster without moving unselected siblings", async () => {
    const source = await prisma.source.create({
      data: {
        name: "Batch Merge Feed",
        rssUrl: "https://batch-merge.example.com/feed.xml",
        siteUrl: "https://batch-merge.example.com",
        enabled: true,
        aiParsingEnabled: true,
        aggregationEnabled: true,
      },
    });
    await prisma.contentCluster.createMany({
      data: [
        {
          id: "batch-target",
          kind: "topic",
          title: "目标大聚合",
          summary: "目标摘要",
          score: 80,
          itemCount: 3,
          latestPublishedAt: new Date("2026-04-20T10:00:00.000Z"),
          status: "active",
          fingerprint: "batch-target",
        },
        {
          id: "batch-source",
          kind: "topic",
          title: "来源聚合",
          summary: "来源摘要",
          score: 75,
          itemCount: 2,
          latestPublishedAt: new Date("2026-04-20T09:00:00.000Z"),
          status: "active",
          fingerprint: "batch-source",
        },
      ],
    });
    await prisma.item.createMany({
      data: [
        {
          id: "batch-target-item",
          sourceId: source.id,
          clusterId: "batch-target",
          originalUrl: "https://batch-merge.example.com/target",
          canonicalUrl: "https://batch-merge.example.com/target",
          urlHash: "batch-target-hash",
          dedupeSignature: "batch|target",
          originalTitle: "目标条目",
          publishedAt: new Date("2026-04-20T10:00:00.000Z"),
          summaryText: "目标条目摘要",
          language: "zh",
          status: "processed",
          moderationStatus: "allowed",
          qualityScore: 80,
          qualityRationale: "relevant",
        },
        {
          id: "batch-source-selected",
          sourceId: source.id,
          clusterId: "batch-source",
          originalUrl: "https://batch-merge.example.com/source-selected",
          canonicalUrl: "https://batch-merge.example.com/source-selected",
          urlHash: "batch-source-selected-hash",
          dedupeSignature: "batch|source-selected",
          originalTitle: "选中来源条目",
          publishedAt: new Date("2026-04-20T09:00:00.000Z"),
          summaryText: "选中来源摘要",
          language: "zh",
          status: "processed",
          moderationStatus: "allowed",
          qualityScore: 75,
          qualityRationale: "relevant",
        },
        {
          id: "batch-source-unselected",
          sourceId: source.id,
          clusterId: "batch-source",
          originalUrl: "https://batch-merge.example.com/source-unselected",
          canonicalUrl: "https://batch-merge.example.com/source-unselected",
          urlHash: "batch-source-unselected-hash",
          dedupeSignature: "batch|source-unselected",
          originalTitle: "未选中来源条目",
          publishedAt: new Date("2026-04-20T08:00:00.000Z"),
          summaryText: "未选中来源摘要",
          language: "zh",
          status: "processed",
          moderationStatus: "allowed",
          qualityScore: 74,
          qualityRationale: "relevant",
        },
      ],
    });

    const result = await mergeSelectedItemsToLargestCluster(["batch-target-item", "batch-source-selected"]);

    expect(result).toMatchObject({
      targetClusterId: "batch-target",
      movedItemIds: ["batch-source-selected"],
      itemsMoved: 1,
    });
    await expect(prisma.item.findUnique({ where: { id: "batch-source-selected" } })).resolves.toMatchObject({
      clusterId: "batch-target",
      manualClusterAssignedAt: expect.any(Date),
    });
    await expect(prisma.item.findUnique({ where: { id: "batch-source-unselected" } })).resolves.toMatchObject({
      clusterId: "batch-source",
    });
    await expect(prisma.contentCluster.findUnique({ where: { id: "batch-target" } })).resolves.toMatchObject({
      itemCount: 2,
    });
    await expect(prisma.contentCluster.findUnique({ where: { id: "batch-source" } })).resolves.toMatchObject({
      itemCount: 1,
    });
  });

  it("keeps a detached item in a singleton cluster so it can enter later merge passes", async () => {
    const source = await prisma.source.create({
      data: {
        name: "Detach Feed",
        rssUrl: "https://detach.example.com/feed.xml",
        siteUrl: "https://detach.example.com",
        enabled: true,
        aiParsingEnabled: true,
        aggregationEnabled: true,
      },
    });
    await prisma.contentCluster.create({
      data: {
        id: "detach-cluster",
        kind: "topic",
        title: "OpenAI 发布 Stargate 算力计划",
        summary: "OpenAI 发布 Stargate 算力基础设施计划。",
        score: 85,
        itemCount: 2,
        latestPublishedAt: new Date("2026-04-20T10:00:00.000Z"),
        status: "active",
        fingerprint: "detach-cluster",
      },
    });
    await prisma.item.createMany({
      data: [
        {
          id: "detach-target-item",
          sourceId: source.id,
          clusterId: "detach-cluster",
          originalUrl: "https://detach.example.com/target",
          canonicalUrl: "https://detach.example.com/target",
          urlHash: "detach-target-hash",
          dedupeSignature: "detach|target",
          originalTitle: "OpenAI 调整星际之门计划",
          publishedAt: new Date("2026-04-20T10:00:00.000Z"),
          summaryText: "OpenAI 调整星际之门计划和算力基础设施布局。",
          language: "zh",
          status: "processed",
          moderationStatus: "allowed",
          qualityScore: 85,
          qualityRationale: "relevant",
          eventType: "other",
          eventSubject: "OpenAI",
          eventAction: "调整战略",
          eventObject: "星际之门计划",
        },
        {
          id: "detach-sibling-item",
          sourceId: source.id,
          clusterId: "detach-cluster",
          originalUrl: "https://detach.example.com/sibling",
          canonicalUrl: "https://detach.example.com/sibling",
          urlHash: "detach-sibling-hash",
          dedupeSignature: "detach|sibling",
          originalTitle: "OpenAI 发布 Stargate 算力计划",
          publishedAt: new Date("2026-04-20T09:00:00.000Z"),
          summaryText: "OpenAI 发布 Stargate 算力基础设施计划。",
          language: "zh",
          status: "processed",
          moderationStatus: "allowed",
          qualityScore: 82,
          qualityRationale: "relevant",
          eventType: "release",
          eventSubject: "OpenAI",
          eventAction: "发布",
          eventObject: "Stargate算力基础设施计划",
        },
      ],
    });

    await detachItemFromCluster("detach-target-item");

    const detached = await prisma.item.findUniqueOrThrow({ where: { id: "detach-target-item" } });
    expect(detached.clusterId).toBeTruthy();
    expect(detached.clusterId).not.toBe("detach-cluster");
    await expect(prisma.contentCluster.findUnique({ where: { id: detached.clusterId! } })).resolves.toMatchObject({
      fingerprint: "single-detach-target-item",
      itemCount: 1,
      eventSubject: "OpenAI",
      eventObject: "星际之门计划",
    });
    await expect(prisma.contentCluster.findUnique({ where: { id: "detach-cluster" } })).resolves.toMatchObject({
      itemCount: 1,
    });
  });

  it("sends multi-subject singleton merge candidates to AI and merges the selected group", async () => {
    const source = await prisma.source.create({
      data: {
        name: "Singleton Merge Feed",
        rssUrl: "https://singleton-merge.example.com/feed.xml",
        siteUrl: "https://singleton-merge.example.com",
        enabled: true,
        aiParsingEnabled: true,
        aggregationEnabled: true,
      },
    });
    await prisma.contentCluster.createMany({
      data: [
        {
          id: "openai-contract-cluster",
          kind: "topic",
          title: "OpenAI 与微软调整合作合同",
          summary: "OpenAI 和微软调整云服务合作合同条款。",
          score: 84,
          itemCount: 1,
          latestPublishedAt: new Date("2026-04-20T09:00:00.000Z"),
          status: "active",
          fingerprint: "openai-contract",
          eventType: "partnership",
          eventSubject: "OpenAI",
          eventAction: "变更",
          eventObject: "微软合同",
          eventDate: "2026-04-20",
        },
        {
          id: "microsoft-contract-cluster",
          kind: "topic",
          title: "微软和 OpenAI 调整合作协议",
          summary: "微软与 OpenAI 对合作合同进行变更。",
          score: 86,
          itemCount: 1,
          latestPublishedAt: new Date("2026-04-20T10:00:00.000Z"),
          status: "active",
          fingerprint: "microsoft-contract",
          eventType: "partnership",
          eventSubject: "微软",
          eventAction: "变更",
          eventObject: "OpenAI 合同",
          eventDate: "2026-04-20",
        },
      ],
    });
    await prisma.item.createMany({
      data: [
        {
          id: "openai-contract-item",
          sourceId: source.id,
          clusterId: "openai-contract-cluster",
          originalUrl: "https://singleton-merge.example.com/openai-contract",
          canonicalUrl: "https://singleton-merge.example.com/openai-contract",
          urlHash: "openai-contract-hash",
          dedupeSignature: "contract|openai",
          originalTitle: "OpenAI 与微软调整合作合同",
          publishedAt: new Date("2026-04-20T09:00:00.000Z"),
          summaryText: "OpenAI 和微软调整云服务合作合同条款。",
          language: "zh",
          status: "processed",
          moderationStatus: "allowed",
          qualityScore: 84,
          qualityRationale: "relevant",
          eventType: "partnership",
          eventSubject: "OpenAI",
          eventAction: "变更",
          eventObject: "微软合同",
          eventDate: "2026-04-20",
        },
        {
          id: "microsoft-contract-item",
          sourceId: source.id,
          clusterId: "microsoft-contract-cluster",
          originalUrl: "https://singleton-merge.example.com/microsoft-contract",
          canonicalUrl: "https://singleton-merge.example.com/microsoft-contract",
          urlHash: "microsoft-contract-hash",
          dedupeSignature: "contract|microsoft",
          originalTitle: "微软和 OpenAI 调整合作协议",
          publishedAt: new Date("2026-04-20T10:00:00.000Z"),
          summaryText: "微软与 OpenAI 对合作合同进行变更。",
          language: "zh",
          status: "processed",
          moderationStatus: "allowed",
          qualityScore: 86,
          qualityRationale: "relevant",
          eventType: "partnership",
          eventSubject: "微软",
          eventAction: "变更",
          eventObject: "OpenAI 合同",
          eventDate: "2026-04-20",
        },
      ],
    });
    const mergeClustersAi = vi.fn().mockImplementation(async (clustersJson: string) => {
      const clusters = JSON.parse(clustersJson) as Array<{ id: string }>;

      expect(clusters.map((cluster) => cluster.id).sort()).toEqual([
        "microsoft-contract-cluster",
        "openai-contract-cluster",
      ]);

      return [["openai-contract-cluster", "microsoft-contract-cluster"]];
    });
    const aiProvider = {
      mergeClusters: mergeClustersAi,
    } as unknown as AiProvider;

    const result = await executeClusterMerge(aiProvider, new Date("2026-04-21T10:00:00.000Z"));

    expect(result).toMatchObject({
      candidates: 2,
      skipped: false,
      mergedCount: 1,
      affectedClusterIds: ["openai-contract-cluster"],
    });
    expect(mergeClustersAi).toHaveBeenCalledTimes(1);
    await expect(prisma.contentCluster.findUnique({ where: { id: "microsoft-contract-cluster" } })).resolves.toBeNull();
    await expect(
      prisma.item.count({
        where: {
          clusterId: "openai-contract-cluster",
          id: { in: ["openai-contract-item", "microsoft-contract-item"] },
        },
      }),
    ).resolves.toBe(2);
  });

  it("does not send singleton merge candidates to AI when key objects conflict", async () => {
    const source = await prisma.source.create({
      data: {
        name: "Object Conflict Feed",
        rssUrl: "https://object-conflict.example.com/feed.xml",
        siteUrl: "https://object-conflict.example.com",
        enabled: true,
        aiParsingEnabled: true,
        aggregationEnabled: true,
      },
    });
    await prisma.contentCluster.createMany({
      data: [
        {
          id: "product-a-cluster",
          kind: "topic",
          title: "Acme 发布产品 A",
          summary: "Acme 发布产品 A。",
          score: 80,
          itemCount: 1,
          latestPublishedAt: new Date("2026-04-20T09:00:00.000Z"),
          status: "active",
          fingerprint: "product-a",
          eventType: "launch",
          eventSubject: "Acme",
          eventAction: "发布",
          eventObject: "产品 A",
          eventDate: "2026-04-20",
        },
        {
          id: "product-b-cluster",
          kind: "topic",
          title: "Acme 发布产品 B",
          summary: "Acme 发布产品 B。",
          score: 80,
          itemCount: 1,
          latestPublishedAt: new Date("2026-04-20T10:00:00.000Z"),
          status: "active",
          fingerprint: "product-b",
          eventType: "launch",
          eventSubject: "Acme",
          eventAction: "发布",
          eventObject: "产品 B",
          eventDate: "2026-04-20",
        },
      ],
    });
    await prisma.item.createMany({
      data: [
        {
          id: "product-a-item",
          sourceId: source.id,
          clusterId: "product-a-cluster",
          originalUrl: "https://object-conflict.example.com/product-a",
          canonicalUrl: "https://object-conflict.example.com/product-a",
          urlHash: "product-a-hash",
          dedupeSignature: "product|a",
          originalTitle: "Acme 发布产品 A",
          publishedAt: new Date("2026-04-20T09:00:00.000Z"),
          summaryText: "Acme 发布产品 A。",
          language: "zh",
          status: "processed",
          moderationStatus: "allowed",
          qualityScore: 80,
          qualityRationale: "relevant",
          eventType: "launch",
          eventSubject: "Acme",
          eventAction: "发布",
          eventObject: "产品 A",
          eventDate: "2026-04-20",
        },
        {
          id: "product-b-item",
          sourceId: source.id,
          clusterId: "product-b-cluster",
          originalUrl: "https://object-conflict.example.com/product-b",
          canonicalUrl: "https://object-conflict.example.com/product-b",
          urlHash: "product-b-hash",
          dedupeSignature: "product|b",
          originalTitle: "Acme 发布产品 B",
          publishedAt: new Date("2026-04-20T10:00:00.000Z"),
          summaryText: "Acme 发布产品 B。",
          language: "zh",
          status: "processed",
          moderationStatus: "allowed",
          qualityScore: 80,
          qualityRationale: "relevant",
          eventType: "launch",
          eventSubject: "Acme",
          eventAction: "发布",
          eventObject: "产品 B",
          eventDate: "2026-04-20",
        },
      ],
    });
    const mergeClustersAi = vi.fn();
    const aiProvider = {
      mergeClusters: mergeClustersAi,
    } as unknown as AiProvider;

    const result = await executeClusterMerge(aiProvider, new Date("2026-04-21T10:00:00.000Z"));

    expect(result).toMatchObject({
      candidates: 0,
      skipped: true,
      mergedCount: 0,
      affectedClusterIds: [],
    });
    expect(mergeClustersAi).not.toHaveBeenCalled();
  });
});
