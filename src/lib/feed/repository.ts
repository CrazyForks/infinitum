import {
  type ContentCluster,
  type FetchRun,
  FetchRunStatus,
  type Item,
  type Prisma,
  type Source,
} from "@prisma/client";

import { prisma } from "@/lib/db";
import { getDisplaySummary, getDisplayTitle, shouldTranslateTitle } from "@/lib/feed/presentation";
import type {
  ClusterDTO,
  FeedGroupOption,
  FeedClusterPreviewItemDTO,
  FeedEntryDTO,
  FeedFilters,
  FeedItemDTO,
  FeedSourceOption,
  FetchRunSnapshot,
  ReviewItemDTO,
  SourceConfig,
} from "@/lib/feed/types";

const DISPLAYABLE_MODERATION_STATUSES = ["allowed", "restored"] as const;

type ItemWithSource = Item & { source: Source };
type ItemWithSourceAndCluster = Item & { source: Source; cluster: ContentCluster | null };

export async function syncSources(sourceConfigs: SourceConfig[]) {
  for (const source of sourceConfigs) {
    await prisma.source.upsert({
      where: { rssUrl: source.rssUrl },
      update: {
        name: source.name,
        siteUrl: source.siteUrl,
        enabled: source.enabled,
        fetchFullTextWhenMissing: source.fetchFullTextWhenMissing,
      },
      create: {
        name: source.name,
        rssUrl: source.rssUrl,
        siteUrl: source.siteUrl,
        enabled: source.enabled,
        fetchFullTextWhenMissing: source.fetchFullTextWhenMissing,
      },
    });
  }

  return prisma.source.findMany({
    where: { enabled: true },
    orderBy: { name: "asc" },
  });
}

export async function findExistingItem(urlHash: string, dedupeSignature: string) {
  return prisma.item.findFirst({
    where: {
      OR: [{ urlHash }, { dedupeSignature }],
    },
  });
}

export async function upsertItem(
  where: { id?: string; urlHash: string; dedupeSignature: string },
  data: Prisma.ItemUncheckedCreateInput,
) {
  if (where.id) {
    return prisma.item.update({
      where: { id: where.id },
      data,
    });
  }

  return prisma.item.create({ data });
}

export async function createFetchRun(triggerType: "scheduled" | "manual", startedAt: Date, taskRunId?: string) {
  return prisma.fetchRun.create({
    data: {
      taskRunId: taskRunId ?? null,
      triggerType,
      status: "running",
      startedAt,
    },
  });
}

export async function completeFetchRun(
  id: string,
  data: {
    status: FetchRunStatus;
    finishedAt: Date;
    sourceCount: number;
    itemCount: number;
    successCount: number;
    failureCount: number;
    errorSummary?: string | null;
  },
) {
  return prisma.fetchRun.update({
    where: { id },
    data,
  });
}

export async function updateFetchRunProgress(
  id: string,
  data: {
    sourceCount?: number;
    itemCount?: number;
    successCount?: number;
    failureCount?: number;
    errorSummary?: string | null;
  },
) {
  return prisma.fetchRun.update({
    where: { id },
    data,
  });
}

export async function getLatestFetchRun() {
  return prisma.fetchRun.findFirst({
    orderBy: { startedAt: "desc" },
  });
}

export function toFetchRunSnapshot(run: FetchRun): FetchRunSnapshot {
  return {
    id: run.id,
    status: run.status,
    triggerType: run.triggerType,
    startedAt: run.startedAt.toISOString(),
    finishedAt: run.finishedAt?.toISOString() ?? null,
    sourceCount: run.sourceCount,
    itemCount: run.itemCount,
    successCount: run.successCount,
    failureCount: run.failureCount,
    errorSummary: run.errorSummary,
  };
}

export async function hasActiveFetchRun() {
  const count = await prisma.fetchRun.count({
    where: { status: "running" },
  });

  return count > 0;
}

export function mapItemToClusterPreview(item: ItemWithSource): FeedClusterPreviewItemDTO {
  return {
    id: item.id,
    title: getDisplayTitle(item.originalTitle, item.translatedTitle),
    originalUrl: item.originalUrl,
    publishedAt: item.publishedAt.toISOString(),
    sourceName: item.source.name,
    author: item.author,
    summary: getDisplaySummary(item.summaryText, item.rssExcerpt, item.fullText ?? item.rssContent),
    score: item.qualityScore,
    canRegenerateTranslation: shouldTranslateTitle(item.originalTitle),
  };
}

export function mapItemToFeedItem(item: ItemWithSource): FeedItemDTO {
  return {
    id: item.id,
    type: "single",
    title: getDisplayTitle(item.originalTitle, item.translatedTitle),
    originalUrl: item.originalUrl,
    publishedAt: item.publishedAt.toISOString(),
    latestPublishedAt: item.publishedAt.toISOString(),
    sourceName: item.source.name,
    author: item.author,
    summary: getDisplaySummary(item.summaryText, item.rssExcerpt, item.fullText ?? item.rssContent),
    score: item.qualityScore,
    sourceCount: 1,
    itemCount: 1,
    canRegenerateTranslation: shouldTranslateTitle(item.originalTitle),
  };
}

export function mapItemToReviewItem(item: ItemWithSource): ReviewItemDTO {
  return {
    id: item.id,
    title: getDisplayTitle(item.originalTitle, item.translatedTitle),
    originalUrl: item.originalUrl,
    publishedAt: item.publishedAt.toISOString(),
    sourceName: item.source.name,
    author: item.author,
    summary: getDisplaySummary(item.summaryText, item.rssExcerpt, item.fullText ?? item.rssContent),
    moderationStatus: item.moderationStatus,
    moderationReason: item.moderationReason,
    moderationDetail: item.moderationDetail,
    qualityScore: item.qualityScore,
    qualityRationale: item.qualityRationale,
    topicLabel: item.topicLabel,
    canRegenerateTranslation: shouldTranslateTitle(item.originalTitle),
  };
}

function buildItemWhere(
  filters: FeedFilters & { rangeStart: Date | null; rangeEnd: Date | null },
  clusterId?: string,
): Prisma.ItemWhereInput {
  return {
    AND: [
      {
        status: "processed",
        moderationStatus: {
          in: [...DISPLAYABLE_MODERATION_STATUSES],
        },
        ...(clusterId ? { clusterId } : {}),
        ...(filters.rangeStart || filters.rangeEnd
          ? {
              createdAt: {
                ...(filters.rangeStart ? { gte: filters.rangeStart } : {}),
                ...(filters.rangeEnd ? { lte: filters.rangeEnd } : {}),
              },
            }
          : {}),
        source: {
          is: {
            enabled: true,
            ...(filters.groupId ? { groupId: filters.groupId } : {}),
            ...(filters.sourceId ? { id: filters.sourceId } : {}),
          },
        },
      },
      {
        OR: [{ clusterId: null }, { cluster: { is: { status: "active" } } }],
      },
    ],
  };
}

function mapClusterSubsetToEntry(cluster: ContentCluster, items: ItemWithSource[]): FeedEntryDTO {
  const sortedItems = [...items].sort((left, right) => right.publishedAt.getTime() - left.publishedAt.getTime());

  if (sortedItems.length === 1) {
    return mapItemToFeedItem(sortedItems[0]!);
  }

  const preview = sortedItems.slice(0, 3).map(mapItemToClusterPreview);
  const latestPublishedAt = sortedItems[0]!.publishedAt.toISOString();
  const score = Math.round(sortedItems.reduce((sum, item) => sum + item.qualityScore, 0) / sortedItems.length);

  return {
    id: cluster.id,
    type: "cluster",
    title: cluster.title,
    summary: cluster.summary,
    publishedAt: latestPublishedAt,
    latestPublishedAt,
    score,
    sourceCount: new Set(sortedItems.map((item) => item.sourceId)).size,
    itemCount: sortedItems.length,
    itemsPreview: preview,
    hasMoreItems: sortedItems.length > preview.length,
  };
}

function compareFeedEntries(left: FeedEntryDTO, right: FeedEntryDTO, sort: FeedFilters["sort"]) {
  if (sort === "score_desc" && right.score !== left.score) {
    return right.score - left.score;
  }

  const publishedDelta = new Date(right.latestPublishedAt).getTime() - new Date(left.latestPublishedAt).getTime();
  if (publishedDelta !== 0) {
    return publishedDelta;
  }

  if (right.score !== left.score) {
    return right.score - left.score;
  }

  if (right.itemCount !== left.itemCount) {
    return right.itemCount - left.itemCount;
  }

  return right.id.localeCompare(left.id);
}

function normalizeTitleSearch(value: string | null) {
  return value?.trim().toLocaleLowerCase() ?? "";
}

function matchesEntryTitle(entry: FeedEntryDTO, title: string | null) {
  const normalizedTitle = normalizeTitleSearch(title);

  if (!normalizedTitle) {
    return true;
  }

  return entry.title.toLocaleLowerCase().includes(normalizedTitle);
}

export async function listFeedFilterOptions(): Promise<{
  groups: FeedGroupOption[];
  sources: FeedSourceOption[];
}> {
  const sources = await prisma.source.findMany({
    where: { enabled: true },
    include: { group: true },
    orderBy: [{ name: "asc" }],
  });

  const groups = new Map<string, FeedGroupOption>();

  for (const source of sources) {
    if (source.groupId && source.group) {
      groups.set(source.groupId, {
        id: source.groupId,
        name: source.group.name,
      });
    }
  }

  return {
    groups: [...groups.values()].sort((left, right) => left.name.localeCompare(right.name)),
    sources: sources.map((source) => ({
      id: source.id,
      name: source.name,
      groupId: source.groupId,
    })),
  };
}

export async function listFeedItems(filters: FeedFilters & { rangeStart: Date | null; rangeEnd: Date | null }, cursor?: string | null) {
  const take = 20;
  const items = await prisma.item.findMany({
    where: buildItemWhere(filters),
    include: {
      source: true,
      cluster: true,
    },
    orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
  });
  const groupedItems = new Map<string, ItemWithSource[]>();
  const singleEntries: FeedEntryDTO[] = [];

  for (const item of items as ItemWithSourceAndCluster[]) {
    if (!item.clusterId || !item.cluster) {
      singleEntries.push(mapItemToFeedItem(item));
      continue;
    }

    const current = groupedItems.get(item.clusterId) ?? [];
    current.push(item);
    groupedItems.set(item.clusterId, current);
  }

  const clusterEntries = [...groupedItems.entries()].map(([, clusterItems]) =>
    mapClusterSubsetToEntry((clusterItems[0] as ItemWithSourceAndCluster).cluster!, clusterItems),
  );
  const entries = [...singleEntries, ...clusterEntries]
    .filter((entry) => matchesEntryTitle(entry, filters.title))
    .sort((left, right) => compareFeedEntries(left, right, filters.sort));
  const startIndex = cursor ? Math.max(0, entries.findIndex((entry) => entry.id === cursor) + 1) : 0;
  const slice = entries.slice(startIndex, startIndex + take);
  const nextCursor = startIndex + take < entries.length ? slice[slice.length - 1]?.id ?? null : null;

  return {
    items: slice,
    nextCursor,
  };
}

export async function listClusterItems(
  clusterId: string,
  filters: FeedFilters & { rangeStart: Date | null; rangeEnd: Date | null },
) {
  const items = await prisma.item.findMany({
    where: buildItemWhere(filters, clusterId),
    include: { source: true },
    orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
  });

  return items.map(mapItemToClusterPreview);
}

export async function listFilteredItems() {
  const items = await prisma.item.findMany({
    where: { moderationStatus: "filtered" },
    include: { source: true },
    orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
  });

  return items.map(mapItemToReviewItem);
}

export async function listAdminClusters() {
  const clusters = await prisma.contentCluster.findMany({
    include: {
      items: {
        where: {
          status: "processed",
          moderationStatus: {
            in: [...DISPLAYABLE_MODERATION_STATUSES],
          },
        },
        include: { source: true },
        orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
        take: 5,
      },
    },
    orderBy: [{ latestPublishedAt: "desc" }, { score: "desc" }, { createdAt: "desc" }],
  });

  return clusters.map((cluster) => ({
    id: cluster.id,
    title: cluster.title,
    summary: cluster.summary,
    score: cluster.score,
    itemCount: cluster.itemCount,
    latestPublishedAt: cluster.latestPublishedAt.toISOString(),
    status: cluster.status,
    items: cluster.items.map(mapItemToClusterPreview),
  })) satisfies ClusterDTO[];
}

export async function getAdminCluster(clusterId: string) {
  const cluster = await prisma.contentCluster.findUnique({
    where: { id: clusterId },
    include: {
      items: {
        where: {
          status: "processed",
          moderationStatus: {
            in: [...DISPLAYABLE_MODERATION_STATUSES],
          },
        },
        include: { source: true },
        orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
      },
    },
  });

  if (!cluster) {
    return null;
  }

  return {
    id: cluster.id,
    title: cluster.title,
    summary: cluster.summary,
    score: cluster.score,
    itemCount: cluster.itemCount,
    latestPublishedAt: cluster.latestPublishedAt.toISOString(),
    status: cluster.status,
    items: cluster.items.map(mapItemToClusterPreview),
  } satisfies ClusterDTO;
}
