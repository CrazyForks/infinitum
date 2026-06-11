import type { BackgroundTaskRun, Item } from "@prisma/client";

import {
  AGGREGATION_PARSE_STATUS,
  RETRIABLE_AGGREGATION_PARSE_STATUSES,
} from "@/lib/aggregation/status";
import { createAiProvider, type AiEventSignature, type AiProvider, type ParsedAggregation } from "@/lib/ai/provider";
import { retryChineseSummary } from "@/lib/ai/summary-language";
import { invalidateDailyReportCache } from "@/lib/daily-report/cache";
import {
  assignItemToCluster,
  persistParsedAggregationForItem,
  recomputeCluster,
} from "@/lib/clusters/service";
import { prisma } from "@/lib/db";
import { invalidateFeedCache } from "@/lib/feed/cache";
import { shouldTranslateTitle, stripHtmlTags } from "@/lib/feed/presentation";
import { normalizeStoredEventType } from "@/lib/clusters/normalization";
import { getIngestionRuntimeConfig } from "@/lib/settings/service";
import { createTaskAiUsageTracker } from "@/lib/tasks/ai-usage";
import {
  enqueueTaskRun,
  ensureDefaultItemCleanupSchedule,
  isTaskRunCancellationRequested,
  TASK_RUN_CANCELLED_LABEL,
  TASK_RUN_CANCELLED_MESSAGE,
  updateTaskRun,
} from "@/lib/tasks/service";

type RegenerationTarget = "translation" | "summary";

type RegenerationOptions = {
  aiProvider?: AiProvider;
};

type ClusterReassignmentResult = {
  clusterId: string | null;
  clusterTitle: string | null;
  matchedExistingCluster: boolean;
  createdNewCluster: boolean;
  skippedIncompleteSignature: boolean;
};

function getItemSourceText(item: Item): string {
  return item.fullText || item.rssContent || item.rssExcerpt || item.originalTitle;
}

function normalizeSummary(summary: string | null | undefined): string | null {
  return stripHtmlTags(summary) || null;
}

async function resolveItemSummary(
  aiProvider: AiProvider,
  item: Item & { source: { name: string } },
  options?: {
    reuseExisting?: boolean;
  },
): Promise<string | null> {
  const existingSummary = options?.reuseExisting ? normalizeSummary(item.summaryText) : null;

  if (existingSummary) {
    return existingSummary;
  }

  const inputText = getItemSourceText(item);

  return normalizeSummary(
    await retryChineseSummary(
      async (metadata) => {
        const result = await aiProvider.summarizeItem(inputText, metadata);
        return result.summary;
      },
      {
        title: item.originalTitle,
        sourceName: item.source.name,
      },
    ),
  );
}

function serializeEventSignature(eventSignature?: {
  eventType?: string | null;
  eventSubject?: string | null;
  eventAction?: string | null;
  eventObject?: string | null;
  eventDate?: string | null;
} | null) {
  return {
    eventType: eventSignature?.eventType ?? null,
    eventSubject: eventSignature?.eventSubject ?? null,
    eventAction: eventSignature?.eventAction ?? null,
    eventObject: eventSignature?.eventObject ?? null,
    eventDate: eventSignature?.eventDate ?? null,
  };
}

async function resolveAiProvider(aiProvider?: AiProvider) {
  if (aiProvider) {
    return aiProvider;
  }

  const runtimeConfig = await getIngestionRuntimeConfig();
  return createAiProvider(runtimeConfig.modelApi, {
    itemSummary: runtimeConfig.selectedPromptConfigs?.itemSummary,
    itemAnalysis: runtimeConfig.selectedPromptConfigs?.itemAnalysis,
    itemAggregation: runtimeConfig.selectedPromptConfigs?.itemAggregation,
    clusterSummary: runtimeConfig.selectedPromptConfigs?.clusterSummary,
    clusterMatch: runtimeConfig.selectedPromptConfigs?.clusterMatch,
  });
}

export async function enqueueItemRegenerationTask(itemId: string, target: RegenerationTarget) {
  return enqueueTaskRun({
    kind: target === "translation" ? "item_regenerate_translation" : "item_regenerate_summary",
    triggerType: "admin_action",
    label: target === "translation" ? "重生成翻译标题" : "重生成摘要",
    entityId: itemId,
  });
}

export async function enqueueItemReanalyzeTask(itemId: string) {
  return enqueueTaskRun({
    kind: "item_reanalyze",
    triggerType: "admin_action",
    label: "重新 AI 判定",
    entityId: itemId,
  });
}

export async function regenerateItemContent(
  itemId: string,
  target: RegenerationTarget,
  options?: RegenerationOptions,
): Promise<Item & { source: { name: string }; clusterReassignment?: ClusterReassignmentResult }> {
  const item = await prisma.item.findUnique({
    where: { id: itemId },
    include: { source: true },
  });

  if (!item || item.status !== "processed") {
    throw new Error("Item not found");
  }

  const aiProvider = await resolveAiProvider(options?.aiProvider);
  const previousClusterId = item.clusterId;
  let clusterReassignment: ClusterReassignmentResult | undefined;

  try {
    if (target === "translation") {
      const summaryInput = (await resolveItemSummary(aiProvider, item, { reuseExisting: true })) || item.originalTitle;
      const enrichment = await aiProvider.enrichContent(summaryInput, {
        title: item.originalTitle,
        sourceName: item.source.name,
        translateTitle: shouldTranslateTitle(item.originalTitle),
      });

      await prisma.item.update({
        where: { id: item.id },
        data: {
          translatedTitle:
            shouldTranslateTitle(item.originalTitle) ? enrichment.translatedTitle?.trim() || item.originalTitle : item.translatedTitle,
          analysisStatus: "succeeded",
          aiProcessedAt: new Date(),
          errorMessage: null,
        },
      });
    } else {
      const summaryText = await resolveItemSummary(aiProvider, item);

      await prisma.item.update({
        where: { id: item.id },
        data: {
          summaryText: summaryText || item.summaryText,
          summaryStatus: "succeeded",
          analysisStatus: "pending",
          aiProcessedAt: null,
          errorMessage: null,
        },
      });
    }

    if (previousClusterId) {
      await prisma.item.update({
        where: { id: item.id },
        data: {
          clusterId: null,
          manualClusterAssignedAt: null,
        },
      });
    }

    const assignment = await assignItemToCluster(item.id, {
      aiProvider,
    });
    const assignedCluster = assignment.clusterId
      ? await prisma.contentCluster.findUnique({
          where: { id: assignment.clusterId },
          select: { title: true },
        })
      : null;

    clusterReassignment = {
      clusterId: assignment.clusterId,
      clusterTitle: assignedCluster?.title ?? null,
      matchedExistingCluster: Boolean(assignment.clusterId && !assignment.createdNewCluster),
      createdNewCluster: assignment.createdNewCluster,
      skippedIncompleteSignature: assignment.skippedIncompleteSignature,
    };

    if (assignment.clusterId) {
      await recomputeCluster(assignment.clusterId, aiProvider);
    }

    if (previousClusterId && previousClusterId !== assignment.clusterId) {
      await recomputeCluster(previousClusterId, aiProvider);
    }

    invalidateFeedCache();
  } catch (error) {
    await prisma.item.update({
      where: { id: item.id },
      data: {
        ...(target === "summary"
          ? {
              summaryStatus: "failed" as const,
              analysisStatus: "pending" as const,
              aiProcessedAt: null,
            }
          : {}),
        errorMessage: error instanceof Error ? error.message : "Unknown regeneration error",
      },
    });
  }

  const regenerated = await prisma.item.findUniqueOrThrow({
    where: { id: item.id },
    include: { source: true },
  });

  return {
    ...regenerated,
    clusterReassignment,
  };
}

export async function executeItemRegenerationTask(
  taskRun: { id: string; entityId: string | null },
  target: RegenerationTarget,
  options?: RegenerationOptions,
) {
  if (!taskRun.entityId) {
    throw new Error("Task entityId is required.");
  }

  const aiUsage = createTaskAiUsageTracker(target === "translation" ? 1 : 1, target === "translation" ? "item_analysis" : "item_summary");
  const trackedAiProvider = aiUsage.wrapProvider(await resolveAiProvider(options?.aiProvider), {
    summarizeItemEstimated: target === "translation",
  });
  const initialAiUsage = aiUsage.snapshot();

  await updateTaskRun(taskRun.id, {
    status: "running",
    progressLabel: "正在读取条目",
    aiCallCountActual: 0,
    aiCallCountEstimated: initialAiUsage.estimated,
    aiCallBreakdown: initialAiUsage.breakdown,
  });

  const item = await regenerateItemContent(taskRun.entityId, target, {
    ...options,
    aiProvider: trackedAiProvider,
  });
  const succeeded = !item.errorMessage;
  const clusterReassignment = item.clusterReassignment;
  const successProgressLabel =
    clusterReassignment
      ? clusterReassignment.matchedExistingCluster && clusterReassignment.clusterTitle
        ? `已完成条目更新，聚合匹配成功：${clusterReassignment.clusterTitle}`
        : clusterReassignment.createdNewCluster && clusterReassignment.clusterTitle
          ? `已完成条目更新，未匹配已有聚合，已新建聚合：${clusterReassignment.clusterTitle}`
          : clusterReassignment.skippedIncompleteSignature
            ? "已完成条目更新，聚合匹配未命中：事件签名不完整"
            : "已完成条目更新，聚合匹配未命中"
      : "已完成条目更新";

  await updateTaskRun(taskRun.id, {
    status: succeeded ? "succeeded" : "failed",
    progressCurrent: 1,
    progressTotal: 1,
    progressLabel: succeeded ? successProgressLabel : "条目更新失败",
    aiCallCountActual: aiUsage.snapshot().actual,
    aiCallCountEstimated: aiUsage.snapshot().estimated,
    aiCallBreakdown: aiUsage.snapshot().breakdown,
    finishedAt: new Date(),
    errorSummary: item.errorMessage ?? null,
  });

  return item;
}

export async function restoreFilteredItem(itemId: string, options?: RegenerationOptions) {
  const item = await prisma.item.findUnique({
    where: { id: itemId },
    include: { source: true },
  });

  if (!item) {
    throw new Error("Item not found");
  }

  const restored = await prisma.item.update({
    where: { id: item.id },
    data: {
      moderationStatus: "restored",
      restoredByAdminAt: new Date(),
      status: "processed",
    },
    include: { source: true },
  });

  await assignItemToCluster(restored.id, {
    eventSignature: null,
    aiProvider: options?.aiProvider,
  });
  invalidateFeedCache();

  return prisma.item.findUniqueOrThrow({
    where: { id: restored.id },
    include: { source: true },
  });
}

export async function manuallyFilterItem(itemId: string, options?: RegenerationOptions) {
  const item = await prisma.item.findUnique({
    where: { id: itemId },
    include: { source: true },
  });

  if (!item) {
    throw new Error("Item not found");
  }

  const previousClusterId = item.clusterId;
  const filtered = await prisma.item.update({
    where: { id: item.id },
    data: {
      moderationStatus: "filtered",
      moderationReason: "other",
      moderationDetail: "管理员手动过滤",
      status: "filtered",
      clusterId: null,
      manualClusterAssignedAt: null,
      restoredByAdminAt: null,
      errorMessage: null,
    },
    include: { source: true },
  });

  if (previousClusterId) {
    await recomputeCluster(previousClusterId, options?.aiProvider);
  }

  invalidateFeedCache();

  return prisma.item.findUniqueOrThrow({
    where: { id: filtered.id },
    include: { source: true },
  });
}

export async function deleteItem(itemId: string, options?: RegenerationOptions) {
  const item = await prisma.item.findUnique({
    where: { id: itemId },
    include: { source: true },
  });

  if (!item) {
    throw new Error("Item not found");
  }

  const previousClusterId = item.clusterId;

  await prisma.item.delete({
    where: { id: item.id },
  });

  if (previousClusterId) {
    await recomputeCluster(previousClusterId, options?.aiProvider);
  }

  invalidateFeedCache();

  return {
    id: item.id,
    previousClusterId,
  };
}

async function reanalyzeItem(itemId: string, options?: RegenerationOptions) {
  const item = await prisma.item.findUnique({
    where: { id: itemId },
    include: { source: true },
  });

  if (!item) {
    throw new Error("Item not found");
  }

  const aiProvider = await resolveAiProvider(options?.aiProvider);
  const summaryText = (await resolveItemSummary(aiProvider, item)) || item.originalTitle;
  const analysis = await aiProvider.enrichContent(summaryText, {
    title: item.originalTitle,
    sourceName: item.source.name,
    translateTitle: shouldTranslateTitle(item.originalTitle),
  });

  const previousClusterId = item.clusterId;
  const moderationStatus = analysis.moderationStatus === "restored" ? "allowed" : analysis.moderationStatus;
  const nextStatus = moderationStatus === "filtered" ? "filtered" : "processed";

  const updated = await prisma.item.update({
    where: { id: item.id },
    data: {
      translatedTitle:
        shouldTranslateTitle(item.originalTitle) ? analysis.translatedTitle?.trim() || item.originalTitle : item.translatedTitle,
      summaryText: summaryText || item.summaryText,
      summaryStatus: "succeeded",
      analysisStatus: "succeeded",
      moderationStatus,
      moderationReason: analysis.moderationReason,
      moderationDetail: analysis.moderationDetail,
      qualityScore: analysis.qualityScore,
      qualityRationale: analysis.qualityRationale,
      ...serializeEventSignature(analysis.eventSignature),
      aiProcessedAt: new Date(),
      status: nextStatus,
      clusterId: moderationStatus === "filtered" ? null : item.clusterId,
      manualClusterAssignedAt: moderationStatus === "filtered" ? null : item.manualClusterAssignedAt,
      errorMessage: null,
    },
    include: { source: true },
  });

  if (moderationStatus === "filtered") {
    if (previousClusterId) {
      await recomputeCluster(previousClusterId, aiProvider);
    }
  } else {
    await assignItemToCluster(updated.id, {
      eventSignature: analysis.eventSignature,
      aiProvider,
    });
  }

  if (previousClusterId && previousClusterId !== updated.clusterId) {
    await recomputeCluster(previousClusterId, aiProvider);
  }

  invalidateFeedCache();

  return prisma.item.findUniqueOrThrow({
    where: { id: updated.id },
    include: { source: true },
  });
}

export async function executeItemReanalyzeTask(
  taskRun: { id: string; entityId: string | null },
  options?: RegenerationOptions,
) {
  if (!taskRun.entityId) {
    throw new Error("Task entityId is required.");
  }

  const aiUsage = createTaskAiUsageTracker(1);
  aiUsage.addEstimated(1, "item_analysis");
  const trackedAiProvider = aiUsage.wrapProvider(await resolveAiProvider(options?.aiProvider), {
    summarizeItemEstimated: false,
  });
  const initialAiUsage = aiUsage.snapshot();

  await updateTaskRun(taskRun.id, {
    status: "running",
    progressLabel: "正在重新 AI 判定",
    aiCallCountActual: 0,
    aiCallCountEstimated: initialAiUsage.estimated,
    aiCallBreakdown: initialAiUsage.breakdown,
  });

  try {
    const item = await reanalyzeItem(taskRun.entityId, {
      ...options,
      aiProvider: trackedAiProvider,
    });

    await updateTaskRun(taskRun.id, {
      status: "succeeded",
      progressCurrent: 1,
      progressTotal: 1,
      progressLabel: "已完成重新 AI 判定",
      aiCallCountActual: aiUsage.snapshot().actual,
      aiCallCountEstimated: aiUsage.snapshot().estimated,
      aiCallBreakdown: aiUsage.snapshot().breakdown,
      finishedAt: new Date(),
      errorSummary: null,
    });

    return item;
  } catch (error) {
    await updateTaskRun(taskRun.id, {
      status: "failed",
      progressCurrent: 1,
      progressTotal: 1,
      progressLabel: "重新 AI 判定失败",
      aiCallCountActual: aiUsage.snapshot().actual,
      aiCallCountEstimated: aiUsage.snapshot().estimated,
      aiCallBreakdown: aiUsage.snapshot().breakdown,
      finishedAt: new Date(),
      errorSummary: error instanceof Error ? error.message : "Unknown item reanalyze error",
    });
    throw error;
  }
}

const CLEANUP_BATCH_SIZE = 5000;
const REPARSE_AGGREGATIONS_BATCH_SIZE = 200;
const REPARSE_AGGREGATIONS_MIN_TEXT_CHARS = 40;
const REPARSE_AGGREGATIONS_PROGRESS_UPDATE_INTERVAL = 10;

export async function executeItemCleanupTask(taskRun: BackgroundTaskRun) {
  const schedule = await ensureDefaultItemCleanupSchedule();
  const retentionDays = schedule.cleanupRetentionDays;
  const now = new Date();
  const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);

  // Cooperative cancellation check before starting
  if (await isTaskRunCancellationRequested(taskRun.id)) {
    await updateTaskRun(taskRun.id, {
      status: "cancelled",
      progressLabel: TASK_RUN_CANCELLED_LABEL,
      errorSummary: TASK_RUN_CANCELLED_MESSAGE,
      finishedAt: now,
    });
    return;
  }

  await updateTaskRun(taskRun.id, {
    status: "running",
    progressLabel: "正在查找过期文章...",
  });

  // Find affected cluster IDs before deleting
  const itemsToClean = await prisma.item.findMany({
    where: { createdAt: { lt: cutoff } },
    select: { clusterId: true },
  });
  const affectedClusterIds = [...new Set(itemsToClean.map((i) => i.clusterId).filter(Boolean))] as string[];

  // Estimate total count for progress tracking (snapshot before deletion)
  const estimatedTotal = itemsToClean.length;
  let totalDeleted = 0;

  // Batch delete old items to avoid long SQLite write locks.
  // Prisma's deleteMany doesn't support LIMIT, so we batch by IDs.
  while (true) {
    if (await isTaskRunCancellationRequested(taskRun.id)) {
      await updateTaskRun(taskRun.id, {
        status: "cancelled",
        progressCurrent: totalDeleted,
        progressTotal: estimatedTotal,
        progressLabel: TASK_RUN_CANCELLED_LABEL,
        errorSummary: TASK_RUN_CANCELLED_MESSAGE,
        finishedAt: new Date(),
      });
      invalidateFeedCache();
      return;
    }

    const batchIds = await prisma.item.findMany({
      where: { createdAt: { lt: cutoff } },
      select: { id: true },
      take: CLEANUP_BATCH_SIZE,
    });

    if (batchIds.length === 0) {
      break;
    }

    const deleted = await prisma.item.deleteMany({
      where: { id: { in: batchIds.map((i) => i.id) } },
    });

    totalDeleted += deleted.count;

    await updateTaskRun(taskRun.id, {
      progressCurrent: totalDeleted,
      progressTotal: estimatedTotal,
      progressLabel: `已清理 ${totalDeleted}/${estimatedTotal} 篇文章...`,
    });
  }

  // Recompute affected clusters (empty ones will be auto-deleted)
  for (const clusterId of affectedClusterIds) {
    if (await isTaskRunCancellationRequested(taskRun.id)) {
      await updateTaskRun(taskRun.id, {
        status: "cancelled",
        progressCurrent: totalDeleted,
        progressTotal: totalDeleted,
        progressLabel: TASK_RUN_CANCELLED_LABEL,
        errorSummary: TASK_RUN_CANCELLED_MESSAGE,
        finishedAt: new Date(),
      });
      return;
    }

    await recomputeCluster(clusterId);
  }

  invalidateFeedCache();

  await updateTaskRun(taskRun.id, {
    status: "succeeded",
    progressCurrent: totalDeleted,
    progressTotal: totalDeleted,
    progressLabel: `已清理 ${totalDeleted} 篇文章，涉及 ${affectedClusterIds.length} 个聚合`,
    finishedAt: new Date(),
  });
}


function serializeParsedEventSignature(input: {
  eventType?: string | null;
  eventSubject?: string | null;
  eventAction?: string | null;
  eventObject?: string | null;
  eventDate?: string | null;
} | null | undefined): AiEventSignature | null {
  if (!input) {
    return null;
  }
  return {
    eventType: normalizeStoredEventType(input.eventType ?? null),
    eventSubject: input.eventSubject ?? null,
    eventAction: input.eventAction ?? null,
    eventObject: input.eventObject ?? null,
    eventDate: input.eventDate ?? null,
  };
}

function isCompleteParsedAggregation(
  parsed: ParsedAggregation | null | undefined,
): parsed is ParsedAggregation & {
  events: Array<AiEventSignature & { oneLiner: string; qualityScore: number }>;
} {
  return Boolean(parsed && parsed.events && parsed.events.length > 0);
}

function getAggregationReparseSourceText(input: {
  fullText?: string | null;
  rssContent?: string | null;
  rssExcerpt?: string | null;
}) {
  return input.fullText?.trim() || input.rssContent?.trim() || input.rssExcerpt?.trim() || "";
}

function shouldWriteReparseProgress(processedCount: number, totalCandidates: number) {
  return processedCount === totalCandidates ||
    processedCount % REPARSE_AGGREGATIONS_PROGRESS_UPDATE_INTERVAL === 0;
}

/**
 * Backfill task that re-runs parseAggregation for items from sources that have
 * been opted into aggregation detection. Selects items where the source has
 * aggregationDetectionEnabled=true, the item has not been checked or is in a
 * retriable parse state, and useful source text is available.
 */
export async function executeItemReparseAggregationsTask(
  taskRun: { id: string; entityId?: string | null },
  options?: RegenerationOptions,
) {
  if (await isTaskRunCancellationRequested(taskRun.id)) {
    await updateTaskRun(taskRun.id, {
      status: "cancelled",
      progressLabel: TASK_RUN_CANCELLED_LABEL,
      errorSummary: TASK_RUN_CANCELLED_MESSAGE,
      finishedAt: new Date(),
    });
    return;
  }

  const candidates = await prisma.item.findMany({
    where: {
      status: "processed",
      OR: [
        {
          isAggregation: false,
          aggregationParseStatus: null,
        },
        {
          aggregationParseStatus: { in: RETRIABLE_AGGREGATION_PARSE_STATUSES },
        },
      ],
      AND: [
        {
          OR: [
            { fullText: { not: null } },
            { rssContent: { not: null } },
            { rssExcerpt: { not: null } },
          ],
        },
      ],
      source: { is: { aggregationDetectionEnabled: true, enabled: true } },
    },
    select: {
      id: true,
      originalTitle: true,
      clusterId: true,
      publishedAt: true,
      fullText: true,
      rssContent: true,
      rssExcerpt: true,
      source: { select: { name: true } },
    },
    orderBy: { publishedAt: "desc" },
    take: REPARSE_AGGREGATIONS_BATCH_SIZE,
  });

  const totalCandidates = candidates.length;
  if (totalCandidates === 0) {
    await updateTaskRun(taskRun.id, {
      status: "succeeded",
      progressCurrent: 0,
      progressTotal: 0,
      progressLabel: "无需重拆的聚合内容",
      finishedAt: new Date(),
    });
    return;
  }

  const aiProvider = await resolveAiProvider(options?.aiProvider);
  const aiUsage = createTaskAiUsageTracker(totalCandidates);
  aiUsage.addEstimated(totalCandidates, "item_aggregation");
  const trackedAiProvider = aiUsage.wrapProvider(aiProvider);
  const initialAiUsage = aiUsage.snapshot();

  await updateTaskRun(taskRun.id, {
    status: "running",
    progressCurrent: 0,
    progressTotal: totalCandidates,
    progressLabel: `开始重拆 ${totalCandidates} 条聚合内容`,
    aiCallCountActual: 0,
    aiCallCountEstimated: initialAiUsage.estimated,
    aiCallBreakdown: initialAiUsage.breakdown,
  });

  let processedCount = 0;
  let reparsedCount = 0;
  const affectedClusterIds = new Set<string>();
  const issues: string[] = [];

  for (const candidate of candidates) {
    if (await isTaskRunCancellationRequested(taskRun.id)) {
      await updateTaskRun(taskRun.id, {
        status: "cancelled",
        progressCurrent: processedCount,
        progressTotal: totalCandidates,
        progressLabel: TASK_RUN_CANCELLED_LABEL,
        errorSummary: TASK_RUN_CANCELLED_MESSAGE,
        finishedAt: new Date(),
      });
      return;
    }

    processedCount += 1;
    const inputText = getAggregationReparseSourceText(candidate);

    if (inputText.length < REPARSE_AGGREGATIONS_MIN_TEXT_CHARS) {
      await prisma.item.update({
        where: { id: candidate.id },
        data: {
          isAggregation: false,
          aggregationCheckedAt: new Date(),
          aggregationParseStatus: AGGREGATION_PARSE_STATUS.notAggregation,
        },
      });
      if (shouldWriteReparseProgress(processedCount, totalCandidates)) {
        await updateTaskRun(taskRun.id, {
          progressCurrent: processedCount,
          progressTotal: totalCandidates,
          progressLabel: `已扫描 ${processedCount}/${totalCandidates} 条，识别 ${reparsedCount} 条聚合`,
        });
      }
      continue;
    }

    try {
      const parsedAggregation = await trackedAiProvider.parseAggregation(inputText, {
        title: candidate.originalTitle,
        sourceName: candidate.source.name,
      });

      if (!isCompleteParsedAggregation(parsedAggregation)) {
        await prisma.item.update({
          where: { id: candidate.id },
          data: {
            isAggregation: false,
            aggregationCheckedAt: new Date(),
            aggregationParseStatus: AGGREGATION_PARSE_STATUS.notAggregation,
          },
        });
        if (shouldWriteReparseProgress(processedCount, totalCandidates)) {
          await updateTaskRun(taskRun.id, {
            progressCurrent: processedCount,
            progressTotal: totalCandidates,
            progressLabel: `已扫描 ${processedCount}/${totalCandidates} 条，识别 ${reparsedCount} 条聚合`,
          });
        }
        continue;
      }

      await persistParsedAggregationForItem(
        { id: candidate.id, publishedAt: candidate.publishedAt },
        {
          mainEvent: serializeParsedEventSignature(parsedAggregation.mainEvent),
          events: parsedAggregation.events.map((event) => ({
            eventType: event.eventType as AiEventSignature["eventType"],
            eventSubject: event.eventSubject,
            eventAction: event.eventAction,
            eventObject: event.eventObject,
            eventDate: event.eventDate,
            oneLiner: event.oneLiner,
            qualityScore: event.qualityScore,
          })),
        },
      );

      reparsedCount += 1;

      if (candidate.clusterId) {
        affectedClusterIds.add(candidate.clusterId);
      }

      const mainEvent = serializeParsedEventSignature(parsedAggregation.mainEvent);
      await prisma.item.update({
        where: { id: candidate.id },
        data: {
          isAggregation: true,
          aggregationCheckedAt: new Date(),
          aggregationParseStatus: AGGREGATION_PARSE_STATUS.parsed,
          eventType: mainEvent?.eventType ?? null,
          eventSubject: mainEvent?.eventSubject ?? null,
          eventAction: mainEvent?.eventAction ?? null,
          eventObject: mainEvent?.eventObject ?? null,
          eventDate: mainEvent?.eventDate ?? null,
          clusterId: null,
          manualClusterAssignedAt: null,
          qualityRationale: "聚合内容重拆后取主事件签名",
          aiProcessedAt: new Date(),
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown reparse error";
      issues.push(`${candidate.id}: ${message}`);
      console.error(`[Item Reparse] Failed for ${candidate.id}:`, error);
      await prisma.item.update({
        where: { id: candidate.id },
        data: {
          aggregationCheckedAt: new Date(),
          aggregationParseStatus: AGGREGATION_PARSE_STATUS.failed,
        },
      });
    }

    if (shouldWriteReparseProgress(processedCount, totalCandidates)) {
      await updateTaskRun(taskRun.id, {
        progressCurrent: processedCount,
        progressTotal: totalCandidates,
        progressLabel: `已扫描 ${processedCount}/${totalCandidates} 条，识别 ${reparsedCount} 条聚合`,
      });
    }
  }

  for (const clusterId of affectedClusterIds) {
    if (await isTaskRunCancellationRequested(taskRun.id)) {
      await updateTaskRun(taskRun.id, {
        status: "cancelled",
        progressCurrent: processedCount,
        progressTotal: totalCandidates,
        progressLabel: TASK_RUN_CANCELLED_LABEL,
        errorSummary: TASK_RUN_CANCELLED_MESSAGE,
        finishedAt: new Date(),
      });
      return;
    }
    await recomputeCluster(clusterId);
  }

  if (reparsedCount > 0) {
    invalidateFeedCache();
    invalidateDailyReportCache();
  }

  const finalStatus =
    issues.length > 0 && reparsedCount === 0
      ? "failed"
      : issues.length > 0
        ? "partial"
        : "succeeded";
  await updateTaskRun(taskRun.id, {
    status: finalStatus,
    progressCurrent: processedCount,
    progressTotal: totalCandidates,
    progressLabel: `聚合重拆完成，识别 ${reparsedCount} 条聚合${issues.length > 0 ? `，${issues.length} 条失败` : ""}`,
    aiCallCountActual: aiUsage.snapshot().actual,
    aiCallCountEstimated: aiUsage.snapshot().estimated,
    aiCallBreakdown: aiUsage.snapshot().breakdown,
    errorSummary: issues.length > 0 ? issues.slice(0, 5).join("; ") : null,
    finishedAt: new Date(),
  });
}
