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
};

export type EnqueueTaskRunInput = {
  kind: BackgroundTaskRunKind;
  triggerType: BackgroundTaskRunTrigger;
  label: string;
  entityId?: string | null;
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
  aiCallCountActual: number;
  aiCallCountEstimated: number;
  cancelRequestedAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  errorSummary: string | null;
};

export type TaskScheduleSnapshot = {
  key: DefaultIngestionScheduleKey;
  enabled: boolean;
  cronExpression: string;
  sourceConcurrency: number;
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
