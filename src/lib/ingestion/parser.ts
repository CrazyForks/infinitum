import Parser from "rss-parser";

import type { ParsedFeed, ParsedFeedItem, RssParserLike } from "@/lib/ingestion/types";

export function createRssParser(): RssParserLike {
  const parser = new Parser<Record<string, never>, ParsedFeedItem>();

  return {
    async parseURL(url: string): Promise<ParsedFeed> {
      const feed = await parser.parseURL(url);
      return {
        title: typeof feed.title === "string" ? feed.title : null,
        link: typeof feed.link === "string" ? feed.link : null,
        feedUrl: typeof feed.feedUrl === "string" ? feed.feedUrl : null,
        items: feed.items,
      };
    },
  };
}
