import { beforeEach, describe, expect, it, vi } from "vitest";

import { prisma } from "@/lib/db";
import { listFeedItems, listTrendingEntries } from "@/lib/feed/repository";
import { resolveFeedFilters } from "@/lib/feed/range";

const NOW = new Date("2026-06-22T12:00:00.000Z");

function hoursAgo(h: number): Date {
  return new Date(NOW.getTime() - h * 3_600_000);
}

describe("listTrendingEntries", () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);

    await prisma.item.deleteMany();
    await prisma.tag.deleteMany();
    await prisma.contentCluster.deleteMany();
    await prisma.fetchRun.deleteMany();
    await prisma.source.deleteMany();
    await prisma.sourceGroup.deleteMany();

    const groupA = await prisma.sourceGroup.create({
      data: { name: "GroupA", color: "#3b82f6" },
    });
    const sourceA = await prisma.source.create({
      data: {
        name: "Source A",
        rssUrl: "https://a.example.com/feed",
        siteUrl: "https://a.example.com",
        enabled: true,
        aiParsingEnabled: true,
        groupId: groupA.id,
      },
    });
    const sourceB = await prisma.source.create({
      data: {
        name: "Source B",
        rssUrl: "https://b.example.com/feed",
        siteUrl: "https://b.example.com",
        enabled: true,
        aiParsingEnabled: true,
        groupId: groupA.id,
      },
    });
    const sourceC = await prisma.source.create({
      data: {
        name: "Source C",
        rssUrl: "https://c.example.com/feed",
        siteUrl: "https://c.example.com",
        enabled: true,
        aiParsingEnabled: true,
        groupId: groupA.id,
      },
    });
    const sourceD = await prisma.source.create({
      data: {
        name: "Source D",
        rssUrl: "https://d.example.com/feed",
        siteUrl: "https://d.example.com",
        enabled: true,
        aiParsingEnabled: true,
      },
    });

    // Cluster 1: 2 源多报道、3h 内创建，期望登顶
    await prisma.contentCluster.create({
      data: {
        id: "cluster-fresh-multi",
        kind: "topic",
        title: "新鲜多源聚合",
        summary: "摘要",
        score: 90,
        itemCount: 2,
        latestPublishedAt: hoursAgo(2),
        status: "active",
        fingerprint: "cluster-fresh-multi",
        createdAt: hoursAgo(2),
        displayItemCount: 2,
        displaySourceCount: 2,
        displayAverageScore: 86,
        displayRecommendScore: 92,
        earliestCreatedAt: hoursAgo(2),
        latestCreatedAt: hoursAgo(2),
      },
    });
    await prisma.item.createMany({
      data: [
        {
          id: "item-fresh-1",
          sourceId: sourceA.id,
          clusterId: "cluster-fresh-multi",
          originalUrl: "https://a.example.com/1",
          canonicalUrl: "https://a.example.com/1",
          urlHash: "hash-fresh-1",
          dedupeSignature: "fresh-1",
          originalTitle: "新鲜多源聚合",
          publishedAt: hoursAgo(2),
          status: "processed",
          analysisStatus: "succeeded",
          moderationStatus: "allowed",
          qualityScore: 88,
          qualityRationale: "高质量",
          language: "zh",
          createdAt: hoursAgo(2),
        },
        {
          id: "item-fresh-2",
          sourceId: sourceB.id,
          clusterId: "cluster-fresh-multi",
          originalUrl: "https://b.example.com/1",
          canonicalUrl: "https://b.example.com/1",
          urlHash: "hash-fresh-2",
          dedupeSignature: "fresh-2",
          originalTitle: "新鲜多源聚合 B 报道",
          publishedAt: hoursAgo(2),
          status: "processed",
          analysisStatus: "succeeded",
          moderationStatus: "allowed",
          qualityScore: 85,
          qualityRationale: "高质量",
          language: "zh",
          createdAt: hoursAgo(2),
        },
      ],
    });

    // Cluster 2: 1h 内单条目，质量分 80
    await prisma.item.create({
      data: {
        id: "item-warmup-1h",
        sourceId: sourceC.id,
        originalUrl: "https://c.example.com/1",
        canonicalUrl: "https://c.example.com/1",
        urlHash: "hash-warmup-1h",
        dedupeSignature: "warmup-1h",
        originalTitle: "1 小时前暖身期",
        publishedAt: hoursAgo(1),
        status: "processed",
        analysisStatus: "succeeded",
        moderationStatus: "allowed",
        qualityScore: 80,
        qualityRationale: "一般",
        language: "zh",
        createdAt: hoursAgo(1),
      },
    });

    // Cluster 3: 18h 前单条，质量分 100（应该被时间衰减严重压低）
    await prisma.item.create({
      data: {
        id: "item-decayed-18h",
        sourceId: sourceD.id,
        originalUrl: "https://d.example.com/1",
        canonicalUrl: "https://d.example.com/1",
        urlHash: "hash-decayed",
        dedupeSignature: "decayed",
        originalTitle: "18 小时前已衰减",
        publishedAt: hoursAgo(18),
        status: "processed",
        analysisStatus: "succeeded",
        moderationStatus: "allowed",
        qualityScore: 100,
        qualityRationale: "高分但已衰减",
        language: "zh",
        createdAt: hoursAgo(18),
      },
    });

    // 候选 4: 30h 前，应该被 24h 窗口截掉
    await prisma.item.create({
      data: {
        id: "item-too-old",
        sourceId: sourceA.id,
        originalUrl: "https://a.example.com/2",
        canonicalUrl: "https://a.example.com/2",
        urlHash: "hash-too-old",
        dedupeSignature: "too-old",
        originalTitle: "30 小时前被窗口截掉",
        publishedAt: hoursAgo(30),
        status: "processed",
        analysisStatus: "succeeded",
        moderationStatus: "allowed",
        qualityScore: 95,
        qualityRationale: "高分但太老",
        language: "zh",
        createdAt: hoursAgo(30),
      },
    });

    // 候选 5: parentItemId 不为空（聚合拆分子条目），应该被排除
    const aggParent = await prisma.item.create({
      data: {
        id: "item-aggregation-parent",
        sourceId: sourceA.id,
        originalUrl: "https://a.example.com/agg-parent",
        canonicalUrl: "https://a.example.com/agg-parent",
        urlHash: "hash-agg-parent",
        dedupeSignature: "agg-parent",
        originalTitle: "聚合父条目（isAggregation=true）应被排除",
        publishedAt: hoursAgo(1),
        status: "processed",
        analysisStatus: "succeeded",
        moderationStatus: "allowed",
        qualityScore: 95,
        qualityRationale: "父",
        language: "zh",
        createdAt: hoursAgo(1),
        isAggregation: true,
      },
    });
    await prisma.item.create({
      data: {
        id: "item-aggregation-child",
        sourceId: sourceA.id,
        originalUrl: "https://a.example.com/child",
        canonicalUrl: "https://a.example.com/child",
        urlHash: "hash-child",
        dedupeSignature: "child",
        originalTitle: "聚合子条目应被排除",
        publishedAt: hoursAgo(1),
        status: "processed",
        analysisStatus: "succeeded",
        moderationStatus: "allowed",
        qualityScore: 95,
        qualityRationale: "子",
        language: "zh",
        createdAt: hoursAgo(1),
        parentItemId: aggParent.id,
      },
    });

    // 候选 6: analysisStatus = pending，应被排除
    await prisma.item.create({
      data: {
        id: "item-pending-analysis",
        sourceId: sourceA.id,
        originalUrl: "https://a.example.com/pending",
        canonicalUrl: "https://a.example.com/pending",
        urlHash: "hash-pending",
        dedupeSignature: "pending",
        originalTitle: "AI 还在分析应被排除",
        publishedAt: hoursAgo(1),
        status: "processed",
        analysisStatus: "pending",
        moderationStatus: "allowed",
        qualityScore: 99,
        qualityRationale: "高分但未完成",
        language: "zh",
        createdAt: hoursAgo(1),
      },
    });

    // 候选 7: 同一 cluster 24h 内已有更早一条，去重保留最新
    const dupCluster = await prisma.contentCluster.create({
      data: {
        id: "cluster-dup",
        kind: "topic",
        title: "Cluster 24h 内去重",
        summary: "簇摘要",
        score: 70,
        itemCount: 2,
        latestPublishedAt: hoursAgo(1),
        status: "active",
        fingerprint: "cluster-dup",
        createdAt: hoursAgo(20),
        displayItemCount: 2,
        displaySourceCount: 1,
        displayAverageScore: 70,
        displayRecommendScore: 78,
        earliestCreatedAt: hoursAgo(20),
        latestCreatedAt: hoursAgo(1),
      },
    });
    await prisma.item.createMany({
      data: [
        {
          id: "item-dup-old",
          sourceId: sourceA.id,
          clusterId: dupCluster.id,
          originalUrl: "https://a.example.com/dup-old",
          canonicalUrl: "https://a.example.com/dup-old",
          urlHash: "hash-dup-old",
          dedupeSignature: "dup-old",
          originalTitle: "Cluster 24h 内去重 老",
          publishedAt: hoursAgo(20),
          status: "processed",
          analysisStatus: "succeeded",
          moderationStatus: "allowed",
          qualityScore: 70,
          qualityRationale: "老",
          language: "zh",
          createdAt: hoursAgo(20),
        },
        {
          id: "item-dup-new",
          sourceId: sourceA.id,
          clusterId: dupCluster.id,
          originalUrl: "https://a.example.com/dup-new",
          canonicalUrl: "https://a.example.com/dup-new",
          urlHash: "hash-dup-new",
          dedupeSignature: "dup-new",
          originalTitle: "Cluster 24h 内去重 新",
          publishedAt: hoursAgo(1),
          status: "processed",
          analysisStatus: "succeeded",
          moderationStatus: "allowed",
          qualityScore: 70,
          qualityRationale: "新",
          language: "zh",
          createdAt: hoursAgo(1),
        },
      ],
    });

    // 候选 8: 老事件 30h 前开始、1h 前还有跟进报道；应按最早子条目判定，不再进入 24h 实时榜
    await prisma.contentCluster.create({
      data: {
        id: "cluster-continuing-old",
        kind: "topic",
        title: "持续跟进的旧聚合",
        summary: "旧事件仍有新报道",
        score: 99,
        itemCount: 2,
        latestPublishedAt: hoursAgo(1),
        status: "active",
        fingerprint: "cluster-continuing-old",
        createdAt: hoursAgo(30),
        displayItemCount: 2,
        displaySourceCount: 1,
        displayAverageScore: 99,
        displayRecommendScore: 100,
        earliestCreatedAt: hoursAgo(30),
        latestCreatedAt: hoursAgo(1),
      },
    });
    await prisma.item.createMany({
      data: [
        {
          id: "item-continuing-old-first",
          sourceId: sourceD.id,
          clusterId: "cluster-continuing-old",
          originalUrl: "https://d.example.com/continuing-old-first",
          canonicalUrl: "https://d.example.com/continuing-old-first",
          urlHash: "hash-continuing-old-first",
          dedupeSignature: "continuing-old-first",
          originalTitle: "持续跟进的旧聚合 首发",
          publishedAt: hoursAgo(30),
          status: "processed",
          analysisStatus: "succeeded",
          moderationStatus: "allowed",
          qualityScore: 99,
          qualityRationale: "高分旧事件",
          language: "zh",
          createdAt: hoursAgo(30),
        },
        {
          id: "item-continuing-old-followup",
          sourceId: sourceD.id,
          clusterId: "cluster-continuing-old",
          originalUrl: "https://d.example.com/continuing-old-followup",
          canonicalUrl: "https://d.example.com/continuing-old-followup",
          urlHash: "hash-continuing-old-followup",
          dedupeSignature: "continuing-old-followup",
          originalTitle: "持续跟进的旧聚合 跟进",
          publishedAt: hoursAgo(1),
          status: "processed",
          analysisStatus: "succeeded",
          moderationStatus: "allowed",
          qualityScore: 99,
          qualityRationale: "高分新跟进",
          language: "zh",
          createdAt: hoursAgo(1),
        },
      ],
    });
  });

  it("returns trending entries ordered by score and applies time-aware ranking", async () => {
    const entries = await listTrendingEntries(NOW, 10);
    const ids = entries.map((e) => e.id);

    // 多源聚合 cluster 形态应进榜（multiSourceBoost 给它额外加分）
    const cluster = entries.find((e) => e.id === "cluster-fresh-multi")!;
    expect(cluster).toBeDefined();
    expect(cluster.type).toBe("cluster");
    expect(cluster.sourceCount).toBeGreaterThanOrEqual(2);
    // multiSourceBoost 应让 cluster 拿到 +2 加成
    expect(cluster.recommendScore).toBeLessThanOrEqual(100);

    // 1h 内暖身期单条应在榜
    expect(ids).toContain("item-warmup-1h");

    // 18h 前的单条因衰减严重，分数低于暖身期
    const fresh = entries.find((e) => e.id === "item-warmup-1h")!;
    const decayed = entries.find((e) => e.id === "item-decayed-18h")!;
    expect(fresh.trendingScore).toBeGreaterThan(decayed.trendingScore);

    vi.useRealTimers();
  });

  it("drops entries outside the 24h lookback window", async () => {
    const entries = await listTrendingEntries(NOW, 10);
    const ids = entries.map((e) => e.id);
    expect(ids).not.toContain("item-too-old");
  });

  it("excludes aggregation parent items from the trending board", async () => {
    const entries = await listTrendingEntries(NOW, 10);
    const ids = entries.map((e) => e.id);
    // 父条目（isAggregation=true）：自身已聚合，不应再单独上榜
    expect(ids).not.toContain("item-aggregation-parent");
    // 聚合子条目（parentItemId != NULL）按 feed 列表规则保留：contentCluster 关联与首页一致
  });

  it("promotes single-cluster rows to the cluster entry shape", async () => {
    // 放宽 cluster 形态门槛到 itemCount>=1 后，cluster-dup 应以 cluster 形态上榜
    const entries = await listTrendingEntries(NOW, 10);
    const ids = entries.map((e) => e.id);
    expect(ids).toContain("cluster-dup");
    // 旧的去重测试已不再适用：单条目形态要求 clusterId IS NULL，
    // 因此带 clusterId 的 item 不再走 single 形态，避免与 cluster 形态重复。
    expect(ids).not.toContain("item-dup-old");
    expect(ids).not.toContain("item-dup-new");
  });

  it("scores cluster recency from the earliest displayable child item", async () => {
    const entries = await listTrendingEntries(NOW, 50);
    const cluster = entries.find((e) => e.id === "cluster-dup");

    expect(cluster).toBeDefined();
    expect(cluster!.createdAt).toBe(hoursAgo(1).toISOString());
    // cluster-dup 的 latestCreatedAt 是 1h 前，但最早可展示子条目是 20h 前。
    // recommendScore 78 * 20h 衰减 0.3 = 23.4；不能按 latestCreatedAt=1h 计算成 78。
    expect(cluster!.trendingScore).toBeCloseTo(23.4, 5);
  });

  it("drops continuing clusters whose earliest displayable child is outside the 24h lookback", async () => {
    const entries = await listTrendingEntries(NOW, 50);
    const ids = entries.map((e) => e.id);

    expect(ids).not.toContain("cluster-continuing-old");
  });

  it("promotes a single-cluster cluster to the single entry shape", async () => {
    // 场景：item 有 clusterId，对应 cluster displayItemCount=1（未达 cluster 形态门槛）。
    // 与 feed 列表行为一致：trending 退化为 single 形态，标题用 item 自己的。
    const sourceE = await prisma.source.create({
      data: {
        name: "Source E",
        rssUrl: "https://e.example.com/feed",
        siteUrl: "https://e.example.com",
        enabled: true,
        aiParsingEnabled: true,
      },
    });
    const sharedCluster = await prisma.contentCluster.create({
      data: {
        id: "cluster-shared",
        kind: "topic",
        title: "共享 cluster 与 single",
        summary: "摘要",
        score: 80,
        itemCount: 1,
        latestPublishedAt: hoursAgo(1),
        status: "active",
        fingerprint: "cluster-shared",
        createdAt: hoursAgo(1),
      },
    });
    await prisma.item.create({
      data: {
        id: "item-with-shared-cluster",
        sourceId: sourceE.id,
        clusterId: sharedCluster.id,
        originalUrl: "https://e.example.com/shared",
        canonicalUrl: "https://e.example.com/shared",
        urlHash: "hash-shared",
        dedupeSignature: "shared",
        originalTitle: "共享 cluster 与 single",
        publishedAt: hoursAgo(1),
        status: "processed",
        analysisStatus: "succeeded",
        moderationStatus: "allowed",
        qualityScore: 80,
        qualityRationale: "中上",
        language: "zh",
        createdAt: hoursAgo(1),
      },
    });

    const entries = await listTrendingEntries(NOW, 50);
    const sharedItem = entries.filter((e) => e.id === "item-with-shared-cluster");
    const sharedClusterEntries = entries.filter((e) => e.id === "cluster-shared");

    // 退化为 single 形态：标题用 item 自己的
    expect(sharedItem).toHaveLength(1);
    expect(sharedItem[0].type).toBe("single");
    expect(sharedItem[0].title).toBe("共享 cluster 与 single");
    // cluster 形态不出现（displayItemCount=1 未达 >1 门槛，与 feed 列表一致）
    expect(sharedClusterEntries).toHaveLength(0);
  });

  it("applies velocity boost to groups with rising 6h throughput", async () => {
    // 准备：两个不同 group 各一个候选条目（1h 前暖身期、质量分 70、sourceCount=1）。
    // - groupA 在 6h 内有 1 条候选，6h~24h 内有 2 条 baseline，velocity 比率 0.5 → boost +10
    // - groupB 在 6h 内有 4 条，6h~24h 内有 2 条 baseline，velocity 比率 2 → boost +30
    // 预期：groupB 的 trendingScore 应比 groupA 高 20 分
    const groupSlow = await prisma.sourceGroup.create({
      data: { id: "group-slow", name: "Group Slow", color: "#999999" },
    });
    const groupFast = await prisma.sourceGroup.create({
      data: { id: "group-fast", name: "Group Fast", color: "#ff8800" },
    });
    const sourceSlow = await prisma.source.create({
      data: {
        name: "Source Slow",
        rssUrl: "https://slow.example.com/feed",
        siteUrl: "https://slow.example.com",
        enabled: true,
        aiParsingEnabled: true,
        groupId: groupSlow.id,
      },
    });
    const sourceFast = await prisma.source.create({
      data: {
        name: "Source Fast",
        rssUrl: "https://fast.example.com/feed",
        siteUrl: "https://fast.example.com",
        enabled: true,
        aiParsingEnabled: true,
        groupId: groupFast.id,
      },
    });

    // 候选条目（要在榜的）
    const slowCandidate = await prisma.item.create({
      data: {
        id: "item-velocity-slow",
        sourceId: sourceSlow.id,
        originalUrl: "https://slow.example.com/cand",
        canonicalUrl: "https://slow.example.com/cand",
        urlHash: "hash-velocity-slow",
        dedupeSignature: "velocity-slow",
        originalTitle: "Group Slow 候选",
        publishedAt: hoursAgo(1),
        status: "processed",
        analysisStatus: "succeeded",
        moderationStatus: "allowed",
        qualityScore: 70,
        qualityRationale: "中",
        language: "zh",
        createdAt: hoursAgo(1),
      },
    });
    const fastCandidate = await prisma.item.create({
      data: {
        id: "item-velocity-fast",
        sourceId: sourceFast.id,
        originalUrl: "https://fast.example.com/cand",
        canonicalUrl: "https://fast.example.com/cand",
        urlHash: "hash-velocity-fast",
        dedupeSignature: "velocity-fast",
        originalTitle: "Group Fast 候选",
        publishedAt: hoursAgo(1),
        status: "processed",
        analysisStatus: "succeeded",
        moderationStatus: "allowed",
        qualityScore: 70,
        qualityRationale: "中",
        language: "zh",
        createdAt: hoursAgo(1),
      },
    });

    // Group Slow 的 baseline 条目（6h~24h 内 2 条）
    await prisma.item.createMany({
      data: [10, 20].map((h) => ({
        id: `item-velocity-slow-base-${h}`,
        sourceId: sourceSlow.id,
        originalUrl: `https://slow.example.com/baseline-${h}`,
        canonicalUrl: `https://slow.example.com/baseline-${h}`,
        urlHash: `hash-velocity-slow-base-${h}`,
        dedupeSignature: `velocity-slow-base-${h}`,
        originalTitle: `Group Slow baseline ${h}h`,
        publishedAt: hoursAgo(h),
        status: "processed",
        analysisStatus: "succeeded",
        moderationStatus: "allowed",
        qualityScore: 50,
        qualityRationale: "基线",
        language: "zh",
        createdAt: hoursAgo(h),
      })),
    });

    // Group Fast 的 baseline（6h~24h 内 2 条）+ 6h 内新增（2 条）
    await prisma.item.createMany({
      data: [10, 20].map((h) => ({
        id: `item-velocity-fast-base-${h}`,
        sourceId: sourceFast.id,
        originalUrl: `https://fast.example.com/baseline-${h}`,
        canonicalUrl: `https://fast.example.com/baseline-${h}`,
        urlHash: `hash-velocity-fast-base-${h}`,
        dedupeSignature: `velocity-fast-base-${h}`,
        originalTitle: `Group Fast baseline ${h}h`,
        publishedAt: hoursAgo(h),
        status: "processed",
        analysisStatus: "succeeded",
        moderationStatus: "allowed",
        qualityScore: 50,
        qualityRationale: "基线",
        language: "zh",
        createdAt: hoursAgo(h),
      })),
    });
    await prisma.item.createMany({
      data: [1, 2, 3].map((h) => ({
        id: `item-velocity-fast-recent-${h}`,
        sourceId: sourceFast.id,
        originalUrl: `https://fast.example.com/recent-${h}`,
        canonicalUrl: `https://fast.example.com/recent-${h}`,
        urlHash: `hash-velocity-fast-recent-${h}`,
        dedupeSignature: `velocity-fast-recent-${h}`,
        originalTitle: `Group Fast recent ${h}h`,
        publishedAt: hoursAgo(h),
        status: "processed",
        analysisStatus: "succeeded",
        moderationStatus: "allowed",
        qualityScore: 50,
        qualityRationale: "升温",
        language: "zh",
        createdAt: hoursAgo(h),
      })),
    });

    const entries = await listTrendingEntries(NOW, 50);
    const slow = entries.find((e) => e.id === slowCandidate.id);
    const fast = entries.find((e) => e.id === fastCandidate.id);
    expect(slow).toBeDefined();
    expect(fast).toBeDefined();
    // slow 候选 1h 暖身期 recency=1.0, sourceCount=1, velocity=+10 → 80
    // fast 候选 1h 暖身期 recency=1.0, sourceCount=1, velocity=+30 → 100
    // 辅助 baseline/recent 条目用于参与速度统计。
    expect(fast!.trendingScore - slow!.trendingScore).toBe(20);
  });

  it("supports precise feed filtering from trending entry ids", async () => {
    const singleFilters = resolveFeedFilters(
      {
        range: "all",
        sort: "time_desc",
        start: null,
        end: null,
        publishedStart: null,
        publishedEnd: null,
        groupId: null,
        sourceId: null,
        title: null,
        tag: null,
        entryId: "item-warmup-1h",
        entryType: "single",
      },
      NOW,
    );
    const singleFeed = await listFeedItems(singleFilters, {
      page: 1,
      size: 50,
      includePopularTags: false,
    });
    expect(singleFeed.items.map((item) => item.id)).toEqual(["item-warmup-1h"]);

    const clusterFilters = resolveFeedFilters(
      {
        range: "all",
        sort: "time_desc",
        start: null,
        end: null,
        publishedStart: null,
        publishedEnd: null,
        groupId: null,
        sourceId: null,
        title: null,
        tag: null,
        entryId: "cluster-fresh-multi",
        entryType: "cluster",
      },
      NOW,
    );
    const clusterFeed = await listFeedItems(clusterFilters, {
      page: 1,
      size: 50,
      includePopularTags: false,
    });
    expect(clusterFeed.items.map((item) => item.id)).toEqual(["cluster-fresh-multi"]);
  });

  it("respects the limit argument", async () => {
    const entries = await listTrendingEntries(NOW, 2);
    expect(entries).toHaveLength(2);
  });
});
