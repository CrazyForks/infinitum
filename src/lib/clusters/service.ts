import type { Item, Source } from "@prisma/client";

import { createAiProvider, type AiProvider } from "@/lib/ai/provider";
import {
  createContentCluster,
  deleteCluster,
  findActiveClusterByFingerprint,
  findRecentActiveClusterCandidates,
  getClusterWithItems,
  setItemCluster,
  updateClusterStatus,
  updateClusterSummary,
} from "@/lib/clusters/repository";
import { prisma } from "@/lib/db";
import { getDisplaySummary, getDisplayTitle } from "@/lib/feed/presentation";
import { getIngestionRuntimeConfig } from "@/lib/settings/service";
import { createTaskAiUsageTracker } from "@/lib/tasks/ai-usage";
import { enqueueTaskRun, updateTaskRun } from "@/lib/tasks/service";

const CLUSTER_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;
const CLUSTER_CANDIDATE_LIMIT = 5;
let clusterAssignmentQueue = Promise.resolve();

type ItemWithSource = Item & { source: Source };

function normalizeFingerprint(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

function buildItemSummary(item: ItemWithSource): string {
  return getDisplaySummary(item.summaryText, item.rssExcerpt, item.fullText ?? item.rssContent);
}

function buildClusterFingerprintSeed(item: ItemWithSource, options: { topicLabel?: string | null; clusterHint?: string | null }) {
  return options.clusterHint || "";
}

function buildClusterMatchInput(
  item: ItemWithSource,
  options: { topicLabel?: string | null; clusterHint?: string | null },
): string {
  return [
    `标题：${getDisplayTitle(item.originalTitle, item.translatedTitle)}`,
    options.clusterHint ? `聚合线索：${options.clusterHint}` : null,
    buildItemSummary(item) ? `摘要：${buildItemSummary(item)}` : null,
    `来源：${item.source.name}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function buildClusterFallback(clusterItems: ItemWithSource[], existingTitle?: string) {
  const primary = clusterItems[0]!;
  const title = existingTitle || getDisplayTitle(primary.originalTitle, primary.translatedTitle);

  if (clusterItems.length === 1) {
    return {
      title,
      summary: buildItemSummary(primary),
    };
  }

  return {
    title,
    summary: clusterItems
      .slice(0, 2)
      .map((item) => buildItemSummary(item))
      .filter(Boolean)
      .join(" "),
  };
}

async function generateClusterPresentation(clusterItems: ItemWithSource[], existingTitle?: string, aiProvider?: AiProvider) {
  const fallback = buildClusterFallback(clusterItems, existingTitle);

  if (!aiProvider || clusterItems.length < 2) {
    return fallback;
  }

  try {
    const summarySeed = clusterItems
      .slice(0, 3)
      .map((item) => `${getDisplayTitle(item.originalTitle, item.translatedTitle)}：${buildItemSummary(item)}`)
      .join("\n");

    return {
      title: fallback.title,
      summary: (await aiProvider.summarizeCluster(summarySeed, { title: fallback.title })) || fallback.summary,
    };
  } catch {
    return fallback;
  }
}

async function findClusterForItem(
  item: ItemWithSource,
  options: {
    topicLabel?: string | null;
    clusterHint?: string | null;
    aiProvider?: AiProvider;
  },
) {
  const fingerprintSeed = buildClusterFingerprintSeed(item, options);
  const fingerprint = fingerprintSeed ? normalizeFingerprint(fingerprintSeed) : "";
  const since = new Date(item.publishedAt.getTime() - CLUSTER_LOOKBACK_MS);
  const until = new Date(item.publishedAt.getTime() + CLUSTER_LOOKBACK_MS);
  const exactMatch = fingerprint ? await findActiveClusterByFingerprint(fingerprint, since, until) : null;
  const recentCandidates = await findRecentActiveClusterCandidates({
    since,
    until,
    limit: CLUSTER_CANDIDATE_LIMIT,
  });
  const candidates = exactMatch
    ? [exactMatch, ...recentCandidates.filter((candidate) => candidate.id !== exactMatch.id)]
    : recentCandidates;

  if (!options.aiProvider || candidates.length === 0) {
    return {
      cluster: exactMatch,
      fingerprint,
    };
  }

  try {
    const matchedClusterId = await options.aiProvider.matchClusterCandidate(buildClusterMatchInput(item, options), {
      title: getDisplayTitle(item.originalTitle, item.translatedTitle),
      candidates: candidates.map((candidate) => ({
        id: candidate.id,
        title: candidate.title,
        summary: candidate.summary,
      })),
    });

    return {
      cluster: candidates.find((candidate) => candidate.id === matchedClusterId) ?? exactMatch ?? null,
      fingerprint,
    };
  } catch {
    return {
      cluster: exactMatch,
      fingerprint,
    };
  }
}

async function runWithClusterAssignmentLock<T>(task: () => Promise<T>) {
  const previous = clusterAssignmentQueue;
  let release!: () => void;
  clusterAssignmentQueue = new Promise<void>((resolve) => {
    release = resolve;
  });

  await previous;

  try {
    return await task();
  } finally {
    release();
  }
}

export async function assignItemToCluster(
  itemId: string,
  options: {
    topicLabel?: string | null;
    clusterHint?: string | null;
    aiProvider?: AiProvider;
  },
) {
  return runWithClusterAssignmentLock(async () => {
    const item = await prisma.item.findUnique({
      where: { id: itemId },
      include: { source: true },
    });

    if (!item || (item.moderationStatus !== "allowed" && item.moderationStatus !== "restored")) {
      return null;
    }

    const { cluster: matchedCluster, fingerprint } = await findClusterForItem(item, options);
    const cluster =
      matchedCluster ??
      (await createContentCluster({
        fingerprint: fingerprint || `single-${item.id}`,
        title: options.clusterHint || getDisplayTitle(item.originalTitle, item.translatedTitle),
        summary: buildItemSummary(item),
        score: item.qualityScore,
        latestPublishedAt: item.publishedAt,
      }));

    await setItemCluster(item.id, cluster.id);
    await recomputeCluster(cluster.id, options.aiProvider);

    return cluster.id;
  });
}

export async function recomputeCluster(clusterId: string, aiProvider?: AiProvider) {
  const cluster = await getClusterWithItems(clusterId);

  if (!cluster) {
    return null;
  }

  if (cluster.items.length === 0) {
    await deleteCluster(clusterId);
    return null;
  }

  const presentation = await generateClusterPresentation(cluster.items, cluster.title, aiProvider);
  const score = Math.max(...cluster.items.map((item) => item.qualityScore));
  const latestPublishedAt = cluster.items[0]!.publishedAt;

  return updateClusterSummary(clusterId, {
    title: presentation.title,
    summary: presentation.summary,
    score,
    itemCount: cluster.items.length,
    latestPublishedAt,
  });
}

export async function detachItemFromCluster(itemId: string, aiProvider?: AiProvider) {
  const item = await prisma.item.findUnique({
    where: { id: itemId },
    select: { clusterId: true },
  });

  if (!item?.clusterId) {
    return null;
  }

  const previousClusterId = item.clusterId;
  await setItemCluster(itemId, null);
  await recomputeCluster(previousClusterId, aiProvider);

  return previousClusterId;
}

export async function setClusterVisibility(clusterId: string, visible: boolean) {
  return updateClusterStatus(clusterId, visible ? "active" : "hidden");
}

export async function recomputeAllClusters(aiProvider?: AiProvider) {
  const clusters = await prisma.contentCluster.findMany({
    select: { id: true },
  });

  for (const cluster of clusters) {
    await recomputeCluster(cluster.id, aiProvider);
  }
}

export async function enqueueClusterSummaryTask(clusterId: string) {
  return enqueueTaskRun({
    kind: "cluster_regenerate_summary",
    triggerType: "admin_action",
    label: "重新生成聚合摘要",
    entityId: clusterId,
  });
}

export async function executeClusterSummaryTask(
  taskRun: { id: string; entityId: string | null },
  options?: { aiProvider?: AiProvider },
) {
  if (!taskRun.entityId) {
    throw new Error("Task entityId is required.");
  }

  const aiUsage = createTaskAiUsageTracker(1);

  await updateTaskRun(taskRun.id, {
    status: "running",
    progressLabel: "正在重新生成聚合摘要",
    aiCallCountActual: 0,
    aiCallCountEstimated: aiUsage.snapshot().estimated,
  });

  try {
    const runtimeConfig = options?.aiProvider ? null : await getIngestionRuntimeConfig();
    const trackedAiProvider = aiUsage.wrapProvider(
      options?.aiProvider ??
        createAiProvider(runtimeConfig!.modelApi, {
          itemAnalysisPrompt: runtimeConfig!.prompts.itemAnalysis,
          clusterSummaryPrompt: runtimeConfig!.prompts.clusterSummary,
          clusterMatchPrompt: runtimeConfig!.prompts.clusterMatch,
        }),
      {
        summarizeClusterEstimated: false,
      },
    );
    const cluster = await recomputeCluster(
      taskRun.entityId,
      trackedAiProvider,
    );

    await updateTaskRun(taskRun.id, {
      status: "succeeded",
      progressCurrent: 1,
      progressTotal: 1,
      progressLabel: "已完成聚合摘要重生成",
      aiCallCountActual: aiUsage.snapshot().actual,
      aiCallCountEstimated: aiUsage.snapshot().estimated,
      finishedAt: new Date(),
      errorSummary: null,
    });

    return cluster;
  } catch (error) {
    await updateTaskRun(taskRun.id, {
      status: "failed",
      progressCurrent: 1,
      progressTotal: 1,
      progressLabel: "聚合摘要重生成失败",
      aiCallCountActual: aiUsage.snapshot().actual,
      aiCallCountEstimated: aiUsage.snapshot().estimated,
      finishedAt: new Date(),
      errorSummary: error instanceof Error ? error.message : "Unknown cluster summary error",
    });
    throw error;
  }
}
