export type FeedRange = "today" | "3d" | "7d" | "1m" | "1y" | "all";
export type FeedSort = "time_desc" | "score_desc";

export type FeedFilters = {
  range: FeedRange;
  sort: FeedSort;
  start: string | null;
  end: string | null;
  groupId: string | null;
  sourceId: string | null;
  title: string | null;
};

export type FeedSingleEntryDTO = {
  id: string;
  type: "single";
  title: string;
  originalUrl: string;
  publishedAt: string;
  latestPublishedAt: string;
  sourceName: string;
  author?: string | null;
  summary: string;
  score: number;
  sourceCount: number;
  itemCount: number;
  canRegenerateTranslation?: boolean;
};

export type FeedClusterPreviewItemDTO = {
  id: string;
  title: string;
  originalUrl: string;
  publishedAt: string;
  sourceName: string;
  author?: string | null;
  summary: string;
  score: number;
  canRegenerateTranslation?: boolean;
};

export type FeedClusterEntryDTO = {
  id: string;
  type: "cluster";
  title: string;
  summary: string;
  publishedAt: string;
  latestPublishedAt: string;
  score: number;
  sourceCount: number;
  itemCount: number;
  itemsPreview: FeedClusterPreviewItemDTO[];
  hasMoreItems: boolean;
};

export type FeedEntryDTO = FeedSingleEntryDTO | FeedClusterEntryDTO;
export type FeedItemDTO = FeedSingleEntryDTO;

export type ReviewItemDTO = {
  id: string;
  title: string;
  originalUrl: string;
  publishedAt: string;
  sourceName: string;
  author?: string | null;
  summary: string;
  moderationStatus: "allowed" | "filtered" | "restored";
  moderationReason: "marketing" | "low_quality" | "duplicate_noise" | "rule_blacklist" | "other" | null;
  moderationDetail: string | null;
  qualityScore: number;
  qualityRationale: string;
  topicLabel: string | null;
  canRegenerateTranslation?: boolean;
};

export type ClusterDTO = {
  id: string;
  title: string;
  summary: string;
  score: number;
  itemCount: number;
  latestPublishedAt: string;
  status: "active" | "hidden";
  items: FeedClusterPreviewItemDTO[];
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

export type FeedGroupOption = {
  id: string;
  name: string;
};

export type FeedSourceOption = {
  id: string;
  name: string;
  groupId: string | null;
};

export type SourceConfig = {
  name: string;
  rssUrl: string;
  siteUrl: string;
  enabled: boolean;
  fetchFullTextWhenMissing: boolean;
};
