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
    expect(defaults.modelApi.apiKey).toBe("");
    expect(defaults.modelApi.baseURL).toBe("");
    expect(defaults.modelApi.model).toBe("gpt-4.1-mini");
    expect(defaults.prompts.itemAnalysis.length).toBeGreaterThan(0);
    expect(defaults.prompts.itemAnalysis).toContain("字段说明");
    expect(defaults.prompts.clusterSummary.length).toBeGreaterThan(0);
    expect(defaults.prompts.clusterMatch.length).toBeGreaterThan(0);
  });

  it("returns fresh copies for mutable arrays", () => {
    const left = getRuntimeConfig();
    const right = getRuntimeConfig();

    left.rssSources.push({
      name: "Extra Feed",
      rssUrl: "https://example.com/feed.xml",
      siteUrl: "https://example.com",
      enabled: true,
      fetchFullTextWhenMissing: false,
    });
    left.blacklistKeywords.push("foo");

    expect(right.rssSources).toEqual(DEFAULT_SOURCE_CONFIGS);
    expect(right.blacklistKeywords).toEqual(DEFAULT_BLACKLIST_KEYWORDS);
  });
});
