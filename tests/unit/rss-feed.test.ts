import { afterEach, describe, expect, it, vi } from "vitest";

import { buildRssFeed, mapFeedEntriesToRssItems } from "@/lib/feed/rss";
import { resolvePublicOrigin, resolvePublicRequestUrl } from "@/lib/http/public-origin";

describe("rss feed renderer", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

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

  it("renders cluster rss descriptions without a cluster summary prefix", () => {
    const [item] = mapFeedEntriesToRssItems(
      [
        {
          id: "cluster-1",
          type: "cluster",
          title: "OpenAI 发布新工具",
          summary: "聚合摘要：OpenAI 发布面向开发者的新工具。",
          publishedAt: "2026-04-25T10:00:00.000Z",
          createdAt: "2026-04-25T10:00:00.000Z",
          latestPublishedAt: "2026-04-25T10:00:00.000Z",
          score: 90,
          sourceCount: 2,
          itemCount: 2,
          hasMoreItems: false,
          itemsPreview: [
            {
              id: "item-1",
              title: "首篇报道",
              originalUrl: "https://example.com/1",
              publishedAt: "2026-04-25T10:00:00.000Z",
              sourceName: "Example",
              summary: "报道摘要",
              score: 80,
            },
          ],
        },
      ],
      "https://example.com",
    );

    expect(item?.description).toContain("<p>OpenAI 发布面向开发者的新工具。</p>");
    expect(item?.description).not.toContain("聚合摘要：");
  });

  it("renders markdown summaries as html inside rss descriptions", () => {
    const [item] = mapFeedEntriesToRssItems(
      [
        {
          id: "item-1",
          type: "single",
          title: "OpenAI 发布新工具",
          originalUrl: "https://example.com/1",
          publishedAt: "2026-04-25T10:00:00.000Z",
          createdAt: "2026-04-25T10:00:00.000Z",
          latestPublishedAt: "2026-04-25T10:00:00.000Z",
          sourceName: "Example",
          author: null,
          summary: "OpenAI 发布 **新工具**，详见 [公告](https://example.com/post?x=1&y=2)。",
          score: 80,
          sourceCount: 1,
          itemCount: 1,
        },
      ],
      "https://example.com",
    );

    const rss = buildRssFeed({
      title: "Infinitum 资讯聚合",
      description: "最新资讯聚合 RSS 订阅",
      link: "https://example.com",
      lastBuildDate: "2026-04-25T00:00:00.000Z",
      items: item ? [item] : [],
    });

    expect(item?.description).toContain("<strong>新工具</strong>");
    expect(item?.description).toContain('<a href="https://example.com/post?x=1&amp;y=2"');
    expect(rss).toContain("<description><![CDATA[<p>OpenAI 发布 <strong>新工具</strong>");
    expect(rss).not.toContain("**新工具**");
  });

  it("resolves the public origin from forwarded proxy headers", () => {
    const request = new Request("https://0.0.0.0:3000/api/feed/rss?range=today", {
      headers: {
        host: "0.0.0.0:3000",
        "x-forwarded-host": "news.example.com",
        "x-forwarded-proto": "https",
      },
    });

    expect(resolvePublicOrigin(request)).toBe("https://news.example.com");
    expect(resolvePublicRequestUrl(request)).toBe("https://news.example.com/api/feed/rss?range=today");
  });

  it("prefers the configured site url for rss links", () => {
    vi.stubEnv("SITE_URL", "https://infinitum.example.com/base-path");
    const request = new Request("https://0.0.0.0:3000/api/daily/rss", {
      headers: {
        "x-forwarded-host": "proxy.example.com",
      },
    });

    expect(resolvePublicOrigin(request)).toBe("https://infinitum.example.com");
    expect(resolvePublicRequestUrl(request)).toBe("https://infinitum.example.com/api/daily/rss");
  });
});
