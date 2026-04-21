import { describe, expect, it } from "vitest";

import { buildDedupeKeys, shouldFetchFullText } from "@/lib/ingestion/dedupe";

describe("dedupe helpers", () => {
  it("prefers canonical URL hashes and still provides a content signature", () => {
    const keys = buildDedupeKeys({
      sourceName: "Example",
      canonicalUrl: "https://example.com/articles/123?utm_source=rss",
      title: "Launch recap",
      publishedAt: new Date("2026-04-10T10:00:00.000Z"),
    });

    expect(keys.urlHash).toMatch(/^[a-f0-9]{64}$/);
    expect(keys.signature).toContain("example");
    expect(keys.signature).toContain("launch recap");
  });

  it("requests full text when RSS content is missing or too short", () => {
    expect(shouldFetchFullText("", true, 80)).toBe(true);
    expect(shouldFetchFullText("Short body", true, 80)).toBe(true);
    expect(
      shouldFetchFullText(
        "This RSS content is long enough that the pipeline should keep it without fetching the article body again.",
        true,
        80,
      ),
    ).toBe(false);
    expect(shouldFetchFullText("", false, 80)).toBe(false);
  });
});
