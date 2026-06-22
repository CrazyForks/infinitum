import { describe, expect, it } from "vitest";

import { normalizeItemTags, normalizeTagName } from "@/lib/tags/normalization";

describe("tag normalization", () => {
  it("normalizes display names and keys", () => {
    expect(normalizeTagName("  #OpenAI  ")).toEqual({
      name: "OpenAI",
      normalized: "openai",
    });
    expect(normalizeTagName("“AI 编程”")).toEqual({
      name: "AI 编程",
      normalized: "ai 编程",
    });
  });

  it("filters invalid, duplicate, generic, and excessive tags", () => {
    expect(normalizeItemTags([
      "新闻",
      "OpenAI",
      " openai ",
      "",
      "AI Agent",
      "x".repeat(41),
      "Codex",
      "开发者工具",
      "模型发布",
      "安全",
    ])).toEqual([
      { name: "OpenAI", normalized: "openai" },
      { name: "AI Agent", normalized: "ai agent" },
      { name: "Codex", normalized: "codex" },
      { name: "开发者工具", normalized: "开发者工具" },
      { name: "模型发布", normalized: "模型发布" },
    ]);
  });

  it("returns an empty array for non-array model output", () => {
    expect(normalizeItemTags("OpenAI")).toEqual([]);
    expect(normalizeItemTags(null)).toEqual([]);
  });
});
