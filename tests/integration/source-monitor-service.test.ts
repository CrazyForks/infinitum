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
    const staleSource = await prisma.source.create({
      data: {
        name: "两天未更新源",
        rssUrl: "https://example.com/stale.xml",
        siteUrl: "https://example.com/stale",
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
    expect(snapshot.health.healthyCount).toBe(2);
    expect(snapshot.health.failedCount).toBe(1);
    expect(snapshot.health.attentionSources.map((source) => source.id)).toEqual([
      failedSource.id,
      weekStaleSource.id,
      staleSource.id,
    ]);
    expect(dayBucket?.sources.map((source) => source.id)).toEqual([staleSource.id]);
    expect(weekBucket?.sources.map((source) => source.id)).toEqual([weekStaleSource.id]);
    expect(yearBucket?.sources.map((source) => source.id)).toEqual([failedSource.id]);
  });
});
