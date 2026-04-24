import Parser from "rss-parser";

import type { ParsedFeed, ParsedFeedItem, RssParserLike } from "@/lib/ingestion/types";

export function createRssParser(): RssParserLike {
  const parser = new Parser<Record<string, never>, ParsedFeedItem>();

  return {
    async parseURL(url: string, options?: { headers?: Record<string, string> }): Promise<ParsedFeed> {
      const response = await fetch(url, {
        headers: {
          "User-Agent": "infinitum-feed-bot/1.0",
          ...options?.headers,
        },
      });

      if (response.status === 304) {
        return {
          notModified: true,
          etag: response.headers.get("etag"),
          lastModified: response.headers.get("last-modified"),
          items: [],
        };
      }

      if (!response.ok) {
        throw new Error(`RSS fetch failed with status ${response.status}`);
      }

      const feed = await parser.parseString(await response.text());
      return {
        title: typeof feed.title === "string" ? feed.title : null,
        link: typeof feed.link === "string" ? feed.link : null,
        feedUrl: typeof feed.feedUrl === "string" ? feed.feedUrl : null,
        items: feed.items,
        etag: response.headers.get("etag"),
        lastModified: response.headers.get("last-modified"),
      };
    },
  };
}
