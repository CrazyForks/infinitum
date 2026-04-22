import {
  type FetchRun,
  FetchRunStatus,
  type Item,
  Prisma,
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
  FeedPagination,
  FeedSourceOption,
  FetchRunSnapshot,
  ReviewItemDTO,
  SourceConfig,
} from "@/lib/feed/types";

const DISPLAYABLE_MODERATION_STATUSES = ["allowed", "restored"] as const;

type ItemWithSource = Item & { source: Source };
type FeedEntryRow = {
  id: string;
  entryType: "single" | "cluster";
  title: string;
  summary: string | null;
  latestPublishedAt: Date | string;
  createdAt: Date | string;
  score: number | bigint;
  sourceCount: number | bigint;
  itemCount: number | bigint;
};

type CountRow = {
  total: bigint;
};

type FeedGroupCountRow = {
  id: string;
  name: string;
  count: bigint;
};

export async function syncSources(sourceConfigs: SourceConfig[]) {
  for (const source of sourceConfigs) {
    await prisma.source.upsert({
      where: { rssUrl: source.rssUrl },
      update: {
        name: source.name,
        siteUrl: source.siteUrl,
        enabled: source.enabled,
        aiParsingEnabled: source.aiParsingEnabled,
      },
      create: {
        name: source.name,
        rssUrl: source.rssUrl,
        siteUrl: source.siteUrl,
        enabled: source.enabled,
        aiParsingEnabled: source.aiParsingEnabled,
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
    itemsAdded: number;
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
    itemsAdded?: number;
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
    itemsAdded: run.itemsAdded,
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
    createdAt: item.createdAt.toISOString(),
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
    canRegenerateTranslation: shouldTranslateTitle(item.originalTitle),
  };
}

function buildItemWhere(
  filters: FeedFilters & { rangeStart: Date | null; rangeEnd: Date | null },
  clusterId?: string | string[],
): Prisma.ItemWhereInput {
  return {
    AND: [
      {
        status: "processed",
        moderationStatus: {
          in: [...DISPLAYABLE_MODERATION_STATUSES],
        },
        ...(clusterId
          ? {
              clusterId: Array.isArray(clusterId) ? { in: clusterId } : clusterId,
            }
          : {}),
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

function normalizeTitleSearch(value: string | null) {
  return value?.trim().toLocaleLowerCase() ?? "";
}

function toNumber(value: number | bigint) {
  return typeof value === "bigint" ? Number(value) : value;
}

function toIsoString(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function buildFeedEntryCandidatesCte(filters: FeedFilters & { rangeStart: Date | null; rangeEnd: Date | null }) {
  const whereClauses: Prisma.Sql[] = [
    Prisma.sql`i.status = ${"processed"}`,
    Prisma.sql`i."moderationStatus" IN (${Prisma.join([...DISPLAYABLE_MODERATION_STATUSES])})`,
    Prisma.sql`s.enabled = ${true}`,
    Prisma.sql`(i."clusterId" IS NULL OR c.status = ${"active"})`,
  ];

  if (filters.rangeStart) {
    whereClauses.push(Prisma.sql`i."createdAt" >= ${filters.rangeStart}`);
  }

  if (filters.rangeEnd) {
    whereClauses.push(Prisma.sql`i."createdAt" <= ${filters.rangeEnd}`);
  }

  if (filters.groupId) {
    whereClauses.push(Prisma.sql`s."groupId" = ${filters.groupId}`);
  }

  if (filters.sourceId) {
    whereClauses.push(Prisma.sql`s.id = ${filters.sourceId}`);
  }

  return Prisma.sql`
    WITH filtered_items AS (
      SELECT
        i.id AS "itemId",
        i."clusterId" AS "clusterId",
        i."sourceId" AS "sourceId",
        i."publishedAt" AS "publishedAt",
        i."createdAt" AS "createdAt",
        i."qualityScore" AS "qualityScore",
        i."originalTitle" AS "originalTitle",
        i."translatedTitle" AS "translatedTitle",
        c.title AS "clusterTitle",
        c.summary AS "clusterSummary"
      FROM "items" i
      INNER JOIN "sources" s ON s.id = i."sourceId"
      LEFT JOIN "content_clusters" c ON c.id = i."clusterId"
      WHERE ${Prisma.join(whereClauses, " AND ")}
    ),
    cluster_groups AS (
      SELECT
        fi."clusterId" AS id,
        MIN(fi."clusterTitle") AS title,
        MIN(fi."clusterSummary") AS summary,
        MAX(fi."publishedAt") AS "latestPublishedAt",
        MAX(fi."createdAt") AS "createdAt",
        CAST(ROUND(AVG(fi."qualityScore")) AS INTEGER) AS score,
        COUNT(*) AS "itemCount",
        COUNT(DISTINCT fi."sourceId") AS "sourceCount"
      FROM filtered_items fi
      WHERE fi."clusterId" IS NOT NULL
      GROUP BY fi."clusterId"
    ),
    single_entries AS (
      SELECT
        fi."itemId" AS id,
        'single' AS type,
        COALESCE(NULLIF(TRIM(fi."translatedTitle"), ''), fi."originalTitle") AS title,
        NULL AS summary,
        fi."publishedAt" AS "latestPublishedAt",
        fi."createdAt" AS "createdAt",
        fi."qualityScore" AS score,
        1 AS "sourceCount",
        1 AS "itemCount"
      FROM filtered_items fi
      LEFT JOIN cluster_groups cg ON cg.id = fi."clusterId"
      WHERE fi."clusterId" IS NULL OR cg."itemCount" = 1
    ),
    cluster_entries AS (
      SELECT
        cg.id AS id,
        'cluster' AS type,
        cg.title AS title,
        cg.summary AS summary,
        cg."latestPublishedAt" AS "latestPublishedAt",
        cg."createdAt" AS "createdAt",
        cg.score AS score,
        cg."sourceCount" AS "sourceCount",
        cg."itemCount" AS "itemCount"
      FROM cluster_groups cg
      WHERE cg."itemCount" > 1
    ),
    entry_candidates AS (
      SELECT id, type, title, summary, "latestPublishedAt", "createdAt", score, "sourceCount", "itemCount"
      FROM cluster_entries
      UNION ALL
      SELECT id, type, title, summary, "latestPublishedAt", "createdAt", score, "sourceCount", "itemCount"
      FROM single_entries
    )
  `;
}

function buildFeedEntryTitleFilter(title: string | null) {
  const normalizedTitle = normalizeTitleSearch(title);

  if (!normalizedTitle) {
    return Prisma.empty;
  }

  return Prisma.sql`WHERE LOWER(title) LIKE ${`%${normalizedTitle}%`}`;
}

function buildFeedEntryOrderBy(sort: FeedFilters["sort"]) {
  if (sort === "score_desc") {
    return Prisma.sql`ORDER BY score DESC, "latestPublishedAt" DESC, "itemCount" DESC, id DESC`;
  }

  return Prisma.sql`ORDER BY "latestPublishedAt" DESC, score DESC, "itemCount" DESC, id DESC`;
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
      const current = groups.get(source.groupId);
      if (current) {
        current.count += 1;
      } else {
        groups.set(source.groupId, {
          id: source.groupId,
          name: source.group.name,
          count: 1,
        });
      }
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

export async function listFeedGroupCounts(
  filters: FeedFilters & { rangeStart: Date | null; rangeEnd: Date | null },
): Promise<{
  groups: FeedGroupOption[];
  totalCount: number;
}> {
  const effectiveFilters = {
    ...filters,
    groupId: null,
  };
  const filteredItemsCte = buildFeedEntryCandidatesCte(effectiveFilters);
  const [groupRows, totalRows] = await Promise.all([
    prisma.$queryRaw<FeedGroupCountRow[]>(Prisma.sql`
      ${filteredItemsCte}
      SELECT
        s."groupId" AS id,
        g.name AS name,
        COUNT(*) AS count
      FROM filtered_items fi
      INNER JOIN "sources" s ON s.id = fi."sourceId"
      INNER JOIN "source_groups" g ON g.id = s."groupId"
      GROUP BY s."groupId", g.name
      ORDER BY g.name ASC
    `),
    prisma.$queryRaw<CountRow[]>(Prisma.sql`
      ${filteredItemsCte}
      SELECT COUNT(*) AS total
      FROM filtered_items
    `),
  ]);

  return {
    groups: groupRows.map((row) => ({
      id: row.id,
      name: row.name,
      count: toNumber(row.count),
    })),
    totalCount: toNumber(totalRows[0]?.total ?? BigInt(0)),
  };
}

export async function listFeedItems(
  filters: FeedFilters & { rangeStart: Date | null; rangeEnd: Date | null },
  pagination: {
    page: number;
    size: number;
  },
) {
  const entryCandidatesCte = buildFeedEntryCandidatesCte(filters);
  const titleFilter = buildFeedEntryTitleFilter(filters.title);
  const countRows = await prisma.$queryRaw<CountRow[]>(Prisma.sql`
    ${entryCandidatesCte}
    SELECT COUNT(*) AS total
    FROM entry_candidates
    ${titleFilter}
  `);
  const totalRaw = countRows[0]?.total ?? BigInt(0);
  const total = Number(totalRaw);
  const totalPages = Math.max(1, Math.ceil(total / pagination.size));
  const page = Math.min(Math.max(1, pagination.page), totalPages);
  const offset = (page - 1) * pagination.size;
  const pageRows = await prisma.$queryRaw<FeedEntryRow[]>(Prisma.sql`
    ${entryCandidatesCte}
    SELECT
      id,
      type AS "entryType",
      title,
      summary,
      "latestPublishedAt",
      "createdAt",
      score,
      "sourceCount",
      "itemCount"
    FROM entry_candidates
    ${titleFilter}
    ${buildFeedEntryOrderBy(filters.sort)}
    LIMIT ${pagination.size}
    OFFSET ${offset}
  `);
  const singleIds = pageRows.filter((row) => row.entryType === "single").map((row) => row.id);
  const clusterIds = pageRows.filter((row) => row.entryType === "cluster").map((row) => row.id);
  const [singleItems, clusterItems, groupCounts] = await Promise.all([
    singleIds.length > 0
      ? prisma.item.findMany({
          where: {
            id: {
              in: singleIds,
            },
          },
          include: {
            source: true,
          },
        })
      : Promise.resolve([]),
    clusterIds.length > 0
      ? prisma.item.findMany({
          where: buildItemWhere(filters, clusterIds),
          include: {
            source: true,
          },
          orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
        })
      : Promise.resolve([]),
    listFeedGroupCounts(filters),
  ]);
  const singleItemMap = new Map(singleItems.map((item) => [item.id, mapItemToFeedItem(item)]));
  const clusterItemMap = new Map<string, ItemWithSource[]>();

  for (const item of clusterItems) {
    if (!item.clusterId) {
      continue;
    }

    const current = clusterItemMap.get(item.clusterId) ?? [];
    current.push(item);
    clusterItemMap.set(item.clusterId, current);
  }

  const items = pageRows.flatMap<FeedEntryDTO>((row) => {
    if (row.entryType === "single") {
      const item = singleItemMap.get(row.id);
      return item ? [item] : [];
    }

    const previewItems = (clusterItemMap.get(row.id) ?? []).slice(0, 3).map(mapItemToClusterPreview);
    const itemCount = toNumber(row.itemCount);

    return [
      {
        id: row.id,
        type: "cluster",
        title: row.title,
        summary: row.summary ?? "",
        publishedAt: toIsoString(row.latestPublishedAt),
        createdAt: toIsoString(row.createdAt),
        latestPublishedAt: toIsoString(row.latestPublishedAt),
        score: toNumber(row.score),
        sourceCount: toNumber(row.sourceCount),
        itemCount,
        itemsPreview: previewItems,
        hasMoreItems: itemCount > previewItems.length,
      },
    ];
  });
  const nextCursor = page < totalPages ? pageRows[pageRows.length - 1]?.id ?? null : null;
  const normalizedPagination: FeedPagination = {
    page,
    size: pagination.size,
    total,
    totalPages,
  };

  return {
    items,
    groups: groupCounts.groups,
    groupTotalCount: groupCounts.totalCount,
    pagination: normalizedPagination,
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
