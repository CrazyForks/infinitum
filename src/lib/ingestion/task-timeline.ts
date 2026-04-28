import type {
  TaskStageTimingSnapshot,
  TaskTimelineNodeSnapshot,
  TaskTimelineNodeStatus,
} from "@/lib/tasks/types";

export type IngestionStageTiming = {
  key: string;
  label: string;
  startedAt: Date | null;
  finishedAt: Date | null;
  durationMs: number | null;
};

export type IngestionTimelineCounters = {
  sourceFetch: {
    sourcesFetched: number;
    itemsFetched: number;
    fullTextFetched: number;
  };
  ruleFilter: {
    ruleFiltered: number;
    reusedExisting: number;
  };
  itemSummary: {
    completed: number;
    failed: number;
  };
  itemAnalysis: {
    completed: number;
    filtered: number;
  };
  clusterAssignment: {
    exactMatch: number;
    cheapRankDirect: number;
    aiMatch: number;
    skippedIncompleteSignature: number;
    newCluster: number;
  };
  clusterMerge: {
    candidates: number;
    skipped: boolean;
    merged: number;
  };
  clusterFinalize: {
    recomputed: number;
    updated: number;
    deleted: number;
    summarySucceeded: number;
    summaryFailed: number;
  };
};

export type IngestionTaskStageState = {
  sourceSync: IngestionStageTiming | null;
  itemProcessing: IngestionStageTiming | null;
  clusterFinalize: IngestionStageTiming | null;
};

export type IngestionTimelineModelNames = {
  itemSummary: string | null;
  itemAnalysis: string | null;
  clusterMatch: string | null;
  clusterMerge: string | null;
  clusterSummary: string | null;
};

function toTaskStageTimingSnapshot(stageTiming: IngestionStageTiming): TaskStageTimingSnapshot {
  return {
    key: stageTiming.key,
    label: stageTiming.label,
    startedAt: stageTiming.startedAt?.toISOString() ?? null,
    finishedAt: stageTiming.finishedAt?.toISOString() ?? null,
    durationMs: stageTiming.durationMs,
  };
}

export function createIngestionStageTracker() {
  const stageTimings: IngestionStageTiming[] = [];

  return {
    snapshot() {
      return stageTimings.map(toTaskStageTimingSnapshot);
    },
    startStage(key: string, label: string) {
      const stageTiming: IngestionStageTiming = {
        key,
        label,
        startedAt: new Date(),
        finishedAt: null,
        durationMs: null,
      };

      stageTimings.push(stageTiming);
      return stageTiming;
    },
    finishStage(stageTiming: IngestionStageTiming) {
      if (stageTiming.finishedAt) {
        return;
      }

      const finishedAt = new Date();
      stageTiming.finishedAt = finishedAt;
      stageTiming.durationMs = stageTiming.startedAt ? finishedAt.getTime() - stageTiming.startedAt.getTime() : null;
    },
  };
}

export function createIngestionTimelineCounters(): IngestionTimelineCounters {
  return {
    sourceFetch: {
      sourcesFetched: 0,
      itemsFetched: 0,
      fullTextFetched: 0,
    },
    ruleFilter: {
      ruleFiltered: 0,
      reusedExisting: 0,
    },
    itemSummary: {
      completed: 0,
      failed: 0,
    },
    itemAnalysis: {
      completed: 0,
      filtered: 0,
    },
    clusterAssignment: {
      exactMatch: 0,
      cheapRankDirect: 0,
      aiMatch: 0,
      skippedIncompleteSignature: 0,
      newCluster: 0,
    },
    clusterMerge: {
      candidates: 0,
      skipped: true,
      merged: 0,
    },
    clusterFinalize: {
      recomputed: 0,
      updated: 0,
      deleted: 0,
      summarySucceeded: 0,
      summaryFailed: 0,
    },
  };
}

export function createIngestionTimelineModelNames(): IngestionTimelineModelNames {
  return {
    itemSummary: null,
    itemAnalysis: null,
    clusterMatch: null,
    clusterMerge: null,
    clusterSummary: null,
  };
}

export function createInitialIngestionTaskTimeline(): TaskTimelineNodeSnapshot[] {
  return [
    { key: "source_fetch", label: "信息抓取", status: "running", startedAt: null, finishedAt: null, durationMs: null, metrics: [] },
    { key: "rule_filter", label: "规则过滤", status: "pending", startedAt: null, finishedAt: null, durationMs: null, metrics: [] },
    { key: "item_summary", label: "条目摘要", status: "pending", startedAt: null, finishedAt: null, durationMs: null, metrics: [] },
    { key: "item_analysis", label: "内容分析", status: "pending", startedAt: null, finishedAt: null, durationMs: null, metrics: [] },
    { key: "cluster_assignment", label: "归组决策", status: "pending", startedAt: null, finishedAt: null, durationMs: null, metrics: [] },
    { key: "cluster_merge", label: "聚合合并", status: "pending", startedAt: null, finishedAt: null, durationMs: null, metrics: [] },
    { key: "cluster_finalize", label: "聚合收尾", status: "pending", startedAt: null, finishedAt: null, durationMs: null, metrics: [] },
  ];
}

function toNodeTiming(stageTiming: IngestionStageTiming | null) {
  return {
    startedAt: stageTiming?.startedAt?.toISOString() ?? null,
    finishedAt: stageTiming?.finishedAt?.toISOString() ?? null,
    durationMs: stageTiming?.durationMs ?? null,
  };
}

function resolveNodeStatusFromCounts(options: {
  stageTiming: IngestionStageTiming | null;
  successCount: number;
  failureCount?: number;
  allowEmptySuccess?: boolean;
}): TaskTimelineNodeStatus {
  const { stageTiming, successCount, failureCount = 0, allowEmptySuccess = false } = options;

  if (!stageTiming) {
    return "pending";
  }

  if (!stageTiming.finishedAt) {
    return "running";
  }

  if (successCount === 0 && failureCount === 0) {
    return allowEmptySuccess ? "succeeded" : "skipped";
  }

  if (failureCount > 0 && successCount === 0) {
    return "failed";
  }

  if (failureCount > 0) {
    return "partial";
  }

  return "succeeded";
}

export function buildIngestionTaskTimeline(input: {
  counters: IngestionTimelineCounters;
  stages: IngestionTaskStageState;
  modelNames: IngestionTimelineModelNames;
}): TaskTimelineNodeSnapshot[] {
  const { counters, stages, modelNames } = input;
  const clusterFinalizeCounts =
    counters.clusterFinalize.recomputed +
    counters.clusterFinalize.updated +
    counters.clusterFinalize.deleted +
    counters.clusterFinalize.summarySucceeded +
    counters.clusterFinalize.summaryFailed;

  return [
    {
      key: "source_fetch",
      label: "信息抓取",
      status: stages.sourceSync ? (stages.sourceSync.finishedAt ? "succeeded" : "running") : "running",
      ...toNodeTiming(stages.sourceSync),
      metrics: [
        { label: "抓取源", value: counters.sourceFetch.sourcesFetched },
        { label: "抓取内容", value: counters.sourceFetch.itemsFetched },
        { label: "正文补抓", value: counters.sourceFetch.fullTextFetched },
      ],
    },
    {
      key: "rule_filter",
      label: "规则过滤",
      status: resolveNodeStatusFromCounts({
        stageTiming: stages.itemProcessing,
        successCount: counters.ruleFilter.ruleFiltered + counters.ruleFilter.reusedExisting,
      }),
      ...toNodeTiming(stages.itemProcessing),
      metrics: [
        { label: "命中规则过滤", value: counters.ruleFilter.ruleFiltered },
        { label: "复用已有处理", value: counters.ruleFilter.reusedExisting },
      ],
    },
    {
      key: "item_summary",
      label: "条目摘要",
      status: resolveNodeStatusFromCounts({
        stageTiming: stages.itemProcessing,
        successCount: counters.itemSummary.completed,
        failureCount: counters.itemSummary.failed,
      }),
      ...toNodeTiming(stages.itemProcessing),
      modelName: modelNames.itemSummary,
      metrics: [
        { label: "完成", value: counters.itemSummary.completed },
        { label: "失败", value: counters.itemSummary.failed },
      ],
    },
    {
      key: "item_analysis",
      label: "内容分析",
      status: resolveNodeStatusFromCounts({
        stageTiming: stages.itemProcessing,
        successCount: counters.itemAnalysis.completed,
      }),
      ...toNodeTiming(stages.itemProcessing),
      modelName: modelNames.itemAnalysis,
      metrics: [
        { label: "完成", value: counters.itemAnalysis.completed },
        { label: "过滤", value: counters.itemAnalysis.filtered },
      ],
    },
    {
      key: "cluster_assignment",
      label: "归组决策",
      status: resolveNodeStatusFromCounts({
        stageTiming: stages.itemProcessing,
        successCount:
          counters.clusterAssignment.exactMatch +
          counters.clusterAssignment.cheapRankDirect +
          counters.clusterAssignment.aiMatch +
          counters.clusterAssignment.skippedIncompleteSignature +
          counters.clusterAssignment.newCluster,
      }),
      ...toNodeTiming(stages.itemProcessing),
      modelName: modelNames.clusterMatch,
      metrics: [
        { label: "指纹命中", value: counters.clusterAssignment.exactMatch },
        { label: "本地直连", value: counters.clusterAssignment.cheapRankDirect },
        { label: "AI归组", value: counters.clusterAssignment.aiMatch },
        { label: "跳过", value: counters.clusterAssignment.skippedIncompleteSignature },
        { label: "新建", value: counters.clusterAssignment.newCluster },
      ],
    },
    {
      key: "cluster_merge",
      label: "聚合合并",
      status: counters.clusterMerge.candidates > 0
        ? (counters.clusterMerge.skipped ? "skipped" : "succeeded")
        : "skipped",
      startedAt: null,
      finishedAt: null,
      durationMs: null,
      modelName: modelNames.clusterMerge,
      metrics: [
        { label: "候选组", value: counters.clusterMerge.candidates },
        { label: "跳过", value: counters.clusterMerge.skipped ? 1 : 0 },
        { label: "合并后", value: counters.clusterMerge.candidates - counters.clusterMerge.merged },
      ],
    },
    {
      key: "cluster_finalize",
      label: "聚合收尾",
      status: resolveNodeStatusFromCounts({
        stageTiming: stages.clusterFinalize,
        successCount:
          counters.clusterFinalize.recomputed +
          counters.clusterFinalize.updated +
          counters.clusterFinalize.deleted +
          counters.clusterFinalize.summarySucceeded,
        failureCount: counters.clusterFinalize.summaryFailed,
        allowEmptySuccess: Boolean(stages.clusterFinalize?.finishedAt) && clusterFinalizeCounts === 0,
      }),
      ...toNodeTiming(stages.clusterFinalize),
      modelName: modelNames.clusterSummary,
      metrics: [
        { label: "参与重算", value: counters.clusterFinalize.recomputed },
        { label: "完成更新", value: counters.clusterFinalize.updated },
        { label: "摘要完成", value: counters.clusterFinalize.summarySucceeded },
        { label: "摘要失败", value: counters.clusterFinalize.summaryFailed },
        { label: "已删除", value: counters.clusterFinalize.deleted },
      ],
    },
  ];
}
