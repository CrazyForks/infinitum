import { describe, expect, it } from "vitest";

import { findBlacklistMatch } from "@/lib/ingestion/filtering";

describe("blacklist filtering", () => {
  it("matches against titles case-insensitively", () => {
    expect(
      findBlacklistMatch({
        title: "Breaking AI Funding Round",
        content: "A short article body",
        blacklist: ["funding"],
      }),
    ).toBe("funding");
  });

  it("matches against content when the title is clean", () => {
    expect(
      findBlacklistMatch({
        title: "Daily market recap",
        content: "This paragraph mentions layoffs in the second sentence.",
        blacklist: ["layoffs"],
      }),
    ).toBe("layoffs");
  });

  it("returns null when no keyword matches", () => {
    expect(
      findBlacklistMatch({
        title: "Compiler release notes",
        content: "Performance improvements only.",
        blacklist: ["funding", "layoffs"],
      }),
    ).toBeNull();
  });
});
