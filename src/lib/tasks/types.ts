export const DEFAULT_INGESTION_SCHEDULE_KEY = "ingestion_default" as const;
export const DEFAULT_INGESTION_TASK_LABEL = "默认抓取任务";

export type DefaultIngestionScheduleKey = typeof DEFAULT_INGESTION_SCHEDULE_KEY;

export type BackgroundTaskRunKind =
  | "ingestion"
  | "item_regenerate_translation"
  | "item_regenerate_summary"
  | "item_reanalyze"
  | "cluster_regenerate_summary";

export type BackgroundTaskRunTrigger = "scheduled" | "manual" | "admin_action";

export type BackgroundTaskRunStatus = "queued" | "running" | "succeeded" | "failed" | "partial" | "cancelled";

export type ScheduleUpdateInput = {
  enabled: boolean;
  cronExpression: string;
  sourceConcurrency: number;
  fullTextFetchThreshold: number;
};

export type EnqueueTaskRunInput = {
  kind: BackgroundTaskRunKind;
  triggerType: BackgroundTaskRunTrigger;
  label: string;
  entityId?: string | null;
};

export type TaskStageTimingSnapshot = {
  key: string;
  label: string;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
};

export type TaskAiCallBreakdownKey =
  | "item_analysis"
  | "cluster_match"
  | "cluster_summary";

export type TaskAiCallBreakdownSnapshot = {
  key: TaskAiCallBreakdownKey;
  label: string;
  actual: number;
  estimated: number;
};

export type TaskRunSnapshot = {
  id: string;
  kind: BackgroundTaskRunKind;
  triggerType: BackgroundTaskRunTrigger;
  status: BackgroundTaskRunStatus;
  label: string;
  entityId: string | null;
  progressCurrent: number;
  progressTotal: number;
  progressLabel: string | null;
  itemsAdded: number;
  fullTextFetchedCount?: number;
  aiCallCountActual: number;
  aiCallCountEstimated: number;
  aiCallBreakdown?: TaskAiCallBreakdownSnapshot[];
  cancelRequestedAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  errorSummary: string | null;
  stageTimings: TaskStageTimingSnapshot[];
};

export type TaskScheduleSnapshot = {
  key: DefaultIngestionScheduleKey;
  enabled: boolean;
  cronExpression: string;
  sourceConcurrency: number;
  fullTextFetchThreshold: number;
  timezone: string;
  lastHeartbeatAt: string | null;
  lastRunStartedAt: string | null;
  lastRunFinishedAt: string | null;
  lastRunStatus: BackgroundTaskRunStatus | null;
  nextRunAt: string;
  isHeartbeatStale: boolean;
};

export type BackgroundTaskMonitorSnapshot = {
  schedule: TaskScheduleSnapshot;
  runningTasks: TaskRunSnapshot[];
  recentTasks: TaskRunSnapshot[];
};
