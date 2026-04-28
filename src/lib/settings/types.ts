export type PromptConfigType =
  | "item_summary"
  | "item_analysis"
  | "cluster_summary"
  | "cluster_match"
  | "cluster_merge"
  | "daily_report";

export type AdminModelApiConfig = {
  id: string;
  name: string;
  baseUrl: string;
  modelName: string;
  ingestionItemConcurrency: number;
  apiKeyMasked: string;
  hasApiKey: boolean;
  isEnabled: boolean;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AdminModelApiConfigDetail = AdminModelApiConfig & {
  apiKeyRaw: string;
};

export type AdminPromptConfig = {
  id: string;
  name: string;
  type: PromptConfigType;
  prompt: string;
  systemPrompt: string | null;
  temperature: number | null;
  maxTokens: number | null;
  topP: number | null;
  modelApiConfigId: string | null;
  modelApiConfigName: string | null;
  isUsingDefaultModel: boolean; // true if modelApiConfigId is null in database
  isEnabled: boolean;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AdminSettingsSnapshot = {
  modelApiConfigs: AdminModelApiConfig[];
  promptConfigs: AdminPromptConfig[];
  blacklistKeywords: string[];
  taskSchedule: {
    key: "ingestion_default";
    enabled: boolean;
    cronExpression: string;
    sourceConcurrency: number;
    fullTextFetchThreshold: number;
    perSourceItemLimit: number;
    dailyReportCandidateLimit: number;
    dailyReportOffsetDays: number;
    dailyReportAutoPublish: boolean;
    dailyReportMaxRetries: number;
    processingStartAt?: string | null;
    timezone: string;
    lastHeartbeatAt: string | null;
    lastRunStartedAt: string | null;
    lastRunFinishedAt: string | null;
    lastRunStatus: "queued" | "running" | "succeeded" | "failed" | "partial" | "cancelled" | null;
    nextRunAt: string;
    isHeartbeatStale: boolean;
  };
  dailyReportSchedule: {
    key: "daily_report_default";
    enabled: boolean;
    cronExpression: string;
    sourceConcurrency: number;
    fullTextFetchThreshold: number;
    perSourceItemLimit: number;
    dailyReportCandidateLimit: number;
    dailyReportOffsetDays: number;
    dailyReportAutoPublish: boolean;
    dailyReportMaxRetries: number;
    processingStartAt?: string | null;
    timezone: string;
    lastHeartbeatAt: string | null;
    lastRunStartedAt: string | null;
    lastRunFinishedAt: string | null;
    lastRunStatus: "queued" | "running" | "succeeded" | "failed" | "partial" | "cancelled" | null;
    nextRunAt: string;
    isHeartbeatStale: boolean;
  };
  groups: Array<{
    id: string;
    name: string;
    sortOrder: number;
  }>;
  sources: Array<{
    id: string;
    name: string;
    rssUrl: string;
    siteUrl: string;
    enabled: boolean;
    aiParsingEnabled: boolean;
    aggregationEnabled: boolean;
    groupId: string | null;
    groupName: string | null;
    lastItemCreatedAt: string | null;
  }>;
};

export type ResolvedSourceMetadata = {
  name: string;
  rssUrl: string;
  siteUrl: string;
  suggestedAiParsingEnabled: boolean;
};

export type OpmlImportFailure = {
  rssUrl: string | null;
  message: string;
};

export type OpmlImportSummary = {
  totalCount: number;
  createdCount: number;
  updatedCount: number;
  failedCount: number;
  failures: OpmlImportFailure[];
};
