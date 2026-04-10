export type FeedRange = "today" | "3d" | "7d" | "1m" | "1y" | "all";

export type FeedItemDTO = {
  id: string;
  title: string;
  originalUrl: string;
  publishedAt: string;
  sourceName: string;
  author?: string | null;
  summary: string;
};

export type IngestionTrigger = "scheduled" | "manual";

export type ItemStatus = "new" | "fetched" | "filtered" | "processed" | "failed";

export type FetchRunSnapshot = {
  id: string;
  status: "running" | "succeeded" | "failed" | "partial";
  triggerType: IngestionTrigger;
  startedAt: string;
  finishedAt: string | null;
  sourceCount: number;
  itemCount: number;
  successCount: number;
  failureCount: number;
  errorSummary?: string | null;
};

export type SourceConfig = {
  name: string;
  rssUrl: string;
  siteUrl: string;
  enabled: boolean;
  fetchFullTextWhenMissing: boolean;
};
