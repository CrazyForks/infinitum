import { afterEach, describe, expect, it, vi } from "vitest";

import { buildRssFeed } from "@/lib/feed/rss";
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
