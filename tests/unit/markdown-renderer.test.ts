import { describe, expect, it } from "vitest";

import { renderSafeMarkdown } from "@/lib/markdown/safe-html";

describe("safe markdown renderer", () => {
  it("renders blockquotes as blockquote elements", () => {
    const html = renderSafeMarkdown("> 声明：完全使用AI生成，可能存在错误，需谨慎甄别。");

    expect(html).toContain("<blockquote>");
    expect(html).toContain("<p>声明：完全使用AI生成，可能存在错误，需谨慎甄别。</p>");
    expect(html).not.toContain("&gt;");
  });
});
