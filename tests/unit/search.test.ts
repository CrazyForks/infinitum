import { describe, expect, it } from "vitest";

import { getDatabaseSearchTerms, matchesFuzzySearch } from "@/lib/utils/search";

describe("matchesFuzzySearch", () => {
  it("matches Chinese keywords across spaces and punctuation", () => {
    expect(matchesFuzzySearch("AI代理", ["OpenAI 发布 AI 代理-工具包"])).toBe(true);
  });

  it("matches non-contiguous Chinese abbreviations in order", () => {
    expect(matchesFuzzySearch("开模", ["阿里发布开源大模型"])).toBe(true);
  });

  it("requires all query terms to be present", () => {
    expect(matchesFuzzySearch("阿里 模型", ["阿里发布开源大模型"])).toBe(true);
    expect(matchesFuzzySearch("阿里 视频", ["阿里发布开源大模型"])).toBe(false);
  });
});

describe("getDatabaseSearchTerms", () => {
  it("keeps database pagination possible by expanding Chinese terms into searchable segments", () => {
    expect(getDatabaseSearchTerms("AI代理 工具")).toEqual(["ai", "代", "理", "工", "具"]);
  });
});
