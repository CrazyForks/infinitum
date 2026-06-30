import { describe, expect, it } from "vitest";

import { buildDedupeKeys, shouldFetchFullText } from "@/lib/ingestion/dedupe";

describe("dedupe helpers", () => {
  it("builds stable canonical URL hashes", () => {
    const keys = buildDedupeKeys({
      canonicalUrl: "https://example.com/articles/123?utm_source=rss",
    });

    expect(keys.urlHash).toMatch(/^[a-f0-9]{64}$/);
    expect(keys.canonicalUrl).toBe("https://example.com/articles/123");
  });

  it("requests full text when RSS content is missing or too short", () => {
    expect(shouldFetchFullText("", 80)).toBe(true);
    expect(shouldFetchFullText("Short body", 80)).toBe(true);
    expect(
      shouldFetchFullText(
        "This RSS content is long enough that the pipeline should keep it without fetching the article body again.",
        80,
      ),
    ).toBe(false);
  });
});
