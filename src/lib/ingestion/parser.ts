import Parser from "rss-parser";

import type { ParsedFeedItem, RssParserLike } from "@/lib/ingestion/types";

export function createRssParser(): RssParserLike {
  const parser = new Parser<Record<string, never>, ParsedFeedItem>();
  return parser;
}
