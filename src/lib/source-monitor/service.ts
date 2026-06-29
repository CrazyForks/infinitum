import { prisma } from "@/lib/db";
import type {
  SourceInactivityBucketKey,
  SourceMonitorEntry,
  SourceMonitorGroupOption,
  SourceMonitorSnapshot,
} from "@/lib/source-monitor/types";

const DAY_MS = 24 * 60 * 60 * 1000;
const STALE_ATTENTION_DAYS = 7;

const INACTIVITY_BUCKETS: Array<{
  key: SourceInactivityBucketKey;
  label: string;
  minDays: number;
  maxDays: number | null;
}> = [
  { key: "day", label: "1天", minDays: 1, maxDays: 7 },
  { key: "week", label: "1周", minDays: 7, maxDays: 30 },
  { key: "month", label: "1月", minDays: 30, maxDays: 90 },
  { key: "quarter", label: "3月", minDays: 90, maxDays: 180 },
  { key: "half_year", label: "6月", minDays: 180, maxDays: 365 },
  { key: "year", label: "1年", minDays: 365, maxDays: null },
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

function getAttentionReasons(source: SourceMonitorEntry) {
  const reasons: string[] = [];

  if (source.healthStatus === "failed") {
    reasons.push(source.healthMessage ? `抓取异常：${source.healthMessage}` : "抓取异常");
  }

  if (source.healthStatus === "unknown") {
    reasons.push("尚未完成首次巡检");
  }

  if (source.itemCount === 0) {
    reasons.push("尚无入库内容");
  } else if (source.inactiveDays !== null && source.inactiveDays >= STALE_ATTENTION_DAYS) {
    reasons.push(`${source.inactiveDays} 天无新增内容`);
  }

  return reasons;
}

function getAttentionRank(source: SourceMonitorEntry) {
  if (source.healthStatus === "failed") return 0;
  if (source.healthStatus === "unknown") return 1;
  if (source.itemCount === 0) return 2;
  if (source.inactiveDays !== null && source.inactiveDays >= STALE_ATTENTION_DAYS) return 3;
  return 4;
}

function isSourceInInactivityBucket(
  source: SourceMonitorEntry,
  bucket: (typeof INACTIVITY_BUCKETS)[number],
) {
  if (source.inactiveDays === null) {
    return bucket.maxDays === null;
  }

  return (
    source.inactiveDays >= bucket.minDays &&
    (bucket.maxDays === null || source.inactiveDays < bucket.maxDays)
  );
}

export type SourceMonitorFilter = {
  healthStatus?: string;
  inactivity?: string;
  groupName?: string;
};

export type SourceMonitorQuery = SourceMonitorFilter & {
  page?: number;
  pageSize?: number;
};

function applyFilters(entries: SourceMonitorEntry[], filter: SourceMonitorFilter) {
  return entries.filter((source) => {
    if (filter.healthStatus && filter.healthStatus !== "all" && source.healthStatus !== filter.healthStatus) {
      return false;
    }

    if (filter.groupName && filter.groupName !== "all" && (source.groupName ?? "未分组") !== filter.groupName) {
      return false;
    }

    if (filter.inactivity && filter.inactivity !== "all") {
      const bucket = INACTIVITY_BUCKETS.find((b) => b.key === filter.inactivity);
      if (bucket && !isSourceInInactivityBucket(source, bucket)) {
        return false;
      }
    }

    return true;
  });
}

function normalizePage(value: number | undefined) {
  return Number.isFinite(value) && value != null && value > 0
    ? Math.floor(value)
    : 1;
}

function normalizePageSize(value: number | undefined) {
  if (!Number.isFinite(value) || value == null) {
    return 10;
  }

  return Math.min(100, Math.max(1, Math.floor(value)));
}

function buildGroupOptions(entries: SourceMonitorEntry[]): SourceMonitorGroupOption[] {
  const countByGroupName = new Map<string, number>();

  for (const source of entries) {
    const groupName = source.groupName ?? "未分组";
    countByGroupName.set(groupName, (countByGroupName.get(groupName) ?? 0) + 1);
  }

  return [
    {
      value: "all",
      label: "全部",
      count: entries.length,
    },
    ...Array.from(countByGroupName.entries())
      .sort(([left], [right]) => left.localeCompare(right, "zh-CN"))
      .map(([groupName, count]) => ({
        value: groupName,
        label: groupName,
        count,
      })),
  ];
}

export async function getSourceMonitorSnapshot(
  now = new Date(),
  opts?: SourceMonitorQuery,
): Promise<SourceMonitorSnapshot> {
  // NOTE: All enabled sources are loaded for health/inactivity statistics.
  // If source count grows beyond ~500, consider pushing health counts to
  // prisma.source.groupBy({ by: ["healthStatus"] }) and computing inactivity
  // buckets from a batched last-item-created-at query.
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
      _count: {
        id: true,
      },
    }),
  ]);
  const latestItemCreatedAtBySourceId = new Map(
    latestItemsBySource.map((entry) => [entry.sourceId, entry._max.createdAt]),
  );
  const itemCountBySourceId = new Map(
    latestItemsBySource.map((entry) => [entry.sourceId, entry._count.id]),
  );
  const entries = sources
    .map((source): SourceMonitorEntry => {
      const lastItemCreatedAt = latestItemCreatedAtBySourceId.get(source.id) ?? null;

      const entry: SourceMonitorEntry = {
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
        itemCount: itemCountBySourceId.get(source.id) ?? 0,
      };

      return {
        ...entry,
        attentionReasons: getAttentionReasons(entry),
      };
    })
    .sort(sortByOldestUpdateFirst);

  const healthyCount = entries.filter((source) => source.healthStatus === "healthy").length;
  const failedCount = entries.filter((source) => source.healthStatus === "failed").length;
  const unknownCount = entries.filter((source) => source.healthStatus === "unknown").length;

  const filteredEntries = opts ? applyFilters(entries, opts) : entries;
  const attentionSources = entries
    .filter((source) => (source.attentionReasons?.length ?? 0) > 0)
    .sort((left, right) => {
      const rankDiff = getAttentionRank(left) - getAttentionRank(right);
      if (rankDiff !== 0) return rankDiff;
      if ((right.inactiveDays ?? -1) !== (left.inactiveDays ?? -1)) {
        return (right.inactiveDays ?? -1) - (left.inactiveDays ?? -1);
      }
      return left.name.localeCompare(right.name, "zh-CN");
    });
  const pageSize = normalizePageSize(opts?.pageSize);
  const totalItems = filteredEntries.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const page = Math.min(normalizePage(opts?.page), totalPages);
  const pagedEntries = filteredEntries.slice((page - 1) * pageSize, page * pageSize);

  return {
    generatedAt: now.toISOString(),
    totalEnabledSourceCount: entries.length,
    filteredSourceCount: totalItems,
    pagination: {
      page,
      pageSize,
      totalItems,
      totalPages,
    },
    sources: pagedEntries,
    health: {
      healthyCount,
      failedCount,
      unknownCount,
      attentionSources,
    },
    inactivityBuckets: INACTIVITY_BUCKETS.map((bucket) => {
      const cutoff = new Date(now.getTime() - bucket.minDays * DAY_MS);
      const bucketSources = entries.filter((source) => isSourceInInactivityBucket(source, bucket));

      return {
        key: bucket.key,
        label: bucket.label,
        days: bucket.minDays,
        cutoff: cutoff.toISOString(),
        count: bucketSources.length,
      };
    }),
    groups: buildGroupOptions(entries),
  };
}
