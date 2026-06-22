import { describe, expect, it } from "vitest";

import { DEFAULT_BLACKLIST_KEYWORDS } from "@/config/blacklist";
import { getRuntimeConfig } from "@/config/runtime";
import { DEFAULT_SOURCE_CONFIGS } from "@/config/sources";

describe("runtime config defaults", () => {
  it("returns built-in defaults", () => {
    const defaults = getRuntimeConfig();

    expect(defaults.rssSources).toEqual(DEFAULT_SOURCE_CONFIGS);
    expect(defaults.blacklistKeywords).toEqual(DEFAULT_BLACKLIST_KEYWORDS);
    expect(defaults.ingestion.itemConcurrency).toBe(3);
    expect(defaults.ingestion.fullTextFetchThreshold).toBe(80);
    expect(defaults.modelApi.apiKey).toBe("");
    expect(defaults.modelApi.baseURL).toBe("");
    expect(defaults.modelApi.model).toBe("gpt-4.1-mini");
    expect(defaults.prompts.itemSummary.length).toBeGreaterThan(0);
    expect(defaults.prompts.itemSummary).toContain("单条新闻内容助手");
    expect(defaults.prompts.itemSummary).toContain("isAggregation");
    expect(defaults.prompts.itemSummary).toContain("**加粗**");
    expect(defaults.prompts.itemSummary).toContain("*斜体*");
    expect(defaults.prompts.itemAnalysis.length).toBeGreaterThan(0);
    expect(defaults.prompts.itemAnalysis).toContain("固定输出格式");
    expect(defaults.prompts.itemAnalysis).toContain("只基于输入标题、来源和摘要判断");
    expect(defaults.prompts.itemAnalysis).toContain("只返回单个短动作");
    expect(defaults.prompts.itemAnalysis).toContain("优先写唯一锚点");
    expect(defaults.prompts.itemAnalysis).not.toContain("restored");
    expect(defaults.prompts.itemAggregation).toContain("聚合内容拆条助手");
    expect(defaults.prompts.itemAggregation).toContain('"mainEvent"');
    expect(defaults.prompts.itemAggregation).toContain('"events"');
    expect(defaults.prompts.itemAggregation).toContain('"tags"');
    expect(defaults.prompts.clusterSummary.length).toBeGreaterThan(0);
    expect(defaults.prompts.clusterSummary).toContain("聚合展示编辑");
    expect(defaults.prompts.clusterSummary).toContain("固定输出格式");
    expect(defaults.prompts.clusterSummary).toContain('{"title":"...","summary":"..."}');
    expect(defaults.prompts.clusterSummary).toContain("**加粗**");
    expect(defaults.prompts.clusterSummary).toContain("*斜体*");
    expect(defaults.prompts.clusterMatch.length).toBeGreaterThan(0);
    expect(defaults.prompts.clusterMatch).toContain('{"clusterId":"候选组ID"}');
    expect(defaults.prompts.dailyReport).toContain("优先综合参考 candidateScore、sourceCount、itemCount 和日期相关性");
    expect(defaults.prompts.dailyReport).toContain("items 为空数组时会在渲染时自动隐藏");
    expect(defaults.prompts.dailyReport).toContain("说明变化内容、适用对象、实践价值或可能影响");
    expect(defaults.prompts.dailyReport).toContain("多个来源只能用于同一事件的互证");
    expect(defaults.prompts.dailyReport).toContain("只使用输入候选内容和合法来源编号");
    expect(defaults.prompts.dailyReport).toContain("同一事件只出现一次，避免跨栏目重复");
  });

  it("returns fresh copies for mutable arrays", () => {
    const left = getRuntimeConfig();
    const right = getRuntimeConfig();

    left.rssSources.push({
      name: "Extra Feed",
      rssUrl: "https://example.com/feed.xml",
      siteUrl: "https://example.com",
      enabled: true,
      aiParsingEnabled: true,
      aggregationEnabled: true,
    });
    left.blacklistKeywords.push("foo");

    expect(right.rssSources).toEqual(DEFAULT_SOURCE_CONFIGS);
    expect(right.blacklistKeywords).toEqual(DEFAULT_BLACKLIST_KEYWORDS);
  });
});
