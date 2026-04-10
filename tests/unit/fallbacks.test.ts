import { describe, expect, it } from "vitest";

import {
  getDisplaySummary,
  getDisplayTitle,
  shouldTranslateTitle,
} from "@/lib/feed/presentation";

describe("feed presentation fallbacks", () => {
  it("prefers translated titles when available", () => {
    expect(getDisplayTitle("Original title", "中文标题")).toBe("中文标题");
    expect(getDisplayTitle("Original title", null)).toBe("Original title");
  });

  it("only translates titles that look meaningfully English", () => {
    expect(shouldTranslateTitle("OpenAI releases new responses API guide")).toBe(true);
    expect(shouldTranslateTitle("中文标题")).toBe(false);
    expect(shouldTranslateTitle("AI 2026")).toBe(false);
  });

  it("falls back from summary to excerpt to body preview", () => {
    expect(getDisplaySummary("AI summary", "RSS excerpt", "Long full text")).toBe("AI summary");
    expect(getDisplaySummary(null, "RSS excerpt", "Long full text")).toBe("RSS excerpt");
    expect(
      getDisplaySummary(
        null,
        null,
        "0123456789 0123456789 0123456789 0123456789 0123456789 0123456789",
      ),
    ).toBe("0123456789 0123456789 0123456789 0123456789 0123456789 0123456789");
  });

  it("strips html tags from summary-like content before display", () => {
    expect(getDisplaySummary("<p>AI summary</p>", null, null)).toBe("AI summary");
    expect(getDisplaySummary(null, "<p>RSS excerpt</p>", null)).toBe("RSS excerpt");
    expect(getDisplaySummary(null, null, "<div>Body preview</div>")).toBe("Body preview");
  });
});
