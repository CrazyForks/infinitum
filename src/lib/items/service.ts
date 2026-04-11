import type { Item } from "@prisma/client";

import { createAiProvider, type AiProvider } from "@/lib/ai/provider";
import { assignItemToCluster, recomputeCluster } from "@/lib/clusters/service";
import { prisma } from "@/lib/db";
import { shouldTranslateTitle, stripHtmlTags } from "@/lib/feed/presentation";
import { getIngestionRuntimeConfig } from "@/lib/settings/service";

type RegenerationTarget = "translation" | "summary";

type RegenerationOptions = {
  aiProvider?: AiProvider;
};

function getItemAnalysisInput(item: Item): string {
  return item.fullText || item.rssContent || item.rssExcerpt || item.originalTitle;
}

function normalizeSummary(summary: string | null | undefined): string | null {
  return stripHtmlTags(summary) || null;
}

async function resolveAiProvider(aiProvider?: AiProvider) {
  if (aiProvider) {
    return aiProvider;
  }

  const runtimeConfig = await getIngestionRuntimeConfig();
  return createAiProvider(runtimeConfig.modelApi, {
    itemAnalysisPrompt: runtimeConfig.prompts.itemAnalysis,
    clusterSummaryPrompt: runtimeConfig.prompts.clusterSummary,
    clusterMatchPrompt: runtimeConfig.prompts.clusterMatch,
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
    const enrichment = await aiProvider.enrichContent(getItemAnalysisInput(item), {
      title: item.originalTitle,
      sourceName: item.source.name,
      translateTitle: target === "translation" && shouldTranslateTitle(item.originalTitle),
    });

    await prisma.item.update({
      where: { id: item.id },
      data:
        target === "translation"
          ? {
              translatedTitle:
                shouldTranslateTitle(item.originalTitle) ? enrichment.translatedTitle?.trim() || item.originalTitle : item.translatedTitle,
              errorMessage: null,
            }
          : {
              summaryText: normalizeSummary(enrichment.summary) || item.summaryText,
              errorMessage: null,
            },
    });

    if (item.clusterId) {
      await recomputeCluster(item.clusterId, aiProvider);
    }
  } catch (error) {
    await prisma.item.update({
      where: { id: item.id },
      data: {
        errorMessage: error instanceof Error ? error.message : "Unknown regeneration error",
      },
    });
  }

  return prisma.item.findUniqueOrThrow({
    where: { id: item.id },
    include: { source: true },
  });
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
    topicLabel: restored.topicLabel,
    clusterHint: null,
    aiProvider: options?.aiProvider,
  });

  return prisma.item.findUniqueOrThrow({
    where: { id: restored.id },
    include: { source: true },
  });
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
  const analysis = await aiProvider.enrichContent(getItemAnalysisInput(item), {
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
      summaryText: normalizeSummary(analysis.summary) || item.summaryText,
      moderationStatus,
      moderationReason: analysis.moderationReason,
      moderationDetail: analysis.moderationDetail,
      qualityScore: analysis.qualityScore,
      qualityRationale: analysis.qualityRationale,
      topicLabel: analysis.topicLabel,
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
      topicLabel: analysis.topicLabel,
      clusterHint: analysis.clusterHint,
      aiProvider,
    });
  }

  if (previousClusterId && previousClusterId !== updated.clusterId) {
    await recomputeCluster(previousClusterId, aiProvider);
  }

  return prisma.item.findUniqueOrThrow({
    where: { id: updated.id },
    include: { source: true },
  });
}
