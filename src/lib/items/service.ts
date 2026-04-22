import type { Item } from "@prisma/client";

import { createAiProvider, type AiProvider } from "@/lib/ai/provider";
import { assignItemToCluster, recomputeCluster } from "@/lib/clusters/service";
import { prisma } from "@/lib/db";
import { invalidateFeedCache } from "@/lib/feed/cache";
import { shouldTranslateTitle, stripHtmlTags } from "@/lib/feed/presentation";
import { getIngestionRuntimeConfig } from "@/lib/settings/service";
import { createTaskAiUsageTracker } from "@/lib/tasks/ai-usage";
import { enqueueTaskRun, updateTaskRun } from "@/lib/tasks/service";

type RegenerationTarget = "translation" | "summary";

type RegenerationOptions = {
  aiProvider?: AiProvider;
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

  return normalizeSummary(
    await aiProvider.summarizeItem(getItemSourceText(item), {
      title: item.originalTitle,
      sourceName: item.source.name,
    }),
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
) {
  const item = await prisma.item.findUnique({
    where: { id: itemId },
    include: { source: true },
  });

  if (!item || item.status !== "processed") {
    throw new Error("Item not found");
  }

  const aiProvider = await resolveAiProvider(options?.aiProvider);

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

    if (item.clusterId) {
      await recomputeCluster(item.clusterId, aiProvider);
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

  return prisma.item.findUniqueOrThrow({
    where: { id: item.id },
    include: { source: true },
  });
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

  await updateTaskRun(taskRun.id, {
    status: succeeded ? "succeeded" : "failed",
    progressCurrent: 1,
    progressTotal: 1,
    progressLabel: succeeded ? "已完成条目更新" : "条目更新失败",
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

export async function reanalyzeItem(itemId: string, options?: RegenerationOptions) {
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
