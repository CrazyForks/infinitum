import { describe, expect, it } from "vitest";

import { shouldRegenerateChineseSummary } from "@/lib/ai/summary-language";

describe("summary language guard", () => {
  it("flags English summaries for regeneration", () => {
    expect(
      shouldRegenerateChineseSummary(
        "Anthropic announced a new enterprise AI services company with financial partners.",
      ),
    ).toBe(true);
  });

  it("keeps Chinese summaries with product names", () => {
    expect(
      shouldRegenerateChineseSummary(
        "SAS 发布 **Viya MCP Server**，让 Claude 和 Copilot 等智能体能在企业治理边界内调用其分析能力。",
      ),
    ).toBe(false);
  });

  it("flags prompt echo with candidate labels and English body", () => {
    expect(
      shouldRegenerateChineseSummary(
        "候选 1\n标题：SAS如何向财富500强企业推销AI\n摘要：For this 50-year-old company, AI is just a tool at its customer event.",
      ),
    ).toBe(true);
  });
});
