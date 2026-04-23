import { describe, expect, it } from "vitest";

import { shouldFetchFullText } from "@/lib/ingestion/dedupe";

describe("shouldFetchFullText", () => {
  it("uses the configured full text threshold", () => {
    expect(shouldFetchFullText("a".repeat(100), true, 80)).toBe(false);
    expect(shouldFetchFullText("a".repeat(100), true, 120)).toBe(true);
  });

  it("does not fetch full text when the source disables fallback fetching", () => {
    expect(shouldFetchFullText("short", false, 120)).toBe(false);
  });
});
