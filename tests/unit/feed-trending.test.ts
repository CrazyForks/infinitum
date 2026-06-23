import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";

import {
  TRENDING_HALF_LIFE_HOURS,
  TRENDING_LIMIT,
  TRENDING_MIN_QUALITY_SCORE,
  TRENDING_MIN_RECOMMEND_SCORE,
  TRENDING_WARMUP_HOURS,
  buildMultiSourceBoostSql,
  buildRecencyWeightSql,
  buildTrendingScoreSql,
  buildVelocityBoostSql,
} from "@/lib/feed/trending";

/**
 * Prisma.Sql 是结构化对象（strings + values 数组），
 * 转字符串时直接 String() 拿到 [object Object]，需要展开。
 */
function renderSql(node: Prisma.Sql): string {
  const parts: string[] = [];
  const strings = (node as unknown as { strings: string[] }).strings;
  const values = (node as unknown as { values: unknown[] }).values;

  for (let i = 0; i < strings.length; i++) {
    parts.push(strings[i]);
    if (i < values.length) {
      const v = values[i];
      if (v && typeof v === "object" && "strings" in (v as object)) {
        parts.push(renderSql(v as Prisma.Sql));
      } else {
        parts.push(String(v));
      }
    }
  }
  return parts.join("");
}

describe("feed trending score SQL", () => {
  it("exposes the expected tuning constants", () => {
    expect(TRENDING_HALF_LIFE_HOURS).toBe(12);
    expect(TRENDING_WARMUP_HOURS).toBe(6);
    expect(TRENDING_LIMIT).toBe(10);
    expect(TRENDING_MIN_QUALITY_SCORE).toBe(30);
    expect(TRENDING_MIN_RECOMMEND_SCORE).toBe(50);
  });

  it("uses 5 hard-coded recency tiers (no SQLite math extension required)", () => {
    const sql = buildRecencyWeightSql({
      createdAt: Prisma.sql`createdAt`,
      now: Prisma.sql`now`,
    });
    const rendered = renderSql(sql);
    expect(rendered).toContain("CASE");
    expect(rendered).toContain("1.0");
    expect(rendered).toContain("0.75");
    expect(rendered).toContain("0.5");
    expect(rendered).toContain("0.3");
    expect(rendered).toContain(String(TRENDING_WARMUP_HOURS));
    expect(rendered).not.toContain("EXP(");
    expect(rendered).not.toContain("POWER(");
  });

  it("emits multi-source boost thresholds at 3 and 5 sources", () => {
    const sql = buildMultiSourceBoostSql(Prisma.sql`sourceCount`);
    const rendered = renderSql(sql);
    expect(rendered).toContain(">= 5");
    expect(rendered).toContain(">= 3");
    expect(rendered).toContain("THEN 5");
    expect(rendered).toContain("THEN 2");
  });

  it("emits velocity boost with three tiers capped at 30", () => {
    const sql = buildVelocityBoostSql({
      recentSum: Prisma.sql`recent`,
      baselineSum: Prisma.sql`baseline`,
    });
    const rendered = renderSql(sql);
    expect(rendered).toContain("THEN 30");
    expect(rendered).toContain("THEN 20");
    expect(rendered).toContain("THEN 10");
    expect(rendered).toContain("THEN 0");
    expect(rendered).toContain("CAST(recent AS REAL)");
  });

  it("composes trending score from recommend, recency, multi-source, and velocity", () => {
    const sql = buildTrendingScoreSql({
      aiScore: Prisma.sql`ai`,
      sourceCount: Prisma.sql`src`,
      itemCount: Prisma.sql`cnt`,
      createdAt: Prisma.sql`createdAt`,
      now: Prisma.sql`now`,
      recentSum: Prisma.sql`recent`,
      baselineSum: Prisma.sql`baseline`,
    });
    const rendered = renderSql(sql);
    expect(rendered).toContain("1.0");
    expect(rendered).toContain("THEN 5");
    expect(rendered).toContain("THEN 30");
  });
});
