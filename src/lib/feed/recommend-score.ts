import { Prisma } from "@prisma/client";

/**
 * 计算综合推荐评分
 * 以 AI 评分为主要排序锚点，来源/条目聚合加权只做有限修正，避免高分段过早撞顶。
 *
 * 算法：
 * - AI 基准 = 50 + (AI评分 - 50) * 0.82
 * - 聚合加权 = min(10, 来源加权 + 条目加权)
 * - 综合评分 = round(clamp(AI 基准 + 聚合加权, 0, 100))
 */
export function calculateRecommendScore(
  aiScore: number,
  sourceCount: number,
  itemCount: number,
): number {
  const aiBaseScore = 50 + (aiScore - 50) * 0.82;
  const sourceBoost = Math.min(8, Math.max(0, sourceCount - 1) * 3);
  const itemBoost = Math.min(4, Math.floor(Math.log2(Math.max(1, itemCount))));
  const aggregationBoost = Math.min(10, sourceBoost + itemBoost);

  return Math.max(0, Math.min(100, Math.round(aiBaseScore + aggregationBoost)));
}

export function buildRecommendScoreSql(input: {
  aiScore: Prisma.Sql;
  sourceCount: Prisma.Sql;
  itemCount: Prisma.Sql;
}) {
  const aiBaseScore = Prisma.sql`(50 + ((${input.aiScore} - 50) * 0.82))`;
  const sourceBoost = Prisma.sql`CASE WHEN ((${input.sourceCount} - 1) * 3) > 8 THEN 8 WHEN ((${input.sourceCount} - 1) * 3) < 0 THEN 0 ELSE ((${input.sourceCount} - 1) * 3) END`;
  const itemBoost = Prisma.sql`CASE WHEN ${input.itemCount} >= 16 THEN 4 WHEN ${input.itemCount} >= 8 THEN 3 WHEN ${input.itemCount} >= 4 THEN 2 WHEN ${input.itemCount} >= 2 THEN 1 ELSE 0 END`;
  const rawAggregationBoost = Prisma.sql`(${sourceBoost} + ${itemBoost})`;
  const aggregationBoost = Prisma.sql`CASE WHEN ${rawAggregationBoost} > 10 THEN 10 ELSE ${rawAggregationBoost} END`;
  const combinedScore = Prisma.sql`${aiBaseScore} + ${aggregationBoost}`;
  const roundedScore = Prisma.sql`CAST(ROUND(${combinedScore}) AS INTEGER)`;

  return Prisma.sql`CASE WHEN ${roundedScore} > 100 THEN 100 WHEN ${roundedScore} < 0 THEN 0 ELSE ${roundedScore} END`;
}
