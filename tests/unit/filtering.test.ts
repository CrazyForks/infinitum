import { describe, expect, it } from "vitest";

import { evaluateRuleFilter, findBlacklistMatch } from "@/lib/ingestion/filtering";

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

describe("rule score filtering", () => {
  it("keeps a single weak signal as reviewable instead of filtering immediately", () => {
    const result = evaluateRuleFilter({
      title: "Weekly roundup: compiler release notes",
      content: "The compiler team published several performance notes and release highlights for developers.",
      blacklist: [],
    });

    expect(result.filtered).toBe(false);
    expect(result.score).toBe(55);
    expect(result.score).toBeGreaterThanOrEqual(result.threshold);
    expect(result.matches).toEqual(
      expect.arrayContaining([expect.objectContaining({ rule: "title_pattern", label: "roundup" })]),
    );
  });

  it("filters when independent low-signal rules accumulate below the threshold", () => {
    const result = evaluateRuleFilter({
      title: "Sponsored webinar",
      content: "Register today.",
      url: "https://example.com/events/webinar?utm_campaign=promo",
      blacklist: [],
    });

    expect(result.filtered).toBe(true);
    expect(result.score).toBeLessThan(result.threshold);
    expect(result.reason).toBe("sponsored");
    expect(result.detail).toContain("Rule score");
  });

  it("keeps blacklist as a hard filter", () => {
    const result = evaluateRuleFilter({
      title: "Compiler release notes",
      content: "This paragraph mentions layoffs in the second sentence.",
      blacklist: ["layoffs"],
    });

    expect(result.filtered).toBe(true);
    expect(result.score).toBe(0);
    expect(result.reason).toBe("layoffs");
  });
});
