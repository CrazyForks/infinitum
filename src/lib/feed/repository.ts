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
  FeedClusterPreviewItemDTO,
  FeedEntryDTO,
  FeedFilters,
  FeedItemDTO,
  FetchRunSnapshot,
  ReviewItemDTO,
  SourceConfig,
} from "@/lib/feed/types";

const DISPLAYABLE_MODERATION_STATUSES = ["allowed", "restored"] as const;

type ItemWithSource = Item & { source: Source };
type ClusterWithItems = ContentCluster & { items: ItemWithSource[] };

function isDisplayableModerationStatus(
  status: Item["moderationStatus"],
): status is (typeof DISPLAYABLE_MODERATION_STATUSES)[number] {
  return DISPLAYABLE_MODERATION_STATUSES.includes(status as (typeof DISPLAYABLE_MODERATION_STATUSES)[number]);
}

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

export async function createFetchRun(triggerType: "scheduled" | "manual", startedAt: Date) {
  return prisma.fetchRun.create({
    data: {
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

function mapClusterToFeedEntry(cluster: ClusterWithItems): FeedEntryDTO | null {
  const displayableItems = cluster.items
    .filter((item) => item.status === "processed")
    .filter((item) => isDisplayableModerationStatus(item.moderationStatus))
    .sort((left, right) => right.publishedAt.getTime() - left.publishedAt.getTime());

  if (displayableItems.length === 0) {
    return null;
  }

  if (displayableItems.length === 1) {
    return mapItemToFeedItem(displayableItems[0]!);
  }

  const preview = displayableItems.slice(0, 3).map(mapItemToClusterPreview);
  const sourceCount = new Set(displayableItems.map((item) => item.sourceId)).size;

  return {
    id: cluster.id,
    type: "cluster",
    title: cluster.title,
    summary: cluster.summary,
    publishedAt: cluster.latestPublishedAt.toISOString(),
    latestPublishedAt: cluster.latestPublishedAt.toISOString(),
    score: cluster.score,
    sourceCount,
    itemCount: displayableItems.length,
    itemsPreview: preview,
    hasMoreItems: displayableItems.length > preview.length,
  };
}

function buildFeedOrder(sort: FeedFilters["sort"]): Prisma.ContentClusterOrderByWithRelationInput[] {
  if (sort === "score_desc") {
    return [{ score: "desc" }, { latestPublishedAt: "desc" }, { itemCount: "desc" }, { createdAt: "desc" }];
  }

  return [{ latestPublishedAt: "desc" }, { score: "desc" }, { itemCount: "desc" }, { createdAt: "desc" }];
}

export async function listFeedItems(filters: FeedFilters & { rangeStart: Date | null; rangeEnd: Date | null }, cursor?: string | null) {
  const take = 20;
  const clusters = await prisma.contentCluster.findMany({
    where: {
      status: "active",
      ...(filters.rangeStart || filters.rangeEnd
        ? {
            latestPublishedAt: {
              ...(filters.rangeStart ? { gte: filters.rangeStart } : {}),
              ...(filters.rangeEnd ? { lte: filters.rangeEnd } : {}),
            },
          }
        : {}),
    },
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
    orderBy: buildFeedOrder(filters.sort),
  });

  const entries = clusters.map(mapClusterToFeedEntry).filter((entry): entry is FeedEntryDTO => Boolean(entry));
  const startIndex = cursor ? Math.max(0, entries.findIndex((entry) => entry.id === cursor) + 1) : 0;
  const slice = entries.slice(startIndex, startIndex + take);
  const nextCursor = startIndex + take < entries.length ? slice[slice.length - 1]?.id ?? null : null;

  return {
    items: slice,
    nextCursor,
  };
}

export async function listClusterItems(clusterId: string) {
  const items = await prisma.item.findMany({
    where: {
      clusterId,
      status: "processed",
      moderationStatus: {
        in: [...DISPLAYABLE_MODERATION_STATUSES],
      },
    },
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
