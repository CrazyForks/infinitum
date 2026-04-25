import Parser from "rss-parser";

import { RSS_FETCH_RETRY_COUNT } from "@/config/constants";
import type { ParsedFeed, ParsedFeedItem, RssParserLike } from "@/lib/ingestion/types";

export function createRssParser(): RssParserLike {
  const parser = new Parser<Record<string, never>, ParsedFeedItem>();

  return {
    async parseURL(url: string, options?: { headers?: Record<string, string> }): Promise<ParsedFeed> {
      let response: Response | null = null;
      let lastError: unknown = null;

      for (let attempt = 0; attempt <= RSS_FETCH_RETRY_COUNT; attempt += 1) {
        try {
          response = await fetch(url, {
            headers: {
              "User-Agent": "infinitum-feed-bot/1.0",
              ...options?.headers,
            },
          });

          if (response.ok || response.status === 304) {
            break;
          }

          lastError = new Error(`RSS fetch failed with status ${response.status}`);
        } catch (error) {
          lastError = error;
        }
      }

      if (!response) {
        throw lastError instanceof Error ? lastError : new Error("RSS fetch failed");
      }

      if (response.status === 304) {
        return {
          notModified: true,
          etag: response.headers.get("etag"),
          lastModified: response.headers.get("last-modified"),
          items: [],
        };
      }

      if (!response.ok) {
        throw lastError instanceof Error ? lastError : new Error(`RSS fetch failed with status ${response.status}`);
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
