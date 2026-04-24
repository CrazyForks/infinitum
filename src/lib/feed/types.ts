export type FeedRange = "today" | "3d" | "7d" | "1m" | "1y" | "all";
export type FeedSort = "time_desc" | "score_desc";

export type FeedFilters = {
  range: FeedRange;
  sort: FeedSort;
  start: string | null;
  end: string | null;
  publishedStart: string | null;
  publishedEnd: string | null;
  groupId: string | null;
  sourceId: string | null;
  title: string | null;
};

export const DEFAULT_FEED_PAGE_SIZE = 20;
export const FEED_PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;

export type FeedPagination = {
  page: number;
  size: number;
  total: number;
  totalPages: number;
};

export type FeedSingleEntryDTO = {
  id: string;
  type: "single";
  clusterId: string; // 用于投票的聚类ID
  title: string;
  originalUrl: string;
  publishedAt: string;
  createdAt: string;
  latestPublishedAt: string;
  sourceName: string;
  author?: string | null;
  summary: string;
  score: number;
  sourceCount: number;
  itemCount: number;
  upvotes: number;
  downvotes: number;
  userVote: "upvote" | "downvote" | null;
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
  createdAt: string;
  latestPublishedAt: string;
  score: number;
  sourceCount: number;
  itemCount: number;
  upvotes: number;
  downvotes: number;
  userVote: "upvote" | "downvote" | null;
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
  moderationReason: "marketing" | "low_quality" | "duplicate_noise" | "rule_filter" | "rule_blacklist" | "other" | null;
  moderationDetail: string | null;
  qualityScore: number;
  qualityRationale: string;
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
  itemsAdded: number;
  errorSummary?: string | null;
};

export type FeedGroupOption = {
  id: string;
  name: string;
  count: number;
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
  aiParsingEnabled: boolean;
};
