import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { buildRecommendScoreSql } from "@/lib/feed/recommend-score";

export type DailyArticleStat = {
  date: string;
  count: number;
};

export type DailyAiUsageStat = {
  date: string;
  totalCalls: number;
  summaries: number;
  analyses: number;
  clusterMatches: number;
  clusterMerges: number;
  clusterSummaries: number;
};

export type DailySourceHealthStat = {
  date: string;
  healthy: number;
  failed: number;
  unknown: number;
};

export type QualityScoreBucket = {
  range: string;
  min: number;
  max: number;
  count: number;
};

export type IngestionMetrics = {
  dailyArticleStats: DailyArticleStat[];
  dailyAiUsageStats: DailyAiUsageStat[];
  dailySourceHealthStats: DailySourceHealthStat[];
  qualityScoreDistribution: QualityScoreBucket[];
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build an array of ISO date strings (YYYY-MM-DD) for the last `days` days, oldest first. */
function generateDateRange(days: number): string[] {
  const dates: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

type AiBreakdown = {
  summaries: number;
  analyses: number;
  clusterMatches: number;
  clusterMerges: number;
  clusterSummaries: number;
};

/** Parse the JSON breakdown stored on a task run into typed counts. */
function parseAiBreakdown(json: string | null): AiBreakdown {
  const result: AiBreakdown = { summaries: 0, analyses: 0, clusterMatches: 0, clusterMerges: 0, clusterSummaries: 0 };
  if (!json) return result;

  try {
    const breakdown = JSON.parse(json) as { key: string; actual: number }[];
    for (const item of breakdown) {
      switch (item.key) {
        case "item_summary":
          result.summaries += item.actual;
          break;
        case "item_analysis":
          result.analyses += item.actual;
          break;
        case "cluster_match":
          result.clusterMatches += item.actual;
          break;
        case "cluster_merge":
          result.clusterMerges += item.actual;
          break;
        case "cluster_summary":
          result.clusterSummaries += item.actual;
          break;
      }
    }
  } catch {
    // ignore parse errors — breakdown is best-effort
  }

  return result;
}

function buildQualityBuckets(): { range: string; min: number; max: number }[] {
  const buckets: { range: string; min: number; max: number }[] = [];
  for (let min = 0; min < 100; min += 10) {
    const max = min === 90 ? 100 : min + 9;
    buckets.push({ range: `${min}-${max}`, min, max });
  }
  return buckets;
}

const QUALITY_BUCKETS = buildQualityBuckets();

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function getIngestionMetrics(days = 30): Promise<IngestionMetrics> {
  const [dailyArticleStats, dailyAiUsageStats, dailySourceHealthStats, qualityScoreDistribution] =
    await Promise.all([
      getDailyArticleStats(days),
      getDailyAiUsageStats(days),
      getDailySourceHealthStats(days),
      getQualityScoreDistribution(),
    ]);

  return {
    dailyArticleStats,
    dailyAiUsageStats,
    dailySourceHealthStats,
    qualityScoreDistribution,
  };
}

// ---------------------------------------------------------------------------
// Daily article count
// ---------------------------------------------------------------------------

async function getDailyArticleStats(days: number): Promise<DailyArticleStat[]> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  const rows = await prisma.item.findMany({
    where: { createdAt: { gte: cutoff } },
    select: { createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  const dateMap = new Map<string, number>();
  for (const row of rows) {
    const date = row.createdAt.toISOString().slice(0, 10);
    dateMap.set(date, (dateMap.get(date) ?? 0) + 1);
  }

  return generateDateRange(days).map((date) => ({
    date,
    count: dateMap.get(date) ?? 0,
  }));
}

// ---------------------------------------------------------------------------
// Daily AI usage
// ---------------------------------------------------------------------------

async function getDailyAiUsageStats(days: number): Promise<DailyAiUsageStat[]> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  const rows = await prisma.backgroundTaskRun.findMany({
    where: {
      kind: "ingestion",
      status: { in: ["succeeded", "partial"] },
      createdAt: { gte: cutoff },
    },
    select: {
      createdAt: true,
      aiCallCountActual: true,
      aiCallBreakdownJson: true,
    },
    orderBy: { createdAt: "asc" },
  });

  const dateMap = new Map<string, { total: number } & AiBreakdown>();

  for (const row of rows) {
    const date = row.createdAt.toISOString().slice(0, 10);
    const entry = dateMap.get(date) ?? {
      total: 0,
      summaries: 0,
      analyses: 0,
      clusterMatches: 0,
      clusterMerges: 0,
      clusterSummaries: 0,
    };

    entry.total += row.aiCallCountActual;

    const breakdown = parseAiBreakdown(row.aiCallBreakdownJson);
    entry.summaries += breakdown.summaries;
    entry.analyses += breakdown.analyses;
    entry.clusterMatches += breakdown.clusterMatches;
    entry.clusterMerges += breakdown.clusterMerges;
    entry.clusterSummaries += breakdown.clusterSummaries;

    dateMap.set(date, entry);
  }

  return generateDateRange(days).map((date) => {
    const entry = dateMap.get(date);
    return {
      date,
      totalCalls: entry?.total ?? 0,
      summaries: entry?.summaries ?? 0,
      analyses: entry?.analyses ?? 0,
      clusterMatches: entry?.clusterMatches ?? 0,
      clusterMerges: entry?.clusterMerges ?? 0,
      clusterSummaries: entry?.clusterSummaries ?? 0,
    };
  });
}

// ---------------------------------------------------------------------------
// Daily source health trend
//
// Reconstructs end-of-day health counts by working backwards from today's
// current state and undoing each day's health-status changes recorded in
// source_health_logs.  This avoids needing a periodic snapshot table.
// ---------------------------------------------------------------------------

async function getDailySourceHealthStats(days: number): Promise<DailySourceHealthStat[]> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  const sources = await prisma.source.findMany({
    where: { enabled: true },
    select: { id: true, healthStatus: true },
  });

  // Current (end-of-today) state for every enabled source
  const currentState = new Map<string, string>();
  for (const s of sources) {
    currentState.set(s.id, s.healthStatus);
  }

  // All health changes within the window, oldest first
  const logs = await prisma.sourceHealthLog.findMany({
    where: { changedAt: { gte: cutoff } },
    orderBy: { changedAt: "asc" },
  });

  // Group changes by date so we can undo a day's worth at a time
  const logsByDate = new Map<string, Array<{ sourceId: string; fromStatus: string }>>();
  for (const log of logs) {
    const date = log.changedAt.toISOString().slice(0, 10);
    const entries = logsByDate.get(date) ?? [];
    entries.push({ sourceId: log.sourceId, fromStatus: log.fromStatus });
    logsByDate.set(date, entries);
  }

  const dates = generateDateRange(days);

  // Walk backwards from today: snapshot the current state, then undo that
  // day's changes to arrive at the previous day's end-of-day state.
  const workingState = new Map(currentState);
  const dailyState = new Map<string, Map<string, string>>();

  for (let i = dates.length - 1; i >= 0; i--) {
    const dateKey = dates[i];
    dailyState.set(dateKey, new Map(workingState));

    const dayLogs = logsByDate.get(dateKey) ?? [];
    for (const entry of dayLogs) {
      workingState.set(entry.sourceId, entry.fromStatus);
    }
  }

  return dates.map((date) => {
    const state = dailyState.get(date)!;
    let healthy = 0;
    let failed = 0;
    let unknown = 0;
    for (const status of state.values()) {
      if (status === "healthy") healthy++;
      else if (status === "failed") failed++;
      else unknown++;
    }
    return { date, healthy, failed, unknown };
  });
}

// ---------------------------------------------------------------------------
// Quality score distribution
// ---------------------------------------------------------------------------

async function getQualityScoreDistribution(): Promise<QualityScoreBucket[]> {
  const clusterAiScore = Prisma.sql`CAST(ROUND(AVG(fi."qualityScore")) AS INTEGER)`;
  const clusterItemCount = Prisma.sql`COUNT(*)`;
  const clusterSourceCount = Prisma.sql`COUNT(DISTINCT fi."sourceId")`;
  const clusterUpvotes = Prisma.sql`COALESCE(MIN(cc.upvotes), 0)`;
  const clusterDownvotes = Prisma.sql`COALESCE(MIN(cc.downvotes), 0)`;
  const clusterRecommendScore = buildRecommendScoreSql({
    aiScore: clusterAiScore,
    upvotes: clusterUpvotes,
    downvotes: clusterDownvotes,
    sourceCount: clusterSourceCount,
    itemCount: clusterItemCount,
  });
  const singleRecommendScore = buildRecommendScoreSql({
    aiScore: Prisma.sql`fi."qualityScore"`,
    upvotes: Prisma.sql`COALESCE(cg.upvotes, 0)`,
    downvotes: Prisma.sql`COALESCE(cg.downvotes, 0)`,
    sourceCount: Prisma.sql`1`,
    itemCount: Prisma.sql`1`,
  });

  const rows = await prisma.$queryRaw<Array<{ score: number | bigint; count: number | bigint }>>`
    WITH filtered_items AS (
      SELECT
        i.id AS "itemId",
        i."clusterId" AS "clusterId",
        i."sourceId" AS "sourceId",
        i."qualityScore" AS "qualityScore"
      FROM "items" i
      INNER JOIN "sources" s ON s.id = i."sourceId"
      LEFT JOIN "content_clusters" cc ON cc.id = i."clusterId"
      WHERE i.status = 'processed'
        AND i."moderationStatus" IN ('allowed', 'restored')
        AND s.enabled = true
        AND (i."clusterId" IS NULL OR cc.status = 'active')
    ),
    cluster_groups AS (
      SELECT
        fi."clusterId" AS id,
        ${clusterItemCount} AS "itemCount",
        ${clusterSourceCount} AS "sourceCount",
        ${clusterUpvotes} AS upvotes,
        ${clusterDownvotes} AS downvotes,
        ${clusterRecommendScore} AS "recommendScore"
      FROM filtered_items fi
      INNER JOIN "content_clusters" cc ON cc.id = fi."clusterId"
      WHERE fi."clusterId" IS NOT NULL
      GROUP BY fi."clusterId"
    ),
    composite_scores AS (
      SELECT cg."recommendScore" AS score
      FROM cluster_groups cg
      WHERE cg."itemCount" > 1
      UNION ALL
      SELECT ${singleRecommendScore} AS score
      FROM filtered_items fi
      LEFT JOIN cluster_groups cg ON cg.id = fi."clusterId"
      WHERE fi."clusterId" IS NULL OR cg."itemCount" = 1
    )
    SELECT score, COUNT(*) AS count
    FROM composite_scores
    GROUP BY score
  `;

  const scoreCounts = new Map<number, number>();
  for (const row of rows) {
    scoreCounts.set(Number(row.score), Number(row.count));
  }

  return QUALITY_BUCKETS.map((bucket) => {
    let count = 0;
    for (let score = bucket.min; score <= bucket.max; score++) {
      count += scoreCounts.get(score) ?? 0;
    }
    return { ...bucket, count };
  });
}
