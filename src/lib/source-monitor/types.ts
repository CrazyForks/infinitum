export type SourceMonitorHealthStatus = "unknown" | "healthy" | "failed";

export type SourceInactivityBucketKey =
  | "day"
  | "week"
  | "month"
  | "quarter"
  | "half_year"
  | "year";

export type SourceMonitorEntry = {
  id: string;
  name: string;
  rssUrl: string;
  siteUrl: string;
  groupName: string | null;
  healthStatus: SourceMonitorHealthStatus;
  healthMessage: string | null;
  healthCheckedAt: string | null;
  lastFetchedAt: string | null;
  lastItemCreatedAt: string | null;
  inactiveDays: number | null;
};

export type SourceInactivityBucketSnapshot = {
  key: SourceInactivityBucketKey;
  label: string;
  days: number;
  cutoff: string;
  count: number;
  sources: SourceMonitorEntry[];
};

export type SourceMonitorSnapshot = {
  generatedAt: string;
  totalEnabledSourceCount: number;
  health: {
    healthyCount: number;
    failedCount: number;
    unknownCount: number;
    attentionSources: SourceMonitorEntry[];
  };
  inactivityBuckets: SourceInactivityBucketSnapshot[];
};
