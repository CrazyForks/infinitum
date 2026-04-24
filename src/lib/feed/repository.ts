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
  clusterId?: string | null;
  title: string;
  summary: string | null;
  latestPublishedAt: Date | string;
  createdAt: Date | string;
  score: number | bigint;
  sourceCount: number | bigint;
  itemCount: number | bigint;
  upvotes?: number | bigint;
  downvotes?: number | bigint;
  recommendScore?: number | bigint;
};

type CountRow = {
  total: bigint;
};

type FeedGroupCountRow = {
  id: string;
  name: string;
  sortOrder: number | bigint;
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

export async function findExistingItemsForDedupeKeys(keys: Array<{ urlHash: string; dedupeSignature: string }>) {
  if (keys.length === 0) {
    return [];
  }

  return prisma.item.findMany({
    where: {
      OR: [
        {
          urlHash: {
            in: [...new Set(keys.map((key) => key.urlHash))],
          },
        },
        {
          dedupeSignature: {
            in: [...new Set(keys.map((key) => key.dedupeSignature))],
          },
        },
      ],
    },
  });
}

export async function updateSourceFetchMetadata(
  sourceId: string,
  data: {
    feedEtag?: string | null;
    feedLastModified?: string | null;
    feedContentHash?: string | null;
    lastFetchedAt: Date;
  },
) {
  return prisma.source.update({
    where: { id: sourceId },
    data,
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

  try {
    return await prisma.item.create({ data });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const existing = await findExistingItem(where.urlHash, where.dedupeSignature);

      if (existing) {
        return prisma.item.update({
          where: { id: existing.id },
          data,
        });
      }
    }

    throw error;
  }
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

export async function getLatestFeedItemUpdate() {
  return prisma.item.findFirst({
    select: {
      id: true,
      updatedAt: true,
    },
    where: {
      status: "processed",
      moderationStatus: {
        in: [...DISPLAYABLE_MODERATION_STATUSES],
      },
      source: {
        is: {
          enabled: true,
        },
      },
    },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
  });
}

export async function getLatestFeedSourceConfigUpdate() {
  const [latestSource, latestGroup] = await Promise.all([
    prisma.source.findFirst({
      select: {
        id: true,
        updatedAt: true,
      },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    }),
    prisma.sourceGroup.findFirst({
      select: {
        id: true,
        updatedAt: true,
      },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    }),
  ]);

  return {
    latestSource,
    latestGroup,
  };
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

function mapItemToClusterPreview(item: ItemWithSource): FeedClusterPreviewItemDTO {
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

function mapItemToFeedItem(item: ItemWithSource): FeedItemDTO {
  return {
    id: item.id,
    type: "single",
    clusterId: item.clusterId ?? item.id, // 用于投票的聚类ID
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
    upvotes: 0,
    downvotes: 0,
    userVote: null,
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
  filters: FeedFilters & {
    rangeStart: Date | null;
    rangeEnd: Date | null;
    publishedRangeStart: Date | null;
    publishedRangeEnd: Date | null;
  },
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
        ...(filters.publishedRangeStart || filters.publishedRangeEnd
          ? {
              publishedAt: {
                ...(filters.publishedRangeStart ? { gte: filters.publishedRangeStart } : {}),
                ...(filters.publishedRangeEnd ? { lte: filters.publishedRangeEnd } : {}),
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

/**
 * 计算综合推荐评分
 * 以AI评分为基准，访客推荐值做适当微调
 *
 * 算法：
 * - 基准分 = AI评分 (0-100)
 * - 投票微调 = clamp(upvotes - downvotes, -20, +20)
 * - 来源加权 = min(8, max(0, sourceCount - 1) * 3)
 * - 条目加权 = min(4, floor(log2(itemCount)))
 * - 综合评分 = clamp(基准分 + 投票微调 + 来源加权 + 条目加权, 0, 100)
 */
function calculateRecommendScore(
  aiScore: number,
  upvotes: number,
  downvotes: number,
  sourceCount: number,
  itemCount: number,
): number {
  const netVotes = upvotes - downvotes;
  const voteBoost = Math.max(-20, Math.min(20, netVotes));
  const sourceBoost = Math.min(8, Math.max(0, sourceCount - 1) * 3);
  const itemBoost = Math.min(4, Math.floor(Math.log2(Math.max(1, itemCount))));

  return Math.max(0, Math.min(100, aiScore + voteBoost + sourceBoost + itemBoost));
}

function buildRecommendScoreSql(input: {
  aiScore: Prisma.Sql;
  upvotes: Prisma.Sql;
  downvotes: Prisma.Sql;
  sourceCount: Prisma.Sql;
  itemCount: Prisma.Sql;
}) {
  const voteBoost = Prisma.sql`CASE WHEN (${input.upvotes} - ${input.downvotes}) > 20 THEN 20 WHEN (${input.upvotes} - ${input.downvotes}) < -20 THEN -20 ELSE (${input.upvotes} - ${input.downvotes}) END`;
  const sourceBoost = Prisma.sql`CASE WHEN ((${input.sourceCount} - 1) * 3) > 8 THEN 8 WHEN ((${input.sourceCount} - 1) * 3) < 0 THEN 0 ELSE ((${input.sourceCount} - 1) * 3) END`;
  const itemBoost = Prisma.sql`CASE WHEN ${input.itemCount} >= 16 THEN 4 WHEN ${input.itemCount} >= 8 THEN 3 WHEN ${input.itemCount} >= 4 THEN 2 WHEN ${input.itemCount} >= 2 THEN 1 ELSE 0 END`;
  const combinedScore = Prisma.sql`${input.aiScore} + ${voteBoost} + ${sourceBoost} + ${itemBoost}`;

  return Prisma.sql`CASE WHEN ${combinedScore} > 100 THEN 100 WHEN ${combinedScore} < 0 THEN 0 ELSE ${combinedScore} END`;
}

function buildFeedEntryCandidatesCte(
  filters: FeedFilters & {
    rangeStart: Date | null;
    rangeEnd: Date | null;
    publishedRangeStart: Date | null;
    publishedRangeEnd: Date | null;
  },
) {
  const whereClauses: Prisma.Sql[] = [
    Prisma.sql`i.status = ${"processed"}`,
    Prisma.sql`i."moderationStatus" IN (${Prisma.join([...DISPLAYABLE_MODERATION_STATUSES])})`,
    Prisma.sql`s.enabled = ${true}`,
    Prisma.sql`(i."clusterId" IS NULL OR c.status = ${"active"})`,
  ];

  if (filters.rangeStart) {
    // SQLite 存储的是毫秒时间戳，需要将 Date 转换为时间戳数字
    whereClauses.push(Prisma.sql`i."createdAt" >= ${filters.rangeStart.getTime()}`);
  }

  if (filters.rangeEnd) {
    // SQLite 存储的是毫秒时间戳，需要将 Date 转换为时间戳数字
    whereClauses.push(Prisma.sql`i."createdAt" <= ${filters.rangeEnd.getTime()}`);
  }

  if (filters.publishedRangeStart) {
    whereClauses.push(Prisma.sql`i."publishedAt" >= ${filters.publishedRangeStart.getTime()}`);
  }

  if (filters.publishedRangeEnd) {
    whereClauses.push(Prisma.sql`i."publishedAt" <= ${filters.publishedRangeEnd.getTime()}`);
  }

  if (filters.groupId) {
    whereClauses.push(Prisma.sql`s."groupId" = ${filters.groupId}`);
  }

  if (filters.sourceId) {
    whereClauses.push(Prisma.sql`s.id = ${filters.sourceId}`);
  }

  const clusterAiScore = Prisma.sql`CAST(ROUND(AVG(fi."qualityScore")) AS INTEGER)`;
  const clusterItemCount = Prisma.sql`COUNT(*)`;
  const clusterSourceCount = Prisma.sql`COUNT(DISTINCT fi."sourceId")`;
  const clusterUpvotes = Prisma.sql`COALESCE(MIN(cc.upvotes), 0)`;
  const clusterDownvotes = Prisma.sql`COALESCE(MIN(cc.downvotes), 0)`;
  const singleUpvotes = Prisma.sql`COALESCE(cg.upvotes, 0)`;
  const singleDownvotes = Prisma.sql`COALESCE(cg.downvotes, 0)`;

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
        ${clusterAiScore} AS score,
        ${clusterItemCount} AS "itemCount",
        ${clusterSourceCount} AS "sourceCount",
        ${clusterUpvotes} AS upvotes,
        ${clusterDownvotes} AS downvotes,
        -- 综合推荐评分 = AI评分 + 投票微调 + 来源/条目聚合加权
        ${buildRecommendScoreSql({
          aiScore: clusterAiScore,
          upvotes: clusterUpvotes,
          downvotes: clusterDownvotes,
          sourceCount: clusterSourceCount,
          itemCount: clusterItemCount,
        })} AS "recommendScore"
      FROM filtered_items fi
      INNER JOIN "content_clusters" cc ON cc.id = fi."clusterId"
      WHERE fi."clusterId" IS NOT NULL
      GROUP BY fi."clusterId"
    ),
    single_entries AS (
      SELECT
        fi."itemId" AS id,
        'single' AS type,
        fi."clusterId" AS "clusterId",
        COALESCE(NULLIF(TRIM(fi."translatedTitle"), ''), fi."originalTitle") AS title,
        NULL AS summary,
        fi."publishedAt" AS "latestPublishedAt",
        fi."createdAt" AS "createdAt",
        fi."qualityScore" AS score,
        1 AS "sourceCount",
        1 AS "itemCount",
        COALESCE(cg.upvotes, 0) AS upvotes,
        COALESCE(cg.downvotes, 0) AS downvotes,
        -- 综合推荐评分 = AI评分 + 投票微调，单条来源/条目加权为 0
        ${buildRecommendScoreSql({
          aiScore: Prisma.sql`fi."qualityScore"`,
          upvotes: singleUpvotes,
          downvotes: singleDownvotes,
          sourceCount: Prisma.sql`1`,
          itemCount: Prisma.sql`1`,
        })} AS "recommendScore"
      FROM filtered_items fi
      LEFT JOIN cluster_groups cg ON cg.id = fi."clusterId"
      WHERE fi."clusterId" IS NULL OR cg."itemCount" = 1
    ),
    cluster_entries AS (
      SELECT
        cg.id AS id,
        'cluster' AS type,
        cg.id AS "clusterId",
        cg.title AS title,
        cg.summary AS summary,
        cg."latestPublishedAt" AS "latestPublishedAt",
        cg."createdAt" AS "createdAt",
        cg.score AS score,
        cg."sourceCount" AS "sourceCount",
        cg."itemCount" AS "itemCount",
        cg.upvotes AS upvotes,
        cg.downvotes AS downvotes,
        cg."recommendScore" AS "recommendScore"
      FROM cluster_groups cg
      WHERE cg."itemCount" > 1
    ),
    entry_candidates AS (
      SELECT id, type, NULL AS "clusterId", title, summary, "latestPublishedAt", "createdAt", score, "sourceCount", "itemCount", upvotes, downvotes, "recommendScore"
      FROM cluster_entries
      UNION ALL
      SELECT id, type, "clusterId", title, summary, "latestPublishedAt", "createdAt", score, "sourceCount", "itemCount", upvotes, downvotes, "recommendScore"
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
    // 按综合推荐评分降序（AI评分 + 访客投票微调）
    return Prisma.sql`ORDER BY "recommendScore" DESC, "latestPublishedAt" DESC, "itemCount" DESC, id DESC`;
  }

  return Prisma.sql`ORDER BY "createdAt" DESC, "recommendScore" DESC, "itemCount" DESC, id DESC`;
}

export async function listFeedFilterOptions(): Promise<{
  groups: FeedGroupOption[];
  sources: FeedSourceOption[];
}> {
  const [groups, sources] = await Promise.all([
    prisma.sourceGroup.findMany({
      where: { sources: { some: { enabled: true } } },
      include: {
        _count: {
          select: {
            sources: { where: { enabled: true } },
          },
        },
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    prisma.source.findMany({
      where: { enabled: true },
      orderBy: [{ name: "asc" }],
    }),
  ]);

  return {
    groups: groups.map((group) => ({
      id: group.id,
      name: group.name,
      count: group._count.sources,
    })),
    sources: sources.map((source) => ({
      id: source.id,
      name: source.name,
      groupId: source.groupId,
    })),
  };
}

async function listFeedGroupCounts(
  filters: FeedFilters & {
    rangeStart: Date | null;
    rangeEnd: Date | null;
    publishedRangeStart: Date | null;
    publishedRangeEnd: Date | null;
  },
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
        g."sortOrder" AS "sortOrder",
        COUNT(*) AS count
      FROM filtered_items fi
      INNER JOIN "sources" s ON s.id = fi."sourceId"
      INNER JOIN "source_groups" g ON g.id = s."groupId"
      GROUP BY s."groupId", g.name, g."sortOrder"
      ORDER BY g."sortOrder" ASC, g.name ASC
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
  filters: FeedFilters & {
    rangeStart: Date | null;
    rangeEnd: Date | null;
    publishedRangeStart: Date | null;
    publishedRangeEnd: Date | null;
  },
  pagination: {
    page: number;
    size: number;
  },
  visitorId?: string | undefined,
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
      "clusterId",
      title,
      summary,
      "latestPublishedAt",
      "createdAt",
      "recommendScore" AS score,
      "sourceCount",
      "itemCount",
      upvotes,
      downvotes,
      "recommendScore"
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

  // 获取访客对聚类的投票状态（包括聚合和单条）
  const votedClusterIds = pageRows
    .map((row) => row.entryType === "cluster" ? row.id : row.clusterId)
    .filter((id): id is string => id != null);

  const userVotes = new Map<string, "upvote" | "downvote">();
  if (visitorId && votedClusterIds.length > 0) {
    const votes = await prisma.visitorClusterVote.findMany({
      where: {
        clusterId: { in: votedClusterIds },
        visitorId,
      },
    });
    for (const vote of votes) {
      userVotes.set(vote.clusterId, vote.voteType as "upvote" | "downvote");
    }
  }

  const items = pageRows.flatMap<FeedEntryDTO>((row) => {
    if (row.entryType === "single") {
      const item = singleItemMap.get(row.id);
      if (!item) {
        return [];
      }
      // 为单条卡片注入 clusterId（用于投票）和正确的投票数
      // 使用综合推荐评分（AI评分 + 访客投票微调）
      const clusterId = row.clusterId ?? item.id;
      return [{
        ...item,
        clusterId,
        score: toNumber(row.recommendScore ?? row.score),
        upvotes: toNumber(row.upvotes ?? 0),
        downvotes: toNumber(row.downvotes ?? 0),
        userVote: userVotes.get(clusterId) ?? null,
      }];
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
        score: toNumber(row.recommendScore ?? row.score),
        sourceCount: toNumber(row.sourceCount),
        itemCount,
        upvotes: toNumber(row.upvotes ?? 0),
        downvotes: toNumber(row.downvotes ?? 0),
        userVote: userVotes.get(row.id) ?? null,
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
  filters: FeedFilters & {
    rangeStart: Date | null;
    rangeEnd: Date | null;
    publishedRangeStart: Date | null;
    publishedRangeEnd: Date | null;
  },
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
    orderBy: [{ latestPublishedAt: "desc" }, { createdAt: "desc" }],
  });

  return clusters.map((cluster) => {
    // 计算综合推荐评分（AI评分 + 投票微调 + 来源/条目聚合加权）
    const clusterWithVotes = cluster as typeof cluster & { upvotes: number; downvotes: number };
    const sourceCount = new Set(cluster.items.map((item) => item.sourceId)).size;
    const recommendScore = calculateRecommendScore(
      cluster.score,
      clusterWithVotes.upvotes ?? 0,
      clusterWithVotes.downvotes ?? 0,
      sourceCount,
      cluster.items.length,
    );

    return {
      id: cluster.id,
      title: cluster.title,
      summary: cluster.summary,
      score: recommendScore,
      itemCount: cluster.items.length, // 使用实际查询到的条目数，而不是数据库中的 itemCount 字段
      latestPublishedAt: cluster.latestPublishedAt.toISOString(),
      status: cluster.status,
      items: cluster.items.map(mapItemToClusterPreview),
    } satisfies ClusterDTO;
  });
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

  // 计算综合推荐评分（AI评分 + 投票微调 + 来源/条目聚合加权）
  const clusterWithVotes = cluster as typeof cluster & { upvotes: number; downvotes: number };
  const sourceCount = new Set(cluster.items.map((item) => item.sourceId)).size;
  const recommendScore = calculateRecommendScore(
    cluster.score,
    clusterWithVotes.upvotes ?? 0,
    clusterWithVotes.downvotes ?? 0,
    sourceCount,
    cluster.items.length,
  );

  return {
    id: cluster.id,
    title: cluster.title,
    summary: cluster.summary,
    score: recommendScore,
    itemCount: cluster.itemCount,
    latestPublishedAt: cluster.latestPublishedAt.toISOString(),
    status: cluster.status,
    items: cluster.items.map(mapItemToClusterPreview),
  } satisfies ClusterDTO;
}
