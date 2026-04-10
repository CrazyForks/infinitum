import type { ItemStatus, SourceConfig } from "@/lib/feed/types";

import type { AiProvider } from "@/lib/ai/provider";

export type ParsedFeedItem = {
  title?: string | null;
  link?: string | null;
  isoDate?: string | null;
  pubDate?: string | null;
  creator?: string | null;
  author?: string | null;
  content?: string | null;
  "content:encoded"?: string | null;
  contentSnippet?: string | null;
};

export type RssParserLike = {
  parseURL(url: string): Promise<{ items?: ParsedFeedItem[] }>;
};

export type ArticleFetcher = (url: string) => Promise<string | null>;

export type ProcessedItemRecord = {
  id: string;
  status: ItemStatus;
};

export type RunIngestionOptions = {
  trigger: "scheduled" | "manual";
  parser: RssParserLike;
  articleFetcher: ArticleFetcher;
  aiProvider: AiProvider;
  sourceConfigs: SourceConfig[];
  blacklist: string[];
  itemConcurrency: number;
  now?: Date;
};
