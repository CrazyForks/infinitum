import {
  type FetchRun,
  FetchRunStatus,
  type Item,
  Prisma,
  type Source,
  type SourceGroup,
} from "@prisma/client";

import { prisma } from "@/lib/db";
import { getDisplaySummary, getDisplayTitle, shouldTranslateTitle } from "@/lib/feed/presentation";
import { buildRecommendScoreSql, calculateRecommendScore } from "@/lib/feed/recommend-score";
import { toGroupBadge, type GroupBadge } from "@/lib/groups/badge";
import { getDatabaseSearchTerms } from "@/lib/utils/search";
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

type ItemWithSource = Item & { source: Source & { group?: SourceGroup | null } };
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
  totalItemCount?: number | bigint;
  upvotes?: number | bigint;
  downvotes?: number | bigint;
  recommendScore?: number | bigint;
};

type CountRow = {
  total: bigint;
};

type IdRow = {
  id: string;
};

type ClusterWithPreviewItems = Prisma.ContentClusterGetPayload<{
  include: {
    items: {
      include: {
        source: {
          include: {
            group: true;
          };
        };
      };
    };
  };
}>;

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
    healthStatus?: "unknown" | "healthy" | "failed";
    healthMessage?: string | null;
    healthCheckedAt?: Date | null;
  },
) {
  return prisma.source.update({
    where: { id: sourceId },
    data,
  });
}

export async function updateSourceHealthStatus(
  sourceId: string,
  data: {
    healthStatus: "unknown" | "healthy" | "failed";
    healthMessage: string | null;
    healthCheckedAt: Date;
  },
) {
  const current = await prisma.source.findUnique({
    where: { id: sourceId },
    select: { healthStatus: true, name: true },
  });

  const previousStatus = current?.healthStatus ?? "unknown";
  const sourceName = current?.name ?? sourceId;

  const updated = await prisma.source.update({
    where: { id: sourceId },
    data,
  });

  // Log health status changes
  if (previousStatus !== data.healthStatus) {
    await prisma.sourceHealthLog.create({
      data: {
        sourceId,
        sourceName,
        fromStatus: previousStatus,
        toStatus: data.healthStatus,
        message: data.healthMessage,
        changedAt: data.healthCheckedAt,
      },
    });
  }

  return updated;
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
    originalTitle: item.originalTitle,
    originalUrl: item.originalUrl,
    publishedAt: item.publishedAt.toISOString(),
    sourceName: item.source.name,
    author: item.author,
    summary: getDisplaySummary(item.summaryText, item.rssExcerpt, item.fullText ?? item.rssContent),
    group: toGroupBadge(item.source.group),
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
    group: toGroupBadge(item.source.group),
    score: item.qualityScore,
    sourceCount: 1,
    itemCount: 1,
    upvotes: 0,
    downvotes: 0,
    userVote: null,
    canRegenerateTranslation: shouldTranslateTitle(item.originalTitle),
  };
}

function selectDominantGroupBadge(items: ItemWithSource[], selectedGroup: GroupBadge | null): GroupBadge | null {
  if (selectedGroup) {
    return selectedGroup;
  }

  const groupCounts = new Map<string, { group: GroupBadge; count: number; firstIndex: number }>();
  items.forEach((item, index) => {
    const group = toGroupBadge(item.source.group);
    if (!group) {
      return;
    }

    const current = groupCounts.get(group.id);
    groupCounts.set(group.id, {
      group,
      count: (current?.count ?? 0) + 1,
      firstIndex: current?.firstIndex ?? index,
    });
  });

  return [...groupCounts.values()].sort((left, right) => {
    if (right.count !== left.count) {
      return right.count - left.count;
    }

    return left.firstIndex - right.firstIndex;
  })[0]?.group ?? null;
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

function sanitizeFts5Query(input: string | null) {
  const trimmed = input?.trim().toLocaleLowerCase() ?? "";
  if (!trimmed) {
    return null;
  }
  // Escape double quotes by doubling them (FTS5 convention)
  // Wrap in double quotes so FTS5 treats the whole input as a literal phrase
  // (prevents AND/OR/NOT from being interpreted as operators)
  const escaped = trimmed.replace(/"/g, '""');
  return `"${escaped}"`;
}

function sanitizeLikeQuery(input: string | null) {
  const trimmed = input?.trim() ?? "";
  if (!trimmed) {
    return null;
  }

  return `%${trimmed.replace(/[\\%_]/g, "\\$&")}%`;
}

function buildAdminClusterSearchCte(searchTerms: string[]) {
  const termMatchQueries = searchTerms.flatMap((term, index) => {
    const likeSearchTerm = sanitizeLikeQuery(term);
    if (!likeSearchTerm) {
      return [];
    }

    const likeEscape = "\\";
    const queries: Prisma.Sql[] = [
      Prisma.sql`
        SELECT ${index} AS term_index, cc.id AS cluster_id
        FROM "content_clusters" cc
        WHERE COALESCE(cc.title, '') LIKE ${likeSearchTerm} ESCAPE ${likeEscape}
      `,
      Prisma.sql`
        SELECT DISTINCT ${index} AS term_index, i."clusterId" AS cluster_id
        FROM "items" i
        WHERE i."clusterId" IS NOT NULL
          AND i.status = ${"processed"}
          AND i."moderationStatus" IN (${Prisma.join([...DISPLAYABLE_MODERATION_STATUSES])})
          AND (
            COALESCE(i."originalTitle", '') LIKE ${likeSearchTerm} ESCAPE ${likeEscape}
            OR COALESCE(i."translatedTitle", '') LIKE ${likeSearchTerm} ESCAPE ${likeEscape}
          )
      `,
    ];

    return queries;
  });

  if (termMatchQueries.length === 0) {
    return null;
  }

  return Prisma.sql`
    WITH term_matches AS (
      ${Prisma.join(termMatchQueries, "\nUNION ALL\n")}
    ),
    matched_clusters AS (
      SELECT cluster_id AS id
      FROM term_matches
      WHERE cluster_id IS NOT NULL
      GROUP BY cluster_id
      HAVING COUNT(DISTINCT term_index) = ${searchTerms.length}
    )
  `;
}

function toNumber(value: number | bigint) {
  return typeof value === "bigint" ? Number(value) : value;
}

function toIsoString(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function mapClusterToAdminDto(cluster: ClusterWithPreviewItems, latestItemUpdatedAt?: Date | null) {
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
    latestItemUpdatedAt: (latestItemUpdatedAt ?? cluster.updatedAt).toISOString(),
    status: cluster.status,
    items: cluster.items.slice(0, 5).map(mapItemToClusterPreview),
  } satisfies ClusterDTO;
}

async function getLatestItemUpdatedAtByCluster(clusterIds: string[]) {
  if (clusterIds.length === 0) {
    return new Map<string, Date>();
  }

  const rows = await prisma.item.groupBy({
    by: ["clusterId"],
    where: {
      clusterId: { in: clusterIds },
      status: "processed",
      moderationStatus: {
        in: [...DISPLAYABLE_MODERATION_STATUSES],
      },
    },
    _max: {
      updatedAt: true,
    },
  });

  return new Map(
    rows.flatMap((row) => (row.clusterId && row._max.updatedAt ? [[row.clusterId, row._max.updatedAt] as const] : [])),
  );
}

function buildFeedEntryCandidatesCte(
  filters: FeedFilters & {
    rangeStart: Date | null;
    rangeEnd: Date | null;
    publishedRangeStart: Date | null;
    publishedRangeEnd: Date | null;
  },
  searchTerm: string | null = null,
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

  const likeSearchTerm = sanitizeLikeQuery(filters.title);

  if (searchTerm || likeSearchTerm) {
    const searchClauses: Prisma.Sql[] = [];

    if (searchTerm) {
      searchClauses.push(Prisma.sql`i.rowid IN (SELECT rowid FROM items_fts WHERE items_fts MATCH ${searchTerm})`);
    }

    if (likeSearchTerm) {
      const likeEscape = "\\";
      searchClauses.push(Prisma.sql`COALESCE(i."originalTitle", '') LIKE ${likeSearchTerm} ESCAPE ${likeEscape}`);
      searchClauses.push(Prisma.sql`COALESCE(i."translatedTitle", '') LIKE ${likeSearchTerm} ESCAPE ${likeEscape}`);
      searchClauses.push(Prisma.sql`COALESCE(i.author, '') LIKE ${likeSearchTerm} ESCAPE ${likeEscape}`);
      searchClauses.push(Prisma.sql`COALESCE(i."rssExcerpt", '') LIKE ${likeSearchTerm} ESCAPE ${likeEscape}`);
      searchClauses.push(Prisma.sql`COALESCE(i."rssContent", '') LIKE ${likeSearchTerm} ESCAPE ${likeEscape}`);
      searchClauses.push(Prisma.sql`COALESCE(i."fullText", '') LIKE ${likeSearchTerm} ESCAPE ${likeEscape}`);
      searchClauses.push(Prisma.sql`COALESCE(i."summaryText", '') LIKE ${likeSearchTerm} ESCAPE ${likeEscape}`);
      searchClauses.push(Prisma.sql`COALESCE(c.title, '') LIKE ${likeSearchTerm} ESCAPE ${likeEscape}`);
      searchClauses.push(Prisma.sql`COALESCE(c.summary, '') LIKE ${likeSearchTerm} ESCAPE ${likeEscape}`);
    }

    whereClauses.push(Prisma.sql`(${Prisma.join(searchClauses, " OR ")})`);
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
    cluster_total_counts AS (
      SELECT
        i."clusterId",
        COUNT(*) AS total_count
      FROM "items" i
      INNER JOIN "sources" s ON s.id = i."sourceId" AND s.enabled = true
      WHERE i.status = 'processed'
        AND i."moderationStatus" IN ('allowed', 'restored')
        AND i."clusterId" IS NOT NULL
      GROUP BY i."clusterId"
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
        MAX(COALESCE(ctc.total_count, 0)) AS "totalItemCount",
        ${clusterUpvotes} AS upvotes,
        ${clusterDownvotes} AS downvotes,
        -- 综合推荐评分 = AI锚点分 + 有限反馈微调 + 来源/条目聚合加权
        ${buildRecommendScoreSql({
          aiScore: clusterAiScore,
          upvotes: clusterUpvotes,
          downvotes: clusterDownvotes,
          sourceCount: clusterSourceCount,
          itemCount: clusterItemCount,
        })} AS "recommendScore"
      FROM filtered_items fi
      INNER JOIN "content_clusters" cc ON cc.id = fi."clusterId"
      LEFT JOIN cluster_total_counts ctc ON ctc."clusterId" = fi."clusterId"
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
        -- 综合推荐评分 = AI锚点分 + 有限反馈微调，单条来源/条目加权为 0
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
        cg."totalItemCount" AS "totalItemCount",
        cg.upvotes AS upvotes,
        cg.downvotes AS downvotes,
        cg."recommendScore" AS "recommendScore"
      FROM cluster_groups cg
      WHERE cg."itemCount" > 1
    ),
    entry_candidates AS (
      SELECT id, type, NULL AS "clusterId", title, summary, "latestPublishedAt", "createdAt", score, "sourceCount", "itemCount", "totalItemCount", upvotes, downvotes, "recommendScore"
      FROM cluster_entries
      UNION ALL
      SELECT id, type, "clusterId", title, summary, "latestPublishedAt", "createdAt", score, "sourceCount", "itemCount", CAST(1 AS INTEGER) AS "totalItemCount", upvotes, downvotes, "recommendScore"
      FROM single_entries
    )
  `;
}

function buildFeedEntryOrderBy(sort: FeedFilters["sort"]) {
  if (sort === "score_desc") {
    // 按综合推荐评分降序（AI锚点分 + 访客反馈 + 聚合加权）
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
      color: toGroupBadge(group)?.color,
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
  const entryCandidatesCte = buildFeedEntryCandidatesCte(effectiveFilters, null);
  const [groupRows, totalRows] = await Promise.all([
    prisma.$queryRaw<FeedGroupCountRow[]>(Prisma.sql`
      ${entryCandidatesCte},
      single_entry_groups AS (
        SELECT s."groupId" AS group_id
        FROM single_entries se
        INNER JOIN "items" i ON i.id = se.id
        INNER JOIN "sources" s ON s.id = i."sourceId"
        WHERE s."groupId" IS NOT NULL
      ),
      cluster_items_by_group AS (
        SELECT
          ce.id AS cluster_id,
          s."groupId" AS group_id,
          COUNT(*) AS cnt
        FROM cluster_entries ce
        INNER JOIN "items" i ON i."clusterId" = ce.id
        INNER JOIN "sources" s ON s.id = i."sourceId"
        WHERE s."groupId" IS NOT NULL
        GROUP BY ce.id, s."groupId"
      ),
      cluster_dominant_group AS (
        SELECT cluster_id, group_id
        FROM (
          SELECT
            cluster_id,
            group_id,
            ROW_NUMBER() OVER (PARTITION BY cluster_id ORDER BY cnt DESC) AS rn
          FROM cluster_items_by_group
        )
        WHERE rn = 1
      ),
      all_entry_groups AS (
        SELECT group_id FROM single_entry_groups
        UNION ALL
        SELECT group_id FROM cluster_dominant_group
      )
      SELECT
        aeg.group_id AS id,
        g.name AS name,
        g."sortOrder" AS "sortOrder",
        COUNT(*) AS count
      FROM all_entry_groups aeg
      INNER JOIN "source_groups" g ON g.id = aeg.group_id
      GROUP BY aeg.group_id
      ORDER BY g."sortOrder" ASC, g.name ASC
    `),
    prisma.$queryRaw<CountRow[]>(Prisma.sql`
      ${entryCandidatesCte}
      SELECT COUNT(*) AS total
      FROM entry_candidates
    `),
  ]);

  return {
    groups: groupRows.map((row) => ({
      id: row.id,
      name: row.name,
      count: toNumber(row.count),
      color: toGroupBadge(row)?.color,
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
  const searchTerm = sanitizeFts5Query(filters.title);
  const entryCandidatesCte = buildFeedEntryCandidatesCte(filters, searchTerm);
  const countRows = await prisma.$queryRaw<CountRow[]>(Prisma.sql`
    ${entryCandidatesCte}
    SELECT COUNT(*) AS total
    FROM entry_candidates
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
      "totalItemCount",
      upvotes,
      downvotes,
      "recommendScore"
    FROM entry_candidates
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
            source: {
              include: {
                group: true,
              },
            },
          },
        })
      : Promise.resolve([]),
    clusterIds.length > 0
      ? prisma.item.findMany({
          where: buildItemWhere(filters, clusterIds),
          include: {
            source: {
              include: {
                group: true,
              },
            },
          },
          orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
        })
      : Promise.resolve([]),
    listFeedGroupCounts(filters),
  ]);
  const singleItemMap = new Map(singleItems.map((item) => [item.id, mapItemToFeedItem(item)]));
  const clusterItemMap = new Map<string, ItemWithSource[]>();
  const selectedGroup = filters.groupId
    ? toGroupBadge(groupCounts.groups.find((group) => group.id === filters.groupId))
    : null;

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
      // 使用综合推荐评分（AI锚点分 + 访客反馈）
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

    const clusterItemsForEntry = clusterItemMap.get(row.id) ?? [];
    const previewItems = clusterItemsForEntry.slice(0, 3).map(mapItemToClusterPreview);
    const totalCount = toNumber(row.totalItemCount ?? row.itemCount);

    return [
      {
        id: row.id,
        type: "cluster",
        title: row.title,
        summary: row.summary ?? "",
        group: selectDominantGroupBadge(clusterItemsForEntry, selectedGroup),
        publishedAt: toIsoString(row.latestPublishedAt),
        createdAt: toIsoString(row.createdAt),
        latestPublishedAt: toIsoString(row.latestPublishedAt),
        score: toNumber(row.recommendScore ?? row.score),
        sourceCount: toNumber(row.sourceCount),
        itemCount: totalCount,
        upvotes: toNumber(row.upvotes ?? 0),
        downvotes: toNumber(row.downvotes ?? 0),
        userVote: userVotes.get(row.id) ?? null,
        itemsPreview: previewItems,
        hasMoreItems: totalCount > previewItems.length,
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
    include: {
      source: {
        include: {
          group: true,
        },
      },
    },
    orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
  });

  return items.map(mapItemToClusterPreview);
}

export async function listFilteredItems(page = 1, pageSize = 20) {
  const skip = (page - 1) * pageSize;
  const [items, total] = await Promise.all([
    prisma.item.findMany({
      where: { moderationStatus: "filtered" },
      include: { source: true },
      orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
      take: pageSize,
      skip,
    }),
    prisma.item.count({ where: { moderationStatus: "filtered" } }),
  ]);

  return { items: items.map(mapItemToReviewItem), total, page, pageSize };
}

export async function listAdminClusters(
  page = 1,
  pageSize = 20,
  search?: string | null,
  options?: { minItemCount?: number | null },
) {
  const skip = (page - 1) * pageSize;
  const searchTerms = getDatabaseSearchTerms(search);
  const minItemCount = options?.minItemCount;
  const searchCte = buildAdminClusterSearchCte(searchTerms);
  const minItemCountClause =
    typeof minItemCount === "number" ? Prisma.sql`WHERE cc."itemCount" >= ${minItemCount}` : Prisma.empty;
  const itemUpdatedJoin = Prisma.sql`
    LEFT JOIN "items" latest_items ON latest_items."clusterId" = cc.id
      AND latest_items.status = ${"processed"}
      AND latest_items."moderationStatus" IN (${Prisma.join([...DISPLAYABLE_MODERATION_STATUSES])})
  `;
  const orderByLatestItemUpdatedAt = Prisma.sql`
    ORDER BY MAX(latest_items."updatedAt") DESC, MAX(cc."updatedAt") DESC, cc.id DESC
  `;

  if (searchCte) {
    const [idRows, totalRows] = await Promise.all([
      prisma.$queryRaw<IdRow[]>(Prisma.sql`
        ${searchCte}
        SELECT cc.id
        FROM "content_clusters" cc
        INNER JOIN matched_clusters mc ON mc.id = cc.id
        ${itemUpdatedJoin}
        ${minItemCountClause}
        GROUP BY cc.id
        ${orderByLatestItemUpdatedAt}
        LIMIT ${pageSize}
        OFFSET ${skip}
      `),
      prisma.$queryRaw<CountRow[]>(Prisma.sql`
        ${searchCte}
        SELECT COUNT(*) AS total
        FROM "content_clusters" cc
        INNER JOIN matched_clusters mc ON mc.id = cc.id
        ${minItemCountClause}
      `),
    ]);
    const ids = idRows.map((row) => row.id);
    const order = new Map(ids.map((id, index) => [id, index]));
    const [clusters, latestItemUpdatedAtByCluster] = await Promise.all([
      ids.length > 0
        ? prisma.contentCluster.findMany({
            where: { id: { in: ids } },
            include: {
              items: {
                where: {
                  status: "processed",
                  moderationStatus: {
                    in: [...DISPLAYABLE_MODERATION_STATUSES],
                  },
                },
                include: {
                  source: {
                    include: {
                      group: true,
                    },
                  },
                },
                orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
                take: 5,
              },
            },
          })
        : [],
      getLatestItemUpdatedAtByCluster(ids),
    ]);
    const mappedClusters = clusters
      .sort((left, right) => (order.get(left.id) ?? 0) - (order.get(right.id) ?? 0))
      .map((cluster) => mapClusterToAdminDto(cluster, latestItemUpdatedAtByCluster.get(cluster.id)));

    return {
      clusters: mappedClusters,
      total: toNumber(totalRows[0]?.total ?? BigInt(0)),
      page,
      pageSize,
    };
  }

  const where: Prisma.ContentClusterWhereInput = {
    ...(typeof minItemCount === "number" ? { itemCount: { gte: minItemCount } } : {}),
  };

  const [idRows, total] = await Promise.all([
    prisma.$queryRaw<IdRow[]>(Prisma.sql`
      SELECT cc.id
      FROM "content_clusters" cc
      ${itemUpdatedJoin}
      ${minItemCountClause}
      GROUP BY cc.id
      ${orderByLatestItemUpdatedAt}
      LIMIT ${pageSize}
      OFFSET ${skip}
    `),
    prisma.contentCluster.count({ where }),
  ]);
  const ids = idRows.map((row) => row.id);
  const order = new Map(ids.map((id, index) => [id, index]));
  const [clusters, latestItemUpdatedAtByCluster] = await Promise.all([
    ids.length > 0
      ? prisma.contentCluster.findMany({
          where: { id: { in: ids } },
          include: {
            items: {
              where: {
                status: "processed",
                moderationStatus: {
                  in: [...DISPLAYABLE_MODERATION_STATUSES],
                },
              },
              include: {
                source: {
                  include: {
                    group: true,
                  },
                },
              },
              orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
              take: 5,
            },
          },
        })
      : [],
    getLatestItemUpdatedAtByCluster(ids),
  ]);

  const mappedClusters = clusters
    .sort((left, right) => (order.get(left.id) ?? 0) - (order.get(right.id) ?? 0))
    .map((cluster) => mapClusterToAdminDto(cluster, latestItemUpdatedAtByCluster.get(cluster.id)));
  return {
    clusters: mappedClusters,
    total,
    page,
    pageSize,
  };
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
        include: {
          source: {
            include: {
              group: true,
            },
          },
        },
        orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
      },
    },
  });

  if (!cluster) {
    return null;
  }

  const latestItemUpdatedAt = cluster.items.reduce<Date | null>((latest, item) => {
    if (!latest || item.updatedAt.getTime() > latest.getTime()) {
      return item.updatedAt;
    }
    return latest;
  }, null);

  return {
    ...mapClusterToAdminDto(cluster, latestItemUpdatedAt),
    itemCount: cluster.items.length,
    items: cluster.items.map(mapItemToClusterPreview),
  } satisfies ClusterDTO;
}
