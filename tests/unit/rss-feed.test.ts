import { describe, expect, it } from "vitest";

import { buildRssFeed } from "@/lib/feed/rss";

describe("rss feed renderer", () => {
  it("uses a dedicated atom self link when provided", () => {
    const rss = buildRssFeed({
      title: "Infinitum AI 日报",
      description: "AI 日报订阅",
      link: "https://example.com/daily",
      selfLink: "https://example.com/api/daily/rss",
      lastBuildDate: "2026-04-25T00:00:00.000Z",
      items: [],
    });

    expect(rss).toContain("<link>https://example.com/daily</link>");
    expect(rss).toContain('<atom:link href="https://example.com/api/daily/rss" rel="self" type="application/rss+xml" />');
  });
});
