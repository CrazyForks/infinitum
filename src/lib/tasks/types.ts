export type DefaultIngestionScheduleKey = "ingestion_default";

export type BackgroundTaskRunKind =
  | "ingestion"
  | "item_regenerate_translation"
  | "item_regenerate_summary"
  | "item_reanalyze"
  | "cluster_regenerate_summary";

export type BackgroundTaskRunTrigger = "scheduled" | "manual" | "admin_action";

export type BackgroundTaskRunStatus = "queued" | "running" | "succeeded" | "failed" | "partial";

export type ScheduleUpdateInput = {
  enabled: boolean;
  intervalMinutes: number;
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
  startedAt: string | null;
  finishedAt: string | null;
  errorSummary: string | null;
};

export type TaskScheduleSnapshot = {
  key: DefaultIngestionScheduleKey;
  enabled: boolean;
  intervalMinutes: number;
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
