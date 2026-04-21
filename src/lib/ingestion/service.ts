import type { BackgroundTaskRun, FetchRun, FetchRunStatus } from "@prisma/client";

import { createAiProvider, type AiEventSignature } from "@/lib/ai/provider";
import { assignItemToCluster, createClusterAssignmentCoordinator, recomputeCluster } from "@/lib/clusters/service";
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
  fetchFullTextWhenMissing: boolean;
};

type ResolvedRunOptions = RunIngestionOptions & {
  now: Date;
};

const INGESTION_PROGRESS_FLUSH_INTERVAL_MS = 750;
type IngestionStageTiming = {
  key: string;
  label: string;
  startedAt: Date | null;
  finishedAt: Date | null;
  durationMs: number | null;
};

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
    now,
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
  fetchFullTextWhenMissing,
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
  fetchFullTextWhenMissing: boolean;
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
  let filterReason: string | null = existing?.filterReason ?? null;
  let moderationStatus = existing?.moderationStatus ?? "allowed";
  let moderationReason = existing?.moderationReason ?? null;
  let moderationDetail = existing?.moderationDetail ?? null;
  let qualityScore = existing?.qualityScore ?? 50;
  let qualityRationale = existing?.qualityRationale ?? "AI analysis unavailable";
  let eventSignature: AiEventSignature | null = readStoredEventSignature(existing);
  let fullTextFetched = false;
  const issues: string[] = [];
  const contentForFullTextDecision = fullText || rssContent || rssExcerpt || "";
  const canReuseExistingAnalysis = Boolean(
    existing &&
      !analysisInputsChanged &&
      existing.aiProcessedAt &&
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
        aiProcessedAt: new Date(),
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

    return { id: stored.id, status: stored.status, isNew, fullTextFetched };
  }

  if (!fullText && shouldFetchFullText(contentForFullTextDecision, fetchFullTextWhenMissing, fullTextFetchThreshold)) {
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
    filterReason = filterMatch;
    moderationStatus = "filtered";
    moderationReason = "rule_blacklist";
    moderationDetail = `Matched blacklist keyword: ${filterMatch}`;
  } else {
    const translateTitle = shouldTranslateTitle(originalTitle);
    const enrichmentInput = fullText || rssContent || rssExcerpt || originalTitle;

    try {
      const enrichment = await aiProvider.enrichContent(enrichmentInput, {
        title: originalTitle,
        sourceName,
        translateTitle,
      });

      if (translateTitle) {
        translatedTitle = enrichment.translatedTitle?.trim() || originalTitle;
      }

      summaryText = stripHtmlTags(enrichment.summary) || summaryText;
      moderationStatus = enrichment.moderationStatus === "restored" ? "allowed" : enrichment.moderationStatus;
      moderationReason = enrichment.moderationReason;
      moderationDetail = enrichment.moderationDetail;
      qualityScore = enrichment.qualityScore;
      qualityRationale = enrichment.qualityRationale;
      eventSignature = enrichment.eventSignature;
    } catch (error) {
      appendIssue(issues, error, "Unknown ai enrichment error");
      moderationStatus = "allowed";
      moderationReason = null;
      moderationDetail = null;
      qualityScore = 50;
      qualityRationale = "AI analysis unavailable";
      eventSignature = null;
    }

    if (!summaryText) {
      summaryText = buildFallbackSummary(rssExcerpt, fullText || rssContent);
    }

    status = moderationStatus === "filtered" ? "filtered" : "processed";
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
      aiProcessedAt: new Date(),
      clusterId: moderationStatus === "filtered" ? null : existing?.clusterId ?? null,
      errorMessage: issues.length > 0 ? issues.join(" | ") : null,
    },
  );

  // Track cluster changes
  let affectedClusterId: string | null = null;

  if (moderationStatus === "filtered") {
    if (existing?.clusterId) {
      affectedClusterId = existing.clusterId;
    }
  } else {
    const clusterId = await assignItemToCluster(stored.id, {
      eventSignature,
      aiProvider,
      coordinator: clusterAssignmentCoordinator,
    });
    if (clusterId && (isNew || existing?.clusterId !== clusterId)) {
      affectedClusterId = clusterId;
    }
  }

  return { id: stored.id, status: stored.status, isNew, affectedClusterId, fullTextFetched };
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
    now,
  } = options;
  const stageTracker = createIngestionStageTracker();
  let sources: Awaited<ReturnType<typeof syncSources>> = [];
  const aiUsage = createTaskAiUsageTracker();
  const trackedAiProvider = aiUsage.wrapProvider(aiProvider);
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

  try {
    sources = await syncSources(sourceConfigs);
    await runWithConcurrency(
      sources.map((source) => async () => {
        await throwIfCancellationRequested();

        try {
          const feed = await parser.parseURL(source.rssUrl);

          for (const item of feed.items ?? []) {
            preparedItems.push({
              item,
              sourceId: source.id,
              sourceName: source.name,
              fetchFullTextWhenMissing: source.fetchFullTextWhenMissing,
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
  }

  aiUsage.setEstimated(preparedItems.filter((preparedItem) => willRequireAiAnalysis(preparedItem, blacklist)).length);

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
  await emitTaskProgress("running");
  try {
    // Recompute only affected clusters instead of all clusters
    await runWithConcurrency(
      [...affectedClusterIds].map((clusterId) => async () => {
        await recomputeCluster(clusterId, trackedAiProvider);
      }),
      Math.max(1, Math.min(3, sourceConcurrency)),
    );
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
  let latestFullTextFetchedCount = 0;

  await updateTaskRun(taskRun.id, {
    status: "running",
    startedAt: run.startedAt,
    progressLabel: "正在同步信息源列表",
    fullTextFetchedCount: 0,
    aiCallCountActual: 0,
    aiCallCountEstimated: 0,
    aiCallBreakdown: [],
  });

  const completedRun = await runExistingFetchRun(run, {
    ...resolvedOptions,
    onProgress: async (snapshot) => {
      latestAiCallCountActual = snapshot.aiCallCountActual ?? latestAiCallCountActual;
      latestAiCallCountEstimated = snapshot.aiCallCountEstimated ?? latestAiCallCountEstimated;
      latestAiCallBreakdown = snapshot.aiCallBreakdown ?? latestAiCallBreakdown;
      latestStageTimings = snapshot.stageTimings ?? latestStageTimings;
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
    finishedAt: completedRun.finishedAt,
  });

  return completedRun;
}
