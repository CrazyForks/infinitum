import { prisma } from "@/lib/db";
import type {
  SourceInactivityBucketKey,
  SourceMonitorEntry,
  SourceMonitorSnapshot,
} from "@/lib/source-monitor/types";

const DAY_MS = 24 * 60 * 60 * 1000;

const INACTIVITY_BUCKETS: Array<{
  key: SourceInactivityBucketKey;
  label: string;
  days: number;
}> = [
  { key: "day", label: "1天", days: 1 },
  { key: "week", label: "1周", days: 7 },
  { key: "month", label: "1月", days: 30 },
  { key: "quarter", label: "3月", days: 90 },
  { key: "half_year", label: "6月", days: 180 },
  { key: "year", label: "1年", days: 365 },
];

function toIsoString(value: Date | null | undefined) {
  return value?.toISOString() ?? null;
}

function getInactiveDays(lastItemCreatedAt: Date | null | undefined, now: Date) {
  if (!lastItemCreatedAt) {
    return null;
  }

  return Math.max(0, Math.floor((now.getTime() - lastItemCreatedAt.getTime()) / DAY_MS));
}

function normalizeSourceHealthStatus(value: string) {
  if (value === "healthy" || value === "failed") {
    return value;
  }

  return "unknown";
}

function sortByOldestUpdateFirst(left: SourceMonitorEntry, right: SourceMonitorEntry) {
  if (!left.lastItemCreatedAt && !right.lastItemCreatedAt) {
    return left.name.localeCompare(right.name, "zh-CN");
  }

  if (!left.lastItemCreatedAt) {
    return -1;
  }

  if (!right.lastItemCreatedAt) {
    return 1;
  }

  return left.lastItemCreatedAt.localeCompare(right.lastItemCreatedAt);
}

export async function getSourceMonitorSnapshot(now = new Date()): Promise<SourceMonitorSnapshot> {
  const [sources, latestItemsBySource] = await Promise.all([
    prisma.source.findMany({
      where: { enabled: true },
      include: { group: true },
      orderBy: [{ name: "asc" }],
    }),
    prisma.item.groupBy({
      by: ["sourceId"],
      _max: {
        createdAt: true,
      },
    }),
  ]);
  const latestItemCreatedAtBySourceId = new Map(
    latestItemsBySource.map((entry) => [entry.sourceId, entry._max.createdAt]),
  );
  const entries = sources
    .map((source): SourceMonitorEntry => {
      const lastItemCreatedAt = latestItemCreatedAtBySourceId.get(source.id) ?? null;

      return {
        id: source.id,
        name: source.name,
        rssUrl: source.rssUrl,
        siteUrl: source.siteUrl,
        groupName: source.group?.name ?? null,
        healthStatus: normalizeSourceHealthStatus(source.healthStatus),
        healthMessage: source.healthMessage,
        healthCheckedAt: toIsoString(source.healthCheckedAt),
        lastFetchedAt: toIsoString(source.lastFetchedAt),
        lastItemCreatedAt: toIsoString(lastItemCreatedAt),
        inactiveDays: getInactiveDays(lastItemCreatedAt, now),
      };
    })
    .sort(sortByOldestUpdateFirst);

  const healthyCount = entries.filter((source) => source.healthStatus === "healthy").length;
  const failedCount = entries.filter((source) => source.healthStatus === "failed").length;
  const unknownCount = entries.filter((source) => source.healthStatus === "unknown").length;

  return {
    generatedAt: now.toISOString(),
    totalEnabledSourceCount: entries.length,
    health: {
      healthyCount,
      failedCount,
      unknownCount,
      attentionSources: entries.filter((source) => source.healthStatus !== "healthy"),
    },
    inactivityBuckets: INACTIVITY_BUCKETS.map((bucket) => {
      const cutoff = new Date(now.getTime() - bucket.days * DAY_MS);
      const bucketSources = entries.filter(
        (source) =>
          !source.lastItemCreatedAt ||
          new Date(source.lastItemCreatedAt).getTime() <= cutoff.getTime(),
      );

      return {
        ...bucket,
        cutoff: cutoff.toISOString(),
        count: bucketSources.length,
        sources: bucketSources,
      };
    }),
  };
}
