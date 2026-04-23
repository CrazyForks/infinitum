import type { ItemStatus, SourceConfig } from "@/lib/feed/types";

import type { AiProvider } from "@/lib/ai/provider";
import type {
  TaskAiCallBreakdownSnapshot,
  TaskStageTimingSnapshot,
  TaskTimelineNodeSnapshot,
} from "@/lib/tasks/types";

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

export type ParsedFeed = {
  title?: string | null;
  link?: string | null;
  feedUrl?: string | null;
  items?: ParsedFeedItem[];
};

export type RssParserLike = {
  parseURL(url: string): Promise<ParsedFeed>;
};

export type ArticleFetcher = (url: string) => Promise<string | null>;

export type ProcessedItemRecord = {
  id: string;
  status: ItemStatus;
  isNew: boolean;
  affectedClusterId?: string | null;
  fullTextFetched?: boolean;
  metrics?: {
    blacklistFiltered?: boolean;
    reusedExisting?: boolean;
    summaryCompleted?: boolean;
    summaryFailed?: boolean;
    analysisCompleted?: boolean;
    analysisFiltered?: boolean;
    clusterAssignment?: {
      exactMatch?: boolean;
      cheapRankDirect?: boolean;
      aiMatch?: boolean;
      skippedIncompleteSignature?: boolean;
      newCluster?: boolean;
    };
  };
};

export type RunIngestionOptions = {
  trigger: "scheduled" | "manual";
  parser: RssParserLike;
  articleFetcher: ArticleFetcher;
  aiProvider: AiProvider;
  sourceConfigs: SourceConfig[];
  blacklist: string[];
  itemConcurrency: number;
  sourceConcurrency: number;
  fullTextFetchThreshold: number;
  perSourceItemLimit: number;
  now?: Date;
  onProgress?: (snapshot: {
    status: "running" | "succeeded" | "failed" | "partial";
    sourceCount: number;
    itemCount: number;
    successCount: number;
    failureCount: number;
    itemsAdded: number;
    fullTextFetchedCount: number;
    aiCallCountActual?: number;
    aiCallCountEstimated?: number;
    aiCallBreakdown?: TaskAiCallBreakdownSnapshot[];
    errorSummary?: string | null;
    stageTimings?: TaskStageTimingSnapshot[];
    taskTimeline?: TaskTimelineNodeSnapshot[];
  }) => Promise<void> | void;
};
