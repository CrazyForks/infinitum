import { describe, expect, it } from "vitest";

import { renderSafeMarkdown } from "@/lib/markdown/safe-html";

describe("safe markdown renderer", () => {
  it("renders blockquotes as blockquote elements", () => {
    const html = renderSafeMarkdown("> 声明：完全使用AI生成，可能存在错误，需谨慎甄别。");

    expect(html).toContain("<blockquote>");
    expect(html).toContain("<p>声明：完全使用AI生成，可能存在错误，需谨慎甄别。</p>");
    expect(html).not.toContain("&gt;");
  });

  it("does not double escape ampersands in rendered link hrefs", () => {
    const html = renderSafeMarkdown("[公告](https://example.com/post?x=1&y=2)");

    expect(html).toContain('href="https://example.com/post?x=1&amp;y=2"');
    expect(html).not.toContain("&amp;amp;");
  });
});
