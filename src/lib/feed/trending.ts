import { Prisma } from "@prisma/client";

import { HOUR_MS } from "@/config/constants";
import { buildRecommendScoreSql } from "@/lib/feed/recommend-score";

/**
 * 实时榜单排序参数
 *
 * 完整算法（一次 SQL 计算）：
 *   trendingScore =
 *     recommendScore * recencyWeight       // 0~100 基础分乘以时间衰减
 *   + multiSourceBoost(sourceCount)        // 多源报道加权
 *   + velocityBoost(recent, baseline)      // 升温速度加权
 *
 * - recencyWeight：6h 暖身期不衰减，之后按 12h 半衰期指数衰减
 *   SQLite 默认不提供 EXP/POWER，因此用 5 段硬编码实现指数衰减的视觉近似：
 *   0-6h: 1.0, 6-12h: 0.75, 12-18h: 0.5, 18-24h: 0.3
 *   候选时间窗为 24h，24h 之外不进入候选，所以不需要更长的尾部。
 * - multiSourceBoost：3 源 +2，5 源 +5
 * - velocityBoost：最近 6h 条目数 / 6h~24h 条目数（同一 sourceId 范围），最多 +30
 *   改用条数比而非分数累计，避免与 recommendScore 重复计入 recency 衰减。
 * - 候选时间窗：24h 内创建
 * - 同 cluster 24h 去重：避免 AI 重生后改 translatedTitle 反复上榜
 */
export const TRENDING_HALF_LIFE_HOURS = 12;
export const TRENDING_WARMUP_HOURS = 6;
export const TRENDING_LOOKBACK_HOURS = 24;
export const TRENDING_VELOCITY_RECENT_HOURS = 6;
export const TRENDING_VELOCITY_BASELINE_HOURS = 24;
export const TRENDING_MIN_QUALITY_SCORE = 30;
export const TRENDING_MIN_RECOMMEND_SCORE = 50;
export const TRENDING_LIMIT = 10;

/**
 * 时间衰减（5 段硬编码，避免依赖 SQLite math 扩展）
 */
export function buildRecencyWeightSql(input: {
  createdAt: Prisma.Sql;
  now: Prisma.Sql;
}): Prisma.Sql {
  const ageHours = Prisma.sql`((CAST((${input.now} - ${input.createdAt}) AS REAL)) / ${HOUR_MS})`;
  return Prisma.sql`CASE
    WHEN ${ageHours} <= ${TRENDING_WARMUP_HOURS} THEN 1.0
    WHEN ${ageHours} <= 12 THEN 0.75
    WHEN ${ageHours} <= 18 THEN 0.5
    WHEN ${ageHours} <= 24 THEN 0.3
    ELSE 0.0
  END`;
}

/**
 * 多源报道加权：sourceCount >= 5 → +5，>= 3 → +2，否则 0
 */
export function buildMultiSourceBoostSql(sourceCount: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`CASE WHEN ${sourceCount} >= 5 THEN 5 WHEN ${sourceCount} >= 3 THEN 2 ELSE 0 END`;
}

/**
 * 升温速度：最近 6h 条目数 / 6h~24h 条目数，最多 +30
 *
 * 当 baseline = 0 时返回 0；ratio 用 0.33/0.66/1 三档阶梯。
 */
export function buildVelocityBoostSql(input: {
  recentSum: Prisma.Sql;
  baselineSum: Prisma.Sql;
}): Prisma.Sql {
  const ratio = Prisma.sql`CASE WHEN ${input.baselineSum} <= 0 THEN 0 ELSE (CAST(${input.recentSum} AS REAL) / ${input.baselineSum}) END`;
  return Prisma.sql`CASE WHEN ${ratio} > 1 THEN 30 WHEN ${ratio} > 0.66 THEN 20 WHEN ${ratio} > 0.33 THEN 10 ELSE 0 END`;
}

/**
 * 组装 trendingScore：recencyWeight * recommendScore + multiSourceBoost + velocityBoost
 */
export function buildTrendingScoreSql(input: {
  aiScore: Prisma.Sql;
  sourceCount: Prisma.Sql;
  itemCount: Prisma.Sql;
  createdAt: Prisma.Sql;
  now: Prisma.Sql;
  recentSum: Prisma.Sql;
  baselineSum: Prisma.Sql;
}): Prisma.Sql {
  const recommend = buildRecommendScoreSql({
    aiScore: input.aiScore,
    sourceCount: input.sourceCount,
    itemCount: input.itemCount,
  });
  const recency = buildRecencyWeightSql({ createdAt: input.createdAt, now: input.now });
  const multiSource = buildMultiSourceBoostSql(input.sourceCount);
  const velocity = buildVelocityBoostSql({
    recentSum: input.recentSum,
    baselineSum: input.baselineSum,
  });

  return Prisma.sql`(${recommend}) * ${recency} + ${multiSource} + ${velocity}`;
}
