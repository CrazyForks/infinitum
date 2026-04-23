import type { BackgroundTaskRun, FetchRun, FetchRunStatus } from "@prisma/client";

import { INGESTION_PROGRESS_FLUSH_INTERVAL_MS } from "@/config/constants";
import type { RuntimeConfig } from "@/config/runtime";
import { createAiProvider, type AiEventSignature } from "@/lib/ai/provider";
import {
  assignItemToCluster,
  createClusterAssignmentCoordinator,
  recomputeCluster,
  type ClusterRecomputeResult,
} from "@/lib/clusters/service";
import { prisma } from "@/lib/db";
import {
  completeFetchRun,
  createFetchRun,
  findExistingItem,
  syncSources,
  updateFetchRunProgress,
  upsertItem,
} from "@/lib/feed/repository";
import { invalidateFeedCache } from "@/lib/feed/cache";
import { shouldTranslateTitle, stripHtmlTags } from "@/lib/feed/presentation";
import { buildDedupeKeys, shouldFetchFullText } from "@/lib/ingestion/dedupe";
import { findBlacklistMatch } from "@/lib/ingestion/filtering";
import { fetchArticleContent } from "@/lib/ingestion/article";
import { createRssParser } from "@/lib/ingestion/parser";
import type {
  ParsedFeedItem,
  ProcessedItemRecord,
  RunIngestionOptions,
} from "@/lib/ingestion/types";
import { getIngestionRuntimeConfig } from "@/lib/settings/service";
import { DEFAULT_FULL_TEXT_FETCH_THRESHOLD } from "@/lib/tasks/scheduler";
import {
  DEFAULT_INGESTION_TASK_LABEL,
  type TaskAiCallBreakdownSnapshot,
  type TaskStageTimingSnapshot,
  type TaskTimelineNodeSnapshot,
  type TaskTimelineNodeStatus,
} from "@/lib/tasks/types";
import {
  enqueueTaskRun,
  isTaskRunCancellationRequested,
  TASK_RUN_CANCELLED_LABEL,
  TASK_RUN_CANCELLED_MESSAGE,
  updateTaskRun,
} from "@/lib/tasks/service";
import { createTaskAiUsageTracker } from "@/lib/tasks/ai-usage";

type PreparedFeedItem = {
  item: ParsedFeedItem;
  sourceId: string;
  sourceName: string;
  aiParsingEnabled: boolean;
};

type ResolvedRunOptions = RunIngestionOptions & {
  now: Date;
  taskTimelineModelNames: IngestionTimelineModelNames;
};

// 摄入进度刷新间隔常量已移至 @/config/constants

type IngestionStageTiming = {
  key: string;
  label: string;
  startedAt: Date | null;
  finishedAt: Date | null;
  durationMs: number | null;
};

type IngestionTimelineCounters = {
  sourceFetch: {
    sourcesFetched: number;
    itemsFetched: number;
    fullTextFetched: number;
  };
  ruleFilter: {
    blacklistFiltered: number;
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
  clusterFinalize: {
    recomputed: number;
    updated: number;
    deleted: number;
    summarySucceeded: number;
    summaryFailed: number;
  };
};

type IngestionTaskStageState = {
  sourceSync: IngestionStageTiming | null;
  itemProcessing: IngestionStageTiming | null;
  clusterFinalize: IngestionStageTiming | null;
};

type IngestionTimelineModelNames = {
  itemSummary: string | null;
  itemAnalysis: string | null;
  clusterMatch: string | null;
  clusterSummary: string | null;
};

type RuntimePromptConfigs = NonNullable<RuntimeConfig["selectedPromptConfigs"]>;
type RuntimePromptConfig =
  | RuntimePromptConfigs["itemSummary"]
  | RuntimePromptConfigs["itemAnalysis"]
  | RuntimePromptConfigs["clusterSummary"]
  | RuntimePromptConfigs["clusterMatch"];

const EVENT_TYPES = new Set<NonNullable<AiEventSignature["eventType"]>>([
  "release",
  "launch",
  "update",
  "funding",
  "acquisition",
  "partnership",
  "policy",
  "research",
  "security",
  "other",
]);

class TaskRunCancellationError extends Error {
  snapshot: {
    sourceCount: number;
    itemCount: number;
    successCount: number;
    failureCount: number;
    itemsAdded: number;
    fullTextFetchedCount: number;
    errorSummary: string | null;
    stageTimings: TaskStageTimingSnapshot[];
    taskTimeline: TaskTimelineNodeSnapshot[];
  };

  constructor(snapshot: {
    sourceCount: number;
    itemCount: number;
    successCount: number;
    failureCount: number;
    itemsAdded: number;
    fullTextFetchedCount: number;
    errorSummary: string | null;
    stageTimings: TaskStageTimingSnapshot[];
    taskTimeline: TaskTimelineNodeSnapshot[];
  }) {
    super(TASK_RUN_CANCELLED_MESSAGE);
    this.name = "TaskRunCancellationError";
    this.snapshot = snapshot;
  }
}

function toTaskStageTimingSnapshot(stageTiming: IngestionStageTiming): TaskStageTimingSnapshot {
  return {
    key: stageTiming.key,
    label: stageTiming.label,
    startedAt: stageTiming.startedAt?.toISOString() ?? null,
    finishedAt: stageTiming.finishedAt?.toISOString() ?? null,
    durationMs: stageTiming.durationMs,
  };
}

function createIngestionStageTracker() {
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

function createIngestionTimelineCounters(): IngestionTimelineCounters {
  return {
    sourceFetch: {
      sourcesFetched: 0,
      itemsFetched: 0,
      fullTextFetched: 0,
    },
    ruleFilter: {
      blacklistFiltered: 0,
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
    clusterFinalize: {
      recomputed: 0,
      updated: 0,
      deleted: 0,
      summarySucceeded: 0,
      summaryFailed: 0,
    },
  };
}

function createIngestionTimelineModelNames(): IngestionTimelineModelNames {
  return {
    itemSummary: null,
    itemAnalysis: null,
    clusterMatch: null,
    clusterSummary: null,
  };
}

function resolvePromptModelName(
  promptConfig: RuntimePromptConfig | undefined,
  defaultModelName: string | null,
): string | null {
  return promptConfig?.modelApi?.model ?? defaultModelName;
}

function createInitialIngestionTaskTimeline(): TaskTimelineNodeSnapshot[] {
  return [
    { key: "source_fetch", label: "信息抓取", status: "running", startedAt: null, finishedAt: null, durationMs: null, metrics: [] },
    { key: "rule_filter", label: "规则过滤", status: "pending", startedAt: null, finishedAt: null, durationMs: null, metrics: [] },
    { key: "item_summary", label: "条目摘要", status: "pending", startedAt: null, finishedAt: null, durationMs: null, metrics: [] },
    { key: "item_analysis", label: "内容分析", status: "pending", startedAt: null, finishedAt: null, durationMs: null, metrics: [] },
    { key: "cluster_assignment", label: "归组决策", status: "pending", startedAt: null, finishedAt: null, durationMs: null, metrics: [] },
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

function buildIngestionTaskTimeline(input: {
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
        successCount: counters.ruleFilter.blacklistFiltered + counters.ruleFilter.reusedExisting,
      }),
      ...toNodeTiming(stages.itemProcessing),
      metrics: [
        { label: "命中黑名单", value: counters.ruleFilter.blacklistFiltered },
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

function getBestContent(item: ParsedFeedItem): string {
  return item["content:encoded"] || item.content || item.contentSnippet || "";
}

function parsePublishedAt(item: ParsedFeedItem, fallback: Date): Date {
  const raw = item.isoDate || item.pubDate;
  const parsed = raw ? new Date(raw) : null;

  if (!parsed || Number.isNaN(parsed.getTime())) {
    return fallback;
  }

  return parsed;
}

function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return url;
  }
}

function truncateText(value: string, maxLength = 180): string {
  const trimmed = stripHtmlTags(value);

  if (!trimmed) {
    return "";
  }

  return trimmed.length <= maxLength ? trimmed : `${trimmed.slice(0, maxLength).trim()}...`;
}

function appendIssue(issues: string[], error: unknown, fallbackMessage: string) {
  issues.push(error instanceof Error ? error.message : fallbackMessage);
}

function deriveSourceConcurrency(itemConcurrency: number) {
  return Math.max(1, Math.min(4, Math.ceil(itemConcurrency / 2)));
}

function buildFallbackSummary(rssExcerpt: string | null, fallbackBody: string | null): string | null {
  const sanitizedExcerpt = stripHtmlTags(rssExcerpt);
  const sanitizedBody = stripHtmlTags(fallbackBody);

  if (sanitizedExcerpt) {
    return sanitizedExcerpt;
  }

  if (sanitizedBody) {
    return truncateText(sanitizedBody);
  }

  return null;
}

function hasSucceededSummary(existing?: {
  summaryStatus?: string | null;
  summaryText?: string | null;
} | null) {
  return existing?.summaryStatus === "succeeded" && Boolean(stripHtmlTags(existing.summaryText));
}

function hasSucceededAnalysis(existing?: {
  analysisStatus?: string | null;
} | null) {
  return existing?.analysisStatus === "succeeded";
}

function normalizeStoredEventType(value: string | null | undefined): AiEventSignature["eventType"] {
  return value && EVENT_TYPES.has(value as NonNullable<AiEventSignature["eventType"]>)
    ? (value as NonNullable<AiEventSignature["eventType"]>)
    : null;
}

function readStoredEventSignature(item?: {
  eventType?: string | null;
  eventSubject?: string | null;
  eventAction?: string | null;
  eventObject?: string | null;
  eventDate?: string | null;
} | null): AiEventSignature | null {
  if (!item) {
    return null;
  }

  return {
    eventType: normalizeStoredEventType(item.eventType),
    eventSubject: item.eventSubject ?? null,
    eventAction: item.eventAction ?? null,
    eventObject: item.eventObject ?? null,
    eventDate: item.eventDate ?? null,
  };
}

function hasAnalysisInputsChanged(
  existing: {
    originalTitle: string;
    publishedAt: Date;
    rssExcerpt: string | null;
    rssContent: string | null;
  },
  next: {
    originalTitle: string;
    publishedAt: Date;
    rssExcerpt: string | null;
    rssContent: string | null;
  },
) {
  return (
    existing.originalTitle !== next.originalTitle ||
    existing.publishedAt.getTime() !== next.publishedAt.getTime() ||
    (existing.rssExcerpt ?? null) !== (next.rssExcerpt ?? null) ||
    (existing.rssContent ?? null) !== (next.rssContent ?? null)
  );
}

function willRequireAiAnalysis(preparedItem: PreparedFeedItem, blacklist: string[]) {
  const originalTitle = preparedItem.item.title?.trim();
  const originalUrl = preparedItem.item.link?.trim();

  if (!originalTitle || !originalUrl) {
    return false;
  }

  return !findBlacklistMatch({
    title: originalTitle,
    content: [getBestContent(preparedItem.item).trim(), preparedItem.item.contentSnippet?.trim() ?? ""].filter(Boolean).join("\n"),
    blacklist,
  });
}

async function resolveRunOptions(options?: Partial<RunIngestionOptions>): Promise<ResolvedRunOptions> {
  const now = options?.now ?? new Date();
  const runtimeConfig =
    !options?.aiProvider || !options?.sourceConfigs || !options?.blacklist ? await getIngestionRuntimeConfig() : null;
  const defaultModelName = runtimeConfig?.modelApi.model ?? null;

  return {
    trigger: options?.trigger ?? "manual",
    parser: options?.parser ?? createRssParser(),
    articleFetcher: options?.articleFetcher ?? fetchArticleContent,
    aiProvider:
      options?.aiProvider ??
      createAiProvider(
        runtimeConfig?.modelApi ?? { apiKey: "", baseURL: "", model: "gpt-4.1-mini" },
        runtimeConfig?.selectedPromptConfigs
          ? {
              itemSummary: runtimeConfig.selectedPromptConfigs.itemSummary,
              itemAnalysis: runtimeConfig.selectedPromptConfigs.itemAnalysis,
              clusterSummary: runtimeConfig.selectedPromptConfigs.clusterSummary,
              clusterMatch: runtimeConfig.selectedPromptConfigs.clusterMatch,
            }
          : undefined,
      ),
    sourceConfigs: options?.sourceConfigs ?? runtimeConfig?.rssSources ?? [],
    blacklist: options?.blacklist ?? runtimeConfig?.blacklistKeywords ?? [],
    itemConcurrency: options?.itemConcurrency ?? runtimeConfig?.ingestion.itemConcurrency ?? 3,
    sourceConcurrency:
      options?.sourceConcurrency ??
      runtimeConfig?.ingestion.sourceConcurrency ??
      deriveSourceConcurrency(options?.itemConcurrency ?? runtimeConfig?.ingestion.itemConcurrency ?? 3),
    fullTextFetchThreshold:
      options?.fullTextFetchThreshold ??
      runtimeConfig?.ingestion.fullTextFetchThreshold ??
      DEFAULT_FULL_TEXT_FETCH_THRESHOLD,
    perSourceItemLimit:
      options?.perSourceItemLimit ?? runtimeConfig?.ingestion.perSourceItemLimit ?? 20,
    now,
    taskTimelineModelNames: runtimeConfig?.selectedPromptConfigs
      ? {
          itemSummary: resolvePromptModelName(runtimeConfig.selectedPromptConfigs.itemSummary, defaultModelName),
          itemAnalysis: resolvePromptModelName(runtimeConfig.selectedPromptConfigs.itemAnalysis, defaultModelName),
          clusterSummary: resolvePromptModelName(runtimeConfig.selectedPromptConfigs.clusterSummary, defaultModelName),
          clusterMatch: resolvePromptModelName(runtimeConfig.selectedPromptConfigs.clusterMatch, defaultModelName),
        }
      : createIngestionTimelineModelNames(),
  };
}

async function runWithConcurrency(
  tasks: Array<() => Promise<void>>,
  concurrency: number,
  options?: {
    shouldStop?: () => Promise<boolean>;
  },
) {
  let nextTaskIndex = 0;

  async function worker() {
    while (true) {
      if (await options?.shouldStop?.()) {
        return;
      }

      const currentIndex = nextTaskIndex;
      nextTaskIndex += 1;

      if (currentIndex >= tasks.length) {
        return;
      }

      await tasks[currentIndex]?.();
    }
  }

  const workerCount = Math.max(1, Math.min(concurrency, tasks.length));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
}

async function processFeedItem({
  item,
  sourceId,
  sourceName,
  aiParsingEnabled,
  blacklist,
  articleFetcher,
  aiProvider,
  clusterAssignmentCoordinator,
  fullTextFetchThreshold,
  now,
}: {
  item: ParsedFeedItem;
  sourceId: string;
  sourceName: string;
  aiParsingEnabled: boolean;
  blacklist: string[];
  articleFetcher: RunIngestionOptions["articleFetcher"];
  aiProvider: RunIngestionOptions["aiProvider"];
  clusterAssignmentCoordinator: ReturnType<typeof createClusterAssignmentCoordinator>;
  fullTextFetchThreshold: number;
  now: Date;
}): Promise<ProcessedItemRecord | null> {
  const originalTitle = item.title?.trim();
  const originalUrl = item.link?.trim();

  if (!originalTitle || !originalUrl) {
    return null;
  }

  const publishedAt = parsePublishedAt(item, now);
  const rssContent = getBestContent(item).trim() || null;
  const rssExcerpt = item.contentSnippet?.trim() || null;
  const canonicalUrl = normalizeUrl(originalUrl);
  const dedupeKeys = buildDedupeKeys({
    sourceName,
    canonicalUrl,
    title: originalTitle,
    publishedAt,
  });
  const existing = await findExistingItem(dedupeKeys.urlHash, dedupeKeys.signature);
  const isNew = !existing;
  const analysisInputsChanged = existing
    ? hasAnalysisInputsChanged(existing, {
        originalTitle,
        publishedAt,
        rssExcerpt,
        rssContent,
      })
    : true;

  let fullText = existing?.fullText ?? null;
  let translatedTitle = existing?.translatedTitle ?? null;
  let summaryText = existing?.summaryText ?? null;
  let status: ProcessedItemRecord["status"] = existing?.status ?? "new";
  let summaryStatus: "pending" | "succeeded" | "failed" = existing?.summaryStatus === "succeeded" || existing?.summaryStatus === "failed"
    ? existing.summaryStatus
    : "pending";
  let analysisStatus: "pending" | "succeeded" | "failed" = existing?.analysisStatus === "succeeded" || existing?.analysisStatus === "failed"
    ? existing.analysisStatus
    : "pending";
  let filterReason: string | null = existing?.filterReason ?? null;
  let moderationStatus = existing?.moderationStatus ?? "allowed";
  let moderationReason = existing?.moderationReason ?? null;
  let moderationDetail = existing?.moderationDetail ?? null;
  let qualityScore = existing?.qualityScore ?? 50;
  let qualityRationale = existing?.qualityRationale ?? "AI analysis unavailable";
  let eventSignature: AiEventSignature | null = readStoredEventSignature(existing);
  let fullTextFetched = false;
  let summaryCompleted = false;
  let summaryFailed = false;
  let analysisCompleted = false;
  const issues: string[] = [];
  const contentForFullTextDecision = fullText || rssContent || rssExcerpt || "";
  const canReuseExistingAnalysis = Boolean(
    existing &&
      !analysisInputsChanged &&
      hasSucceededSummary(existing) &&
      hasSucceededAnalysis(existing) &&
      existing.status !== "new" &&
      existing.status !== "fetched" &&
      existing.status !== "failed",
  );
  const initialFilterMatch = findBlacklistMatch({
    title: originalTitle,
    content: [rssContent, rssExcerpt].filter(Boolean).join("\n"),
    blacklist,
  });

  if (initialFilterMatch) {
    const stored = await upsertItem(
      {
        id: existing?.id,
        urlHash: dedupeKeys.urlHash,
        dedupeSignature: dedupeKeys.signature,
      },
      {
        sourceId,
        originalUrl,
        canonicalUrl: dedupeKeys.canonicalUrl,
        urlHash: dedupeKeys.urlHash,
        dedupeSignature: dedupeKeys.signature,
        originalTitle,
        translatedTitle,
        author: item.creator || item.author || null,
        publishedAt,
        rssExcerpt,
        rssContent,
        fullText,
        summaryText,
        language: shouldTranslateTitle(originalTitle) ? "en" : "unknown",
        status: "filtered",
        summaryStatus: "pending",
        analysisStatus: "pending",
        filterReason: initialFilterMatch,
        moderationStatus: "filtered",
        moderationReason: "rule_blacklist",
        moderationDetail: `Matched blacklist keyword: ${initialFilterMatch}`,
        qualityScore,
        qualityRationale,
        eventType: eventSignature?.eventType ?? null,
        eventSubject: eventSignature?.eventSubject ?? null,
        eventAction: eventSignature?.eventAction ?? null,
        eventObject: eventSignature?.eventObject ?? null,
        eventDate: eventSignature?.eventDate ?? null,
        aiProcessedAt: null,
        clusterId: null,
        errorMessage: null,
      },
    );

    return {
      id: stored.id,
      status: stored.status,
      isNew,
      affectedClusterId: existing?.clusterId ?? null,
      fullTextFetched,
      metrics: {
        blacklistFiltered: true,
      },
    };
  }

  if (canReuseExistingAnalysis) {
    const stored = await upsertItem(
      {
        id: existing?.id,
        urlHash: dedupeKeys.urlHash,
        dedupeSignature: dedupeKeys.signature,
      },
      {
        sourceId,
        originalUrl,
        canonicalUrl: dedupeKeys.canonicalUrl,
        urlHash: dedupeKeys.urlHash,
        dedupeSignature: dedupeKeys.signature,
        originalTitle,
        translatedTitle,
        author: item.creator || item.author || null,
        publishedAt,
        rssExcerpt,
        rssContent,
        fullText,
        summaryText,
        language: existing?.language ?? (shouldTranslateTitle(originalTitle) ? "en" : "unknown"),
        status,
        summaryStatus,
        analysisStatus,
        filterReason,
        moderationStatus,
        moderationReason,
        moderationDetail,
        qualityScore,
        qualityRationale,
        eventType: eventSignature?.eventType ?? null,
        eventSubject: eventSignature?.eventSubject ?? null,
        eventAction: eventSignature?.eventAction ?? null,
        eventObject: eventSignature?.eventObject ?? null,
        eventDate: eventSignature?.eventDate ?? null,
        aiProcessedAt: existing?.aiProcessedAt,
        clusterId: existing?.clusterId ?? null,
        errorMessage: null,
      },
    );

    return {
      id: stored.id,
      status: stored.status,
      isNew,
      fullTextFetched,
      metrics: {
        reusedExisting: true,
      },
    };
  }

  // 只有开启 AI 解析时才需要补抓全文
  const shouldFetchFullTextWhenMissing = aiParsingEnabled;
  if (!fullText && shouldFetchFullText(contentForFullTextDecision, shouldFetchFullTextWhenMissing, fullTextFetchThreshold)) {
    try {
      const fetchedFullText = await articleFetcher(originalUrl);
      fullText = fetchedFullText;
      status = "fetched";
      fullTextFetched = Boolean(fetchedFullText && fetchedFullText.trim());
    } catch (error) {
      appendIssue(issues, error, "Unknown article fetch error");
    }
  }

  const filterMatch = findBlacklistMatch({
    title: originalTitle,
    content: [rssContent, rssExcerpt, fullText].filter(Boolean).join("\n"),
    blacklist,
  });

  if (filterMatch) {
    status = "filtered";
    summaryStatus = "pending";
    analysisStatus = "pending";
    filterReason = filterMatch;
    moderationStatus = "filtered";
    moderationReason = "rule_blacklist";
    moderationDetail = `Matched blacklist keyword: ${filterMatch}`;
  } else if (aiParsingEnabled) {
    const translateTitle = shouldTranslateTitle(originalTitle);
    const summarySourceText = fullText || rssContent || rssExcerpt || originalTitle;
    const canReuseExistingSummary = Boolean(existing && !analysisInputsChanged && hasSucceededSummary(existing));
    const canReuseExistingCompletedAnalysis = Boolean(existing && !analysisInputsChanged && hasSucceededAnalysis(existing));

    if (canReuseExistingSummary) {
      summaryText = stripHtmlTags(existing?.summaryText) || buildFallbackSummary(rssExcerpt, fullText || rssContent);
      summaryStatus = "succeeded";
    } else {
      try {
        summaryText = stripHtmlTags(
          await aiProvider.summarizeItem(summarySourceText, {
            title: originalTitle,
            sourceName,
          }),
        ) || buildFallbackSummary(rssExcerpt, fullText || rssContent);
        summaryCompleted = true;
        summaryStatus = "succeeded";
      } catch (error) {
        appendIssue(issues, error, "Unknown item summary error");
        summaryFailed = true;
        summaryStatus = "failed";
        summaryText = buildFallbackSummary(rssExcerpt, fullText || rssContent);
      }
    }

    if (canReuseExistingCompletedAnalysis) {
      analysisStatus = "succeeded";
    } else {
      try {
        const enrichment = await aiProvider.enrichContent(summaryText || originalTitle, {
          title: originalTitle,
          sourceName,
          translateTitle,
        });

        if (translateTitle) {
          translatedTitle = enrichment.translatedTitle?.trim() || originalTitle;
        }

        moderationStatus = enrichment.moderationStatus === "restored" ? "allowed" : enrichment.moderationStatus;
        moderationReason = enrichment.moderationReason;
        moderationDetail = enrichment.moderationDetail;
        qualityScore = enrichment.qualityScore;
        qualityRationale = enrichment.qualityRationale;
        eventSignature = enrichment.eventSignature;
        analysisCompleted = true;
        analysisStatus = "succeeded";
      } catch (error) {
        appendIssue(issues, error, "Unknown ai enrichment error");
        moderationStatus = "allowed";
        moderationReason = null;
        moderationDetail = null;
        qualityScore = 50;
        qualityRationale = "AI analysis unavailable";
        eventSignature = null;
        analysisStatus = "failed";
      }
    }

    status = moderationStatus === "filtered" ? "filtered" : "processed";
  } else {
    // AI parsing disabled - use RSS data directly
    const translateTitle = shouldTranslateTitle(originalTitle);

    if (translateTitle) {
      translatedTitle = originalTitle;
    }

    summaryText = buildFallbackSummary(rssExcerpt, fullText || rssContent);
    summaryStatus = "pending";
    analysisStatus = "pending";
    moderationStatus = "allowed";
    moderationReason = null;
    moderationDetail = null;
    qualityScore = 50;
    qualityRationale = "AI parsing disabled for this source";
    eventSignature = null;
    status = "processed";
  }

  const stored = await upsertItem(
    {
      id: existing?.id,
      urlHash: dedupeKeys.urlHash,
      dedupeSignature: dedupeKeys.signature,
    },
    {
      sourceId,
      originalUrl,
      canonicalUrl: dedupeKeys.canonicalUrl,
      urlHash: dedupeKeys.urlHash,
      dedupeSignature: dedupeKeys.signature,
      originalTitle,
      translatedTitle,
      author: item.creator || item.author || null,
      publishedAt,
      rssExcerpt,
      rssContent,
      fullText,
      summaryText,
      language: shouldTranslateTitle(originalTitle) ? "en" : "unknown",
      status,
      summaryStatus,
      analysisStatus,
      filterReason,
      moderationStatus,
      moderationReason,
      moderationDetail,
      qualityScore,
      qualityRationale,
      eventType: eventSignature?.eventType ?? null,
      eventSubject: eventSignature?.eventSubject ?? null,
      eventAction: eventSignature?.eventAction ?? null,
      eventObject: eventSignature?.eventObject ?? null,
      eventDate: eventSignature?.eventDate ?? null,
      aiProcessedAt: analysisStatus === "succeeded" ? new Date() : null,
      clusterId: moderationStatus === "filtered" ? null : existing?.clusterId ?? null,
      errorMessage: issues.length > 0 ? issues.join(" | ") : null,
    },
  );

  // Track cluster changes
  let affectedClusterId: string | null = null;
  let clusterAssignmentMetrics: NonNullable<ProcessedItemRecord["metrics"]>["clusterAssignment"] | undefined;

  if (moderationStatus === "filtered") {
    if (existing?.clusterId) {
      affectedClusterId = existing.clusterId;
    }
  } else {
    const clusterAssignment = await assignItemToCluster(stored.id, {
      eventSignature,
      aiProvider,
      coordinator: clusterAssignmentCoordinator,
    });

    clusterAssignmentMetrics = {
      exactMatch: clusterAssignment.matchSource === "exact_match",
      cheapRankDirect: clusterAssignment.matchSource === "cheap_rank_direct",
      aiMatch: clusterAssignment.matchSource === "ai_match",
      skippedIncompleteSignature: clusterAssignment.skippedIncompleteSignature,
      newCluster: clusterAssignment.createdNewCluster,
    };

    if (
      clusterAssignment.clusterId &&
      (isNew || existing?.clusterId !== clusterAssignment.clusterId)
    ) {
      affectedClusterId = clusterAssignment.clusterId;
    }
  }

  return {
    id: stored.id,
    status: stored.status,
    isNew,
    affectedClusterId,
    fullTextFetched,
    metrics: {
      blacklistFiltered: Boolean(filterMatch),
      summaryCompleted,
      summaryFailed,
      analysisCompleted,
      analysisFiltered: analysisCompleted && moderationStatus === "filtered",
      clusterAssignment: clusterAssignmentMetrics,
    },
  };
}

async function executeIngestion(run: FetchRun, options: ResolvedRunOptions) {
  const {
    parser,
    articleFetcher,
    aiProvider,
    sourceConfigs,
    blacklist,
    itemConcurrency,
    sourceConcurrency,
    fullTextFetchThreshold,
    perSourceItemLimit,
    now,
    taskTimelineModelNames,
  } = options;
  const stageTracker = createIngestionStageTracker();
  const timelineCounters = createIngestionTimelineCounters();
  const taskStages: IngestionTaskStageState = {
    sourceSync: null,
    itemProcessing: null,
    clusterFinalize: null,
  };
  let sources: Awaited<ReturnType<typeof syncSources>> = [];
  const aiUsage = createTaskAiUsageTracker();
  const trackedAiProvider = aiUsage.wrapProvider(aiProvider, {
    summarizeItemEstimated: false,
  });
  const preparedItems: PreparedFeedItem[] = [];
  const errors: string[] = [];
  let successCount = 0;
  let failureCount = 0;
  let itemsAdded = 0;
  let fullTextFetchedCount = 0;
  let cancellationRequested = false;
  const affectedClusterIds = new Set<string>();
  const clusterAssignmentCoordinator = createClusterAssignmentCoordinator();
  const getProgressSnapshot = () => ({
    sourceCount: sources.length,
    itemCount: preparedItems.length,
    successCount,
    failureCount,
    itemsAdded,
    fullTextFetchedCount,
    errorSummary: errors.length > 0 ? errors.join(" | ") : null,
    stageTimings: stageTracker.snapshot(),
    taskTimeline: buildIngestionTaskTimeline({
      counters: timelineCounters,
      stages: taskStages,
      modelNames: taskTimelineModelNames,
    }),
  });
  const emitTaskProgress = async (status: FetchRunStatus | "running") => {
    const aiUsageSnapshot = aiUsage.snapshot();
    await options.onProgress?.({
      status,
      ...getProgressSnapshot(),
      aiCallCountActual: aiUsageSnapshot.actual,
      aiCallCountEstimated: aiUsageSnapshot.estimated,
      aiCallBreakdown: aiUsageSnapshot.breakdown,
    });
  };
  const checkCancellation = async () => {
    if (!run.taskRunId || cancellationRequested) {
      return cancellationRequested;
    }

    cancellationRequested = await isTaskRunCancellationRequested(run.taskRunId);
    return cancellationRequested;
  };
  const throwIfCancellationRequested = async () => {
    if (await checkCancellation()) {
      throw new TaskRunCancellationError(getProgressSnapshot());
    }
  };

  const sourceSyncStage = stageTracker.startStage("source_sync", "信息源同步");
  taskStages.sourceSync = sourceSyncStage;

  try {
    sources = await syncSources(sourceConfigs);
    await runWithConcurrency(
      sources.map((source) => async () => {
        await throwIfCancellationRequested();

        try {
          const feed = await parser.parseURL(source.rssUrl);
          const items = (feed.items ?? []).slice(0, perSourceItemLimit);

          for (const item of items) {
            preparedItems.push({
              item,
              sourceId: source.id,
              sourceName: source.name,
              aiParsingEnabled: source.aiParsingEnabled,
            });
          }
        } catch (error) {
          errors.push(`${source.name}: ${error instanceof Error ? error.message : "Unknown feed error"}`);
          failureCount += 1;
        }
      }),
      sourceConcurrency,
      {
        shouldStop: checkCancellation,
      },
    );
  } finally {
    stageTracker.finishStage(sourceSyncStage);
    timelineCounters.sourceFetch.sourcesFetched = sources.length;
    timelineCounters.sourceFetch.itemsFetched = preparedItems.length;
  }

  const estimatedAiItemCount = preparedItems.filter((preparedItem) => willRequireAiAnalysis(preparedItem, blacklist)).length;
  aiUsage.setEstimated(estimatedAiItemCount, "item_summary");
  aiUsage.setEstimated(estimatedAiItemCount, "item_analysis");

  await updateFetchRunProgress(run.id, {
    sourceCount: sources.length,
    itemCount: preparedItems.length,
    successCount,
    failureCount,
    itemsAdded,
    errorSummary: errors.length > 0 ? errors.join(" | ") : null,
  });
  await emitTaskProgress("running");

  await throwIfCancellationRequested();

  let lastProgressFlushAt = 0;
  const flushProgress = async (status: FetchRunStatus | "running") => {
    lastProgressFlushAt = Date.now();

    await updateFetchRunProgress(run.id, {
      sourceCount: sources.length,
      itemCount: preparedItems.length,
      successCount,
      failureCount,
      itemsAdded,
      errorSummary: errors.length > 0 ? errors.join(" | ") : null,
    });
    await emitTaskProgress(status);
  };
  let progressChain = Promise.resolve();
  const enqueueProgressUpdate = (
    result: ProcessedItemRecord | null,
    issue?: string,
    options?: {
      forceFlush?: boolean;
    },
  ) => {
    progressChain = progressChain.then(async () => {
      if (issue) {
        errors.push(issue);
        failureCount += 1;
      } else if (result?.status === "failed") {
        failureCount += 1;
      } else if (result && result.status !== "filtered") {
        successCount += 1;
        if (result.isNew) {
          itemsAdded += 1;
        }
      }

      if (result?.fullTextFetched) {
        fullTextFetchedCount += 1;
        timelineCounters.sourceFetch.fullTextFetched += 1;
      }

      if (result?.metrics?.blacklistFiltered) {
        timelineCounters.ruleFilter.blacklistFiltered += 1;
      }

      if (result?.metrics?.reusedExisting) {
        timelineCounters.ruleFilter.reusedExisting += 1;
      }

      if (result?.metrics?.summaryCompleted) {
        timelineCounters.itemSummary.completed += 1;
      }

      if (result?.metrics?.summaryFailed) {
        timelineCounters.itemSummary.failed += 1;
      }

      if (result?.metrics?.analysisCompleted) {
        timelineCounters.itemAnalysis.completed += 1;
      }

      if (result?.metrics?.analysisFiltered) {
        timelineCounters.itemAnalysis.filtered += 1;
      }

      if (result?.metrics?.clusterAssignment?.exactMatch) {
        timelineCounters.clusterAssignment.exactMatch += 1;
      }

      if (result?.metrics?.clusterAssignment?.cheapRankDirect) {
        timelineCounters.clusterAssignment.cheapRankDirect += 1;
      }

      if (result?.metrics?.clusterAssignment?.aiMatch) {
        timelineCounters.clusterAssignment.aiMatch += 1;
      }

      if (result?.metrics?.clusterAssignment?.skippedIncompleteSignature) {
        timelineCounters.clusterAssignment.skippedIncompleteSignature += 1;
      }

      if (result?.metrics?.clusterAssignment?.newCluster) {
        timelineCounters.clusterAssignment.newCluster += 1;
      }

      // Collect affected clusters for batch recomputation
      if (result?.affectedClusterId) {
        affectedClusterIds.add(result.affectedClusterId);
      }

      const shouldFlushNow =
        options?.forceFlush ||
        Date.now() - lastProgressFlushAt >= INGESTION_PROGRESS_FLUSH_INTERVAL_MS;

      if (!shouldFlushNow) {
        return;
      }

      await flushProgress("running");
    });

    return progressChain;
  };

  const itemProcessingStage = stageTracker.startStage("item_processing", "内容处理");
  taskStages.itemProcessing = itemProcessingStage;
  try {
    await runWithConcurrency(
      preparedItems.map((preparedItem) => async () => {
        try {
          const result = await processFeedItem({
            ...preparedItem,
            blacklist,
            articleFetcher,
            aiProvider: trackedAiProvider,
            clusterAssignmentCoordinator,
            fullTextFetchThreshold,
            now,
          });

          await enqueueProgressUpdate(result);
        } catch (error) {
          const message =
            error instanceof Error
              ? `${preparedItem.sourceName}: ${preparedItem.item.title ?? "Untitled item"}: ${error.message}`
              : `${preparedItem.sourceName}: Unknown item processing error`;
          await enqueueProgressUpdate(null, message);
        }
      }),
      itemConcurrency,
      {
        shouldStop: checkCancellation,
      },
    );

    await enqueueProgressUpdate(null, undefined, { forceFlush: true });
    await progressChain;
  } finally {
    stageTracker.finishStage(itemProcessingStage);
  }
  await throwIfCancellationRequested();

  const clusterFinalizeStage = stageTracker.startStage("cluster_finalize", "聚合收尾");
  taskStages.clusterFinalize = clusterFinalizeStage;
  await emitTaskProgress("running");
  try {
    const recomputeResults: ClusterRecomputeResult[] = [];

    // Recompute only affected clusters instead of all clusters
    await runWithConcurrency(
      [...affectedClusterIds].map((clusterId) => async () => {
        const result = await recomputeCluster(clusterId, trackedAiProvider);
        recomputeResults.push(result);
      }),
      Math.max(1, Math.min(3, sourceConcurrency)),
    );

    for (const result of recomputeResults) {
      timelineCounters.clusterFinalize.recomputed += 1;

      if (result.updated) {
        timelineCounters.clusterFinalize.updated += 1;
      }

      if (result.deleted) {
        timelineCounters.clusterFinalize.deleted += 1;
      }

      if (result.summaryAttempted) {
        if (result.summarySucceeded) {
          timelineCounters.clusterFinalize.summarySucceeded += 1;
        } else {
          timelineCounters.clusterFinalize.summaryFailed += 1;
        }
      }
    }
  } finally {
    stageTracker.finishStage(clusterFinalizeStage);
  }

  const status: FetchRunStatus =
    errors.length > 0 || failureCount > 0
      ? successCount > 0
        ? "partial"
        : "failed"
      : "succeeded";

  const completedRun = await completeFetchRun(run.id, {
    status,
    finishedAt: new Date(),
    sourceCount: sources.length,
    itemCount: preparedItems.length,
    successCount,
    failureCount,
    itemsAdded,
    errorSummary: errors.length > 0 ? errors.join(" | ") : null,
  });

  await options.onProgress?.({
    status: completedRun.status,
    sourceCount: completedRun.sourceCount,
    itemCount: completedRun.itemCount,
    successCount: completedRun.successCount,
    failureCount: completedRun.failureCount,
    itemsAdded: completedRun.itemsAdded,
    fullTextFetchedCount,
    aiCallCountActual: aiUsage.snapshot().actual,
    aiCallCountEstimated: aiUsage.snapshot().estimated,
    aiCallBreakdown: aiUsage.snapshot().breakdown,
    errorSummary: completedRun.errorSummary,
    stageTimings: stageTracker.snapshot(),
    taskTimeline: buildIngestionTaskTimeline({
      counters: timelineCounters,
      stages: taskStages,
      modelNames: taskTimelineModelNames,
    }),
  });

  return completedRun;
}

async function runExistingFetchRun(run: FetchRun, options: ResolvedRunOptions) {
  try {
    const completedRun = await executeIngestion(run, options);
    invalidateFeedCache();
    return completedRun;
  } catch (error) {
    if (error instanceof TaskRunCancellationError) {
      const cancelledRun = await completeFetchRun(run.id, {
        status: "failed",
        finishedAt: new Date(),
        sourceCount: error.snapshot.sourceCount,
        itemCount: error.snapshot.itemCount,
        successCount: error.snapshot.successCount,
        failureCount: error.snapshot.failureCount,
        itemsAdded: error.snapshot.itemsAdded,
        errorSummary: TASK_RUN_CANCELLED_MESSAGE,
      });

      await options.onProgress?.({
        status: cancelledRun.status,
        sourceCount: cancelledRun.sourceCount,
        itemCount: cancelledRun.itemCount,
        successCount: cancelledRun.successCount,
        failureCount: cancelledRun.failureCount,
        itemsAdded: cancelledRun.itemsAdded,
        fullTextFetchedCount: error.snapshot.fullTextFetchedCount,
        errorSummary: cancelledRun.errorSummary,
        stageTimings: error.snapshot.stageTimings,
        taskTimeline: error.snapshot.taskTimeline,
      });

      invalidateFeedCache();
      return cancelledRun;
    }

    const failedRun = await completeFetchRun(run.id, {
      status: "failed",
      finishedAt: new Date(),
      sourceCount: 0,
      itemCount: 0,
      successCount: 0,
      failureCount: 1,
      itemsAdded: 0,
      errorSummary: error instanceof Error ? error.message : "Unknown ingestion error",
    });

    await options.onProgress?.({
      status: failedRun.status,
      sourceCount: failedRun.sourceCount,
      itemCount: failedRun.itemCount,
      successCount: failedRun.successCount,
      failureCount: failedRun.failureCount,
      itemsAdded: failedRun.itemsAdded,
      fullTextFetchedCount: 0,
      errorSummary: failedRun.errorSummary,
      taskTimeline: [],
    });

    invalidateFeedCache();
    return failedRun;
  }
}

export async function runIngestion(options?: Partial<RunIngestionOptions>) {
  const resolvedOptions = await resolveRunOptions(options);
  const run = await createFetchRun(resolvedOptions.trigger, resolvedOptions.now);

  return runExistingFetchRun(run, resolvedOptions);
}

export async function startIngestionTask(input?: { triggerType?: "scheduled" | "manual" }) {
  const activeTaskCount = await prisma.backgroundTaskRun.count({
    where: {
      kind: "ingestion",
      status: {
        in: ["queued", "running"],
      },
    },
  });

  if (activeTaskCount > 0) {
    throw new Error("An ingestion run is already in progress.");
  }

  return enqueueTaskRun({
    kind: "ingestion",
    triggerType: input?.triggerType ?? "manual",
    label: DEFAULT_INGESTION_TASK_LABEL,
  });
}

function buildTaskProgressLabel(snapshot: {
  sourceCount: number;
  successCount: number;
  failureCount: number;
  itemCount: number;
  fullTextFetchedCount?: number;
}) {
  const fullTextFetchedLabel = `，正文补抓 ${snapshot.fullTextFetchedCount ?? 0} 篇`;

  if (snapshot.sourceCount === 0) {
    return "正在同步信息源列表";
  }

  if (snapshot.itemCount === 0) {
    return `已同步 ${snapshot.sourceCount} 个源，暂无可处理内容，失败 ${snapshot.failureCount} 项${fullTextFetchedLabel}`;
  }

  return `已处理 ${snapshot.successCount + snapshot.failureCount}/${snapshot.itemCount} 条内容，来自 ${snapshot.sourceCount} 个源，失败 ${snapshot.failureCount} 项${fullTextFetchedLabel}`;
}

export async function runIngestionTask(taskRun: BackgroundTaskRun, options?: Partial<RunIngestionOptions>) {
  const triggerType = taskRun.triggerType === "scheduled" ? "scheduled" : "manual";
  const resolvedOptions = await resolveRunOptions({
    ...options,
    trigger: triggerType,
  });
  const run = await createFetchRun(triggerType, resolvedOptions.now, taskRun.id);
  let latestAiCallCountActual = 0;
  let latestAiCallCountEstimated = 0;
  let latestAiCallBreakdown: TaskAiCallBreakdownSnapshot[] = [];
  let latestStageTimings: TaskStageTimingSnapshot[] = [];
  let latestTaskTimeline: TaskTimelineNodeSnapshot[] = createInitialIngestionTaskTimeline();
  let latestFullTextFetchedCount = 0;

  await updateTaskRun(taskRun.id, {
    status: "running",
    startedAt: run.startedAt,
    progressLabel: "正在同步信息源列表",
    fullTextFetchedCount: 0,
    aiCallCountActual: 0,
    aiCallCountEstimated: 0,
    aiCallBreakdown: [],
    taskTimeline: latestTaskTimeline,
  });

  const completedRun = await runExistingFetchRun(run, {
    ...resolvedOptions,
    onProgress: async (snapshot) => {
      latestAiCallCountActual = snapshot.aiCallCountActual ?? latestAiCallCountActual;
      latestAiCallCountEstimated = snapshot.aiCallCountEstimated ?? latestAiCallCountEstimated;
      latestAiCallBreakdown = snapshot.aiCallBreakdown ?? latestAiCallBreakdown;
      latestStageTimings = snapshot.stageTimings ?? latestStageTimings;
      latestTaskTimeline = snapshot.taskTimeline ?? latestTaskTimeline;
      latestFullTextFetchedCount = snapshot.fullTextFetchedCount;
      await updateTaskRun(taskRun.id, {
        status: snapshot.status,
        progressCurrent: snapshot.successCount + snapshot.failureCount,
        progressTotal: snapshot.itemCount,
        progressLabel: buildTaskProgressLabel(snapshot),
        itemsAdded: snapshot.itemsAdded,
        fullTextFetchedCount: snapshot.fullTextFetchedCount,
        aiCallCountActual: latestAiCallCountActual,
        aiCallCountEstimated: latestAiCallCountEstimated,
        aiCallBreakdown: latestAiCallBreakdown,
        errorSummary: snapshot.errorSummary ?? null,
        stageTimings: snapshot.stageTimings ?? [],
        taskTimeline: snapshot.taskTimeline ?? latestTaskTimeline,
        finishedAt:
          snapshot.status === "running"
            ? null
            : new Date(),
      });
    },
  });

  await updateTaskRun(taskRun.id, {
    status: completedRun.errorSummary === TASK_RUN_CANCELLED_MESSAGE ? "cancelled" : completedRun.status,
    progressCurrent: completedRun.successCount + completedRun.failureCount,
    progressTotal: completedRun.itemCount,
    progressLabel:
      completedRun.errorSummary === TASK_RUN_CANCELLED_MESSAGE
        ? TASK_RUN_CANCELLED_LABEL
        : buildTaskProgressLabel({
            ...completedRun,
            fullTextFetchedCount: latestFullTextFetchedCount,
          }),
    itemsAdded: completedRun.itemsAdded,
    fullTextFetchedCount: latestFullTextFetchedCount,
    aiCallCountActual: latestAiCallCountActual,
    aiCallCountEstimated: latestAiCallCountEstimated,
    aiCallBreakdown: latestAiCallBreakdown,
    errorSummary: completedRun.errorSummary ?? null,
    stageTimings: latestStageTimings,
    taskTimeline: latestTaskTimeline,
    finishedAt: completedRun.finishedAt,
  });

  return completedRun;
}
