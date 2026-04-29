import { beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import { getSourceMonitorSnapshot } from "@/lib/source-monitor/service";

describe("source monitor service", () => {
  beforeEach(async () => {
    await prisma.item.deleteMany();
    await prisma.source.deleteMany();
    await prisma.sourceGroup.deleteMany();
  });

  it("reports source health and inactivity buckets for enabled sources", async () => {
    const now = new Date("2026-04-21T12:00:00.000Z");
    const techGroup = await prisma.sourceGroup.create({
      data: {
        name: "科技",
        color: "#3366ff",
      },
    });
    const staleSource = await prisma.source.create({
      data: {
        name: "两天未更新源",
        rssUrl: "https://example.com/stale.xml",
        siteUrl: "https://example.com/stale",
        groupId: techGroup.id,
        healthStatus: "healthy",
        healthCheckedAt: new Date("2026-04-21T11:00:00.000Z"),
      },
    });
    const weekStaleSource = await prisma.source.create({
      data: {
        name: "十天未更新源",
        rssUrl: "https://example.com/week-stale.xml",
        siteUrl: "https://example.com/week-stale",
        healthStatus: "healthy",
        healthCheckedAt: new Date("2026-04-21T11:00:00.000Z"),
      },
    });
    const failedSource = await prisma.source.create({
      data: {
        name: "异常源",
        rssUrl: "https://example.com/failed.xml",
        siteUrl: "https://example.com/failed",
        healthStatus: "failed",
        healthMessage: "RSS fetch failed with status 500",
        healthCheckedAt: new Date("2026-04-21T10:00:00.000Z"),
      },
    });
    await prisma.source.create({
      data: {
        name: "禁用源",
        rssUrl: "https://example.com/disabled.xml",
        siteUrl: "https://example.com/disabled",
        enabled: false,
        healthStatus: "failed",
      },
    });
    await prisma.item.create({
      data: {
        sourceId: staleSource.id,
        originalUrl: "https://example.com/stale/1",
        canonicalUrl: "https://example.com/stale/1",
        urlHash: "stale-hash",
        dedupeSignature: "stale-signature",
        originalTitle: "两天前内容",
        publishedAt: new Date("2026-04-19T10:00:00.000Z"),
        createdAt: new Date("2026-04-19T10:00:00.000Z"),
      },
    });
    await prisma.item.create({
      data: {
        sourceId: weekStaleSource.id,
        originalUrl: "https://example.com/week-stale/1",
        canonicalUrl: "https://example.com/week-stale/1",
        urlHash: "week-stale-hash",
        dedupeSignature: "week-stale-signature",
        originalTitle: "十天前内容",
        publishedAt: new Date("2026-04-11T10:00:00.000Z"),
        createdAt: new Date("2026-04-11T10:00:00.000Z"),
      },
    });

    const snapshot = await getSourceMonitorSnapshot(now);
    const dayBucket = snapshot.inactivityBuckets.find((bucket) => bucket.key === "day");
    const weekBucket = snapshot.inactivityBuckets.find((bucket) => bucket.key === "week");
    const yearBucket = snapshot.inactivityBuckets.find((bucket) => bucket.key === "year");

    expect(snapshot.totalEnabledSourceCount).toBe(3);
    expect(snapshot.filteredSourceCount).toBe(3);
    expect(snapshot.pagination).toEqual({
      page: 1,
      pageSize: 10,
      totalItems: 3,
      totalPages: 1,
    });
    expect(snapshot.health.healthyCount).toBe(2);
    expect(snapshot.health.failedCount).toBe(1);
    expect(snapshot.sources.map((source) => source.id)).toEqual([
      failedSource.id,
      weekStaleSource.id,
      staleSource.id,
    ]);
    expect(snapshot.health.attentionSources).toEqual([]);
    expect(dayBucket).toMatchObject({ count: 1 });
    expect(dayBucket).not.toHaveProperty("sources");
    expect(weekBucket).toMatchObject({ count: 1 });
    expect(weekBucket).not.toHaveProperty("sources");
    expect(yearBucket).toMatchObject({ count: 1 });
    expect(yearBucket).not.toHaveProperty("sources");
    expect(snapshot.groups).toEqual([
      { value: "all", label: "全部", count: 3 },
      { value: "科技", label: "科技", count: 1 },
      { value: "未分组", label: "未分组", count: 2 },
    ]);
  });

  it("returns only the requested page and counts filtered sources", async () => {
    const now = new Date("2026-04-21T12:00:00.000Z");
    const group = await prisma.sourceGroup.create({
      data: {
        name: "科技",
      },
    });
    const first = await prisma.source.create({
      data: {
        name: "A 异常源",
        rssUrl: "https://example.com/a.xml",
        siteUrl: "https://example.com/a",
        groupId: group.id,
        healthStatus: "failed",
      },
    });
    const second = await prisma.source.create({
      data: {
        name: "B 异常源",
        rssUrl: "https://example.com/b.xml",
        siteUrl: "https://example.com/b",
        groupId: group.id,
        healthStatus: "failed",
      },
    });
    await prisma.source.create({
      data: {
        name: "C 正常源",
        rssUrl: "https://example.com/c.xml",
        siteUrl: "https://example.com/c",
        healthStatus: "healthy",
      },
    });

    const snapshot = await getSourceMonitorSnapshot(now, {
      page: 2,
      pageSize: 1,
      healthStatus: "failed",
      groupName: "科技",
    });

    expect(snapshot.filteredSourceCount).toBe(2);
    expect(snapshot.pagination).toEqual({
      page: 2,
      pageSize: 1,
      totalItems: 2,
      totalPages: 2,
    });
    expect(snapshot.sources.map((source) => source.id)).toEqual([second.id]);
    expect(snapshot.sources.map((source) => source.id)).not.toContain(first.id);
  });

  it("clamps out-of-range pages and returns an empty first page when filters match nothing", async () => {
    const now = new Date("2026-04-21T12:00:00.000Z");
    await prisma.source.create({
      data: {
        name: "正常源",
        rssUrl: "https://example.com/healthy.xml",
        siteUrl: "https://example.com/healthy",
        healthStatus: "healthy",
      },
    });

    const outOfRange = await getSourceMonitorSnapshot(now, {
      page: 5,
      pageSize: 1,
    });
    const empty = await getSourceMonitorSnapshot(now, {
      page: 3,
      pageSize: 20,
      healthStatus: "failed",
    });

    expect(outOfRange.pagination.page).toBe(1);
    expect(outOfRange.sources).toHaveLength(1);
    expect(empty.pagination).toEqual({
      page: 1,
      pageSize: 20,
      totalItems: 0,
      totalPages: 1,
    });
    expect(empty.sources).toEqual([]);
  });
});
