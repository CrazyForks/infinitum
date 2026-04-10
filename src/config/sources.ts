import type { SourceConfig } from "@/lib/feed/types";

export const DEFAULT_SOURCE_CONFIGS: SourceConfig[] = [
  {
    name: "OpenAI News",
    rssUrl: "https://openai.com/news/rss.xml",
    siteUrl: "https://openai.com/news",
    enabled: true,
    fetchFullTextWhenMissing: true,
  },
  {
    name: "Hacker News Frontpage",
    rssUrl: "https://hnrss.org/frontpage",
    siteUrl: "https://news.ycombinator.com/",
    enabled: true,
    fetchFullTextWhenMissing: false,
  },
];
