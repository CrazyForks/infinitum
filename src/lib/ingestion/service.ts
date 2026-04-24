import crypto from "node:crypto";

import type { BackgroundTaskRun, FetchRun, FetchRunStatus, Item, Source } from "@prisma/client";

import { INGESTION_PROGRESS_FLUSH_INTERVAL_MS } from "@/config/constants";
import type { RuntimeConfig } from "@/config/runtime";
import { createAiProvider } from "@/lib/ai/provider";
import {
  recomputeCluster,
  type ClusterRecomputeResult,
} from "@/lib/clusters/service";
import { createClusterAssignmentCoordinator } from "@/lib/clusters/helpers";
import { prisma } from "@/lib/db";
import {
  completeFetchRun,
  createFetchRun,
  findExistingItemsForDedupeKeys,
  syncSources,
  updateSourceFetchMetadata,
  updateFetchRunProgress,
} from "@/lib/feed/repository";
import { invalidateFeedCache } from "@/lib/feed/cache";
import { fetchArticleContent } from "@/lib/ingestion/article";
import {
  deriveSourceConcurrency,
  buildPreparedFeedItemLookup,
  estimatePreparedItemAiWork,
  type PreparedFeedItem,
  type PreparedFeedItemLookup,
  processFeedItem,
} from "@/lib/ingestion/item-processor";
import { createRssParser } from "@/lib/ingestion/parser";
import {
  buildIngestionTaskTimeline,
  createIngestionStageTracker,
  createIngestionTimelineCounters,
  createIngestionTimelineModelNames,
  createInitialIngestionTaskTimeline,
  type IngestionTimelineModelNames,
  type IngestionTaskStageState,
} from "@/lib/ingestion/task-timeline";
import type {
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
} from "@/lib/tasks/types";
import {
  enqueueTaskRun,
  isTaskRunCancellationRequested,
  TASK_RUN_CANCELLED_LABEL,
  TASK_RUN_CANCELLED_MESSAGE,
  updateTaskRun,
} from "@/lib/tasks/service";
import { createTaskAiUsageTracker } from "@/lib/tasks/ai-usage";

type ResolvedRunOptions = RunIngestionOptions & {
  now: Date;
  taskTimelineModelNames: IngestionTimelineModelNames;
};

// 摄入进度刷新间隔常量已移至 @/config/constants

type RuntimePromptConfigs = NonNullable<RuntimeConfig["selectedPromptConfigs"]>;
type RuntimePromptConfig =
  | RuntimePromptConfigs["itemSummary"]
  | RuntimePromptConfigs["itemAnalysis"]
  | RuntimePromptConfigs["clusterSummary"]
  | RuntimePromptConfigs["clusterMatch"];

type SourceFetchMetadataUpdate = {
  feedEtag?: string | null;
  feedLastModified?: string | null;
  feedContentHash?: string | null;
  lastFetchedAt: Date;
};

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

function resolvePromptModelName(
  promptConfig: RuntimePromptConfig | undefined,
  defaultModelName: string | null,
): string | null {
  return promptConfig?.modelApi?.model ?? defaultModelName;
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
    processingStartAt:
      options?.processingStartAt ?? runtimeConfig?.ingestion.processingStartAt ?? null,
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

function buildFeedRequestHeaders(source: Source): Record<string, string> {
  return {
    ...(source.feedEtag ? { "If-None-Match": source.feedEtag } : {}),
    ...(source.feedLastModified ? { "If-Modified-Since": source.feedLastModified } : {}),
  };
}

function buildFeedContentHash(items: Array<{ title?: string | null; link?: string | null; isoDate?: string | null; pubDate?: string | null; content?: string | null; "content:encoded"?: string | null; contentSnippet?: string | null }>) {
  const payload = items.map((item) => ({
    title: item.title?.trim() ?? null,
    link: item.link?.trim() ?? null,
    isoDate: item.isoDate ?? null,
    pubDate: item.pubDate ?? null,
    content: item.content ?? null,
    contentEncoded: item["content:encoded"] ?? null,
    contentSnippet: item.contentSnippet ?? null,
  }));

  return crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

async function updateSourceMetadataIfChanged(sourceId: string, data: SourceFetchMetadataUpdate) {
  await updateSourceFetchMetadata(sourceId, data);
}

function getExistingItemForLookup(
  lookup: PreparedFeedItemLookup | null,
  existingByUrlHash: Map<string, Item>,
  existingByDedupeSignature: Map<string, Item>,
) {
  if (!lookup) {
    return null;
  }

  return existingByUrlHash.get(lookup.dedupeKeys.urlHash) ?? existingByDedupeSignature.get(lookup.dedupeKeys.signature) ?? null;
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
    processingStartAt,
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
  const sourceMetadataCommitCandidates = new Map<string, SourceFetchMetadataUpdate>();
  const sourceProcessingFailures = new Map<string, number>();
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
          const feed = await parser.parseURL(source.rssUrl, {
            headers: buildFeedRequestHeaders(source),
          });

          if (feed.notModified) {
            await updateSourceMetadataIfChanged(source.id, {
              feedEtag: feed.etag ?? source.feedEtag,
              feedLastModified: feed.lastModified ?? source.feedLastModified,
              lastFetchedAt: now,
            });
            return;
          }

          const items = (feed.items ?? []).slice(0, perSourceItemLimit);
          const feedContentHash = buildFeedContentHash(items);

          if (source.feedContentHash && source.feedContentHash === feedContentHash) {
            await updateSourceMetadataIfChanged(source.id, {
              feedEtag: feed.etag ?? source.feedEtag,
              feedLastModified: feed.lastModified ?? source.feedLastModified,
              feedContentHash,
              lastFetchedAt: now,
            });
            return;
          }

          sourceMetadataCommitCandidates.set(source.id, {
            feedEtag: feed.etag ?? source.feedEtag,
            feedLastModified: feed.lastModified ?? source.feedLastModified,
            feedContentHash,
            lastFetchedAt: now,
          });

          for (const item of items) {
            preparedItems.push({
              item,
              sourceId: source.id,
              sourceName: source.name,
              aiParsingEnabled: source.aiParsingEnabled,
              aggregationEnabled: source.aggregationEnabled,
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

  const preparedLookups = preparedItems
    .map((preparedItem) => ({
      preparedItem,
      lookup: buildPreparedFeedItemLookup(preparedItem, now),
    }))
    .filter((entry) => !entry.lookup || !processingStartAt || entry.lookup.publishedAt >= processingStartAt);
  const existingItems = await findExistingItemsForDedupeKeys(
    preparedLookups
      .map((entry) => entry.lookup)
      .filter((lookup): lookup is PreparedFeedItemLookup => Boolean(lookup))
      .map((lookup) => ({
        urlHash: lookup.dedupeKeys.urlHash,
        dedupeSignature: lookup.dedupeKeys.signature,
      })),
  );
  const existingByUrlHash = new Map(existingItems.map((item) => [item.urlHash, item]));
  const existingByDedupeSignature = new Map(existingItems.map((item) => [item.dedupeSignature, item]));
  const estimatedAiWork = preparedLookups.reduce(
    (total, entry) => {
      const existing = getExistingItemForLookup(entry.lookup, existingByUrlHash, existingByDedupeSignature);
      const estimate = estimatePreparedItemAiWork(entry.preparedItem, entry.lookup, existing, blacklist);
      return {
        summaries: total.summaries + (estimate.summary ? 1 : 0),
        analyses: total.analyses + (estimate.analysis ? 1 : 0),
      };
    },
    { summaries: 0, analyses: 0 },
  );
  aiUsage.setEstimated(estimatedAiWork.summaries, "item_summary");
  aiUsage.setEstimated(estimatedAiWork.analyses, "item_analysis");

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
        timelineCounters.ruleFilter.ruleFiltered += 1;
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
      preparedLookups.map(({ preparedItem, lookup }) => async () => {
        try {
          const existingItem = getExistingItemForLookup(lookup, existingByUrlHash, existingByDedupeSignature);
          const result = await processFeedItem({
            ...preparedItem,
            lookup,
            existingItem,
            blacklist,
            articleFetcher,
            aiProvider: trackedAiProvider,
            clusterAssignmentCoordinator,
            fullTextFetchThreshold,
            now,
          });

          if (result?.status === "failed") {
            sourceProcessingFailures.set(
              preparedItem.sourceId,
              (sourceProcessingFailures.get(preparedItem.sourceId) ?? 0) + 1,
            );
          }

          if (result?.metrics?.summaryFailed || result?.metrics?.analysisFailed) {
            sourceProcessingFailures.set(
              preparedItem.sourceId,
              (sourceProcessingFailures.get(preparedItem.sourceId) ?? 0) + 1,
            );
          }

          await enqueueProgressUpdate(result);
        } catch (error) {
          sourceProcessingFailures.set(
            preparedItem.sourceId,
            (sourceProcessingFailures.get(preparedItem.sourceId) ?? 0) + 1,
          );
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

  await Promise.all(
    [...sourceMetadataCommitCandidates.entries()]
      .filter(([sourceId]) => (sourceProcessingFailures.get(sourceId) ?? 0) === 0)
      .map(([sourceId, metadata]) => updateSourceMetadataIfChanged(sourceId, metadata)),
  );

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
