import { describe, expect, it } from "vitest";

import { shouldFetchFullText } from "@/lib/ingestion/dedupe";

describe("shouldFetchFullText", () => {
  it("uses the configured full text threshold", () => {
    expect(shouldFetchFullText("a".repeat(100), 80)).toBe(false);
    expect(shouldFetchFullText("a".repeat(100), 120)).toBe(true);
  });
});
