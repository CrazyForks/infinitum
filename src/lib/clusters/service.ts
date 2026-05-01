import {
  CLUSTER_AI_CANDIDATE_LIMIT,
  CLUSTER_AI_MIN_SCORE,
  CLUSTER_DIRECT_MATCH_MIN_GAP,
  CLUSTER_DIRECT_MATCH_MIN_SCORE,
  CLUSTER_LOOKBACK_MS,
} from "@/config/constants";

import { createAiProvider, type AiEventSignature, type AiProvider } from "@/lib/ai/provider";
import {
  buildCandidateRange,
  buildCandidateRangeKey,
  buildClusterEventSignature,
  buildClusterFingerprintSeed,
  buildClusterMatchInput,
  buildClusterMergeCandidateInputHash,
  buildClusterMergeCandidateSelection,
  buildClusterMergeInput,
  buildClusterSummaryInputHash,
  buildEventDisplayTitle,
  buildItemSummary,
  buildExactMatchKey,
  generateClusterPresentation,
  getClusterAssignmentWindowKeys,
  getItemEventSignature,
  hasCompleteClusterMatchSignature,
  type ClusterAssignmentCoordinator,
  type ItemWithSource,
  normalizeFingerprint,
  rankClusterCandidates,
  rememberRecentCandidate,
  toClusterAssignmentCandidate,
} from "@/lib/clusters/helpers";
import {
  type ClusterAssignmentCandidate,
  createContentCluster,
  deleteCluster,
  findActiveClusterByFingerprint,
  findActiveClusterByTitle,
  findRecentActiveClusterCandidates,
  getClusterWithItems,
  setItemCluster,
  updateClusterStatus,
  updateClusterSummary,
} from "@/lib/clusters/repository";
import { normalizeEventSignatureForStorage } from "@/lib/clusters/normalization";
import { prisma } from "@/lib/db";
import { invalidateFeedCache } from "@/lib/feed/cache";
import { getDisplayTitle } from "@/lib/feed/presentation";
import { getIngestionRuntimeConfig } from "@/lib/settings/service";
import { createTaskAiUsageTracker } from "@/lib/tasks/ai-usage";
import { enqueueTaskRun, updateTaskRun } from "@/lib/tasks/service";
const clusterAssignmentQueues = new Map<string, Promise<void>>();

type ClusterAssignmentSource = "exact_match" | "cheap_rank_direct" | "ai_match";

type ClusterAssignmentResult = {
  clusterId: string | null;
  matchSource: ClusterAssignmentSource | null;
  skippedIncompleteSignature: boolean;
  createdNewCluster: boolean;
};

export type ClusterRecomputeResult = {
  clusterId: string;
  deleted: boolean;
  updated: boolean;
  summaryAttempted: boolean;
  summarySucceeded: boolean;
};


async function findClusterForItem(
  item: ItemWithSource,
  options: {
    eventSignature?: AiEventSignature | null;
    aiProvider?: AiProvider;
    coordinator?: ClusterAssignmentCoordinator;
    titleFallback?: string;
  },
): Promise<{
  cluster: ClusterAssignmentCandidate | null;
  fingerprint: string;
  matchSource: ClusterAssignmentSource | null;
  skippedIncompleteSignature: boolean;
}> {
  const fingerprintSeed = buildClusterFingerprintSeed(options);
  const fingerprint = fingerprintSeed ? normalizeFingerprint(fingerprintSeed) : "";
  const { since, until } = buildCandidateRange(item, CLUSTER_LOOKBACK_MS);
  const rangeKey = buildCandidateRangeKey(since, until);
  const exactMatchKey = fingerprint ? buildExactMatchKey(fingerprint, since, until) : "";
  let exactMatch = fingerprint ? options.coordinator?.exactMatches.get(exactMatchKey) : undefined;

  if (fingerprint && typeof exactMatch === "undefined") {
    exactMatch = await findActiveClusterByFingerprint(fingerprint, since, until);
    options.coordinator?.exactMatches.set(exactMatchKey, exactMatch ? toClusterAssignmentCandidate(exactMatch) : null);
  }

  if (exactMatch) {
    return {
      cluster: exactMatch,
      fingerprint,
      matchSource: "exact_match" as const,
      skippedIncompleteSignature: false,
    };
  }

  const titleFallback = options.titleFallback?.trim() ?? "";
  if (titleFallback) {
    const titleMatch = await findActiveClusterByTitle(titleFallback, since, until);

    if (titleMatch) {
      return {
        cluster: toClusterAssignmentCandidate(titleMatch),
        fingerprint,
        matchSource: "exact_match" as const,
        skippedIncompleteSignature: false,
      };
    }
  }

  if (!options.aiProvider) {
    return {
      cluster: null,
      fingerprint,
      matchSource: null,
      skippedIncompleteSignature: false,
    };
  }

  if (!hasCompleteClusterMatchSignature(options.eventSignature)) {
    return {
      cluster: null,
      fingerprint,
      matchSource: null,
      skippedIncompleteSignature: true,
    };
  }

  let recentCandidateEntry = options.coordinator?.recentCandidates.get(rangeKey);

  if (!recentCandidateEntry) {
    recentCandidateEntry = {
      sinceMs: since.getTime(),
      untilMs: until.getTime(),
      candidates: await findRecentActiveClusterCandidates({
        since,
        until,
      }),
    };
    options.coordinator?.recentCandidates.set(rangeKey, recentCandidateEntry);
  }

  const recentCandidates = recentCandidateEntry.candidates;
  const candidates = recentCandidates;

  if (candidates.length === 0) {
    return {
      cluster: null,
      fingerprint,
      matchSource: null,
      skippedIncompleteSignature: false,
    };
  }

  const rankedCandidates = rankClusterCandidates(item, options.eventSignature!, candidates).filter(
    (entry) => entry.score >= CLUSTER_AI_MIN_SCORE,
  );

  if (rankedCandidates.length === 0) {
    return {
      cluster: null,
      fingerprint,
      matchSource: null,
      skippedIncompleteSignature: false,
    };
  }

  const topCandidate = rankedCandidates[0]!;
  const secondCandidateScore = rankedCandidates[1]?.score ?? Number.NEGATIVE_INFINITY;

  if (
    topCandidate.strongMatch &&
    topCandidate.score >= CLUSTER_DIRECT_MATCH_MIN_SCORE &&
    topCandidate.score - secondCandidateScore >= CLUSTER_DIRECT_MATCH_MIN_GAP
  ) {
    return {
      cluster: topCandidate.candidate,
      fingerprint,
      matchSource: "cheap_rank_direct" as const,
      skippedIncompleteSignature: false,
    };
  }

  const aiCandidates = rankedCandidates.slice(0, CLUSTER_AI_CANDIDATE_LIMIT).map((entry) => entry.candidate);

  try {
    const matchedClusterId = await options.aiProvider.matchClusterCandidate(buildClusterMatchInput(item, options), {
      title: getDisplayTitle(item.originalTitle, item.translatedTitle),
      candidates: aiCandidates.map((candidate) => ({
        id: candidate.id,
        title: candidate.title,
        summary: candidate.summary,
      })),
    });
    const matchedCluster = aiCandidates.find((candidate) => candidate.id === matchedClusterId) ?? null;

    return {
      cluster: matchedCluster,
      fingerprint,
      matchSource: matchedCluster ? "ai_match" : null,
      skippedIncompleteSignature: false,
    };
  } catch {
    return {
      cluster: null,
      fingerprint,
      matchSource: null,
      skippedIncompleteSignature: false,
    };
  }
}

async function runWithClusterAssignmentKeyLock<T>(key: string, task: () => Promise<T>) {
  const previous = clusterAssignmentQueues.get(key) ?? Promise.resolve();
  let release!: () => void;
  const next = new Promise<void>((resolve) => {
    release = resolve;
  });
  const queued = previous.then(() => next);

  clusterAssignmentQueues.set(key, queued);
  await previous;

  try {
    return await task();
  } finally {
    release();

    if (clusterAssignmentQueues.get(key) === queued) {
      clusterAssignmentQueues.delete(key);
    }
  }
}

async function runWithClusterAssignmentWindowLocks<T>(keys: string[], task: () => Promise<T>) {
  const uniqueKeys = [...new Set(keys)].sort();
  let execute = task;

  for (let index = uniqueKeys.length - 1; index >= 0; index -= 1) {
    const key = uniqueKeys[index]!;
    const next = execute;
    execute = () => runWithClusterAssignmentKeyLock(key, next);
  }

  return execute();
}

export async function assignItemToCluster(
  itemId: string,
  options: {
    eventSignature?: AiEventSignature | null;
    aiProvider?: AiProvider;
    coordinator?: ClusterAssignmentCoordinator;
    aggregationEnabled?: boolean;
  },
) {
  const item = await prisma.item.findUnique({
    where: { id: itemId },
    include: { source: true },
  });

  if (!item || (item.moderationStatus !== "allowed" && item.moderationStatus !== "restored")) {
    return {
      clusterId: null,
      matchSource: null,
      skippedIncompleteSignature: false,
      createdNewCluster: false,
    } satisfies ClusterAssignmentResult;
  }

  return runWithClusterAssignmentWindowLocks(getClusterAssignmentWindowKeys(item.publishedAt, CLUSTER_LOOKBACK_MS), async () => {
    const item = await prisma.item.findUnique({
      where: { id: itemId },
      include: { source: true },
    });

    if (!item || (item.moderationStatus !== "allowed" && item.moderationStatus !== "restored")) {
      return {
        clusterId: null,
        matchSource: null,
        skippedIncompleteSignature: false,
        createdNewCluster: false,
      } satisfies ClusterAssignmentResult;
    }

    const resolvedEventSignature = normalizeEventSignatureForStorage(options.eventSignature ?? getItemEventSignature(item));
    const canAggregate = options.aggregationEnabled ?? item.source.aggregationEnabled;
    if (!canAggregate) {
      const eventDisplayTitle = buildEventDisplayTitle(resolvedEventSignature);
      const cluster = await createContentCluster({
        fingerprint: `single-${item.id}`,
        title: eventDisplayTitle || getDisplayTitle(item.originalTitle, item.translatedTitle),
        summary: buildItemSummary(item),
        score: item.qualityScore,
        latestPublishedAt: item.publishedAt,
        eventType: resolvedEventSignature?.eventType ?? null,
        eventSubject: resolvedEventSignature?.eventSubject ?? null,
        eventAction: resolvedEventSignature?.eventAction ?? null,
        eventObject: resolvedEventSignature?.eventObject ?? null,
        eventDate: resolvedEventSignature?.eventDate ?? null,
      });

      await setItemCluster(item.id, cluster.id);

      return {
        clusterId: cluster.id,
        matchSource: null,
        skippedIncompleteSignature: false,
        createdNewCluster: true,
      } satisfies ClusterAssignmentResult;
    }

    const eventDisplayTitle = buildEventDisplayTitle(resolvedEventSignature);
    const clusterTitle = eventDisplayTitle || getDisplayTitle(item.originalTitle, item.translatedTitle);
    const { cluster: matchedCluster, fingerprint, matchSource, skippedIncompleteSignature } =
      await findClusterForItem(item, {
        ...options,
        eventSignature: resolvedEventSignature,
        titleFallback: clusterTitle,
      });
    const createdNewCluster = !matchedCluster;
    const cluster =
      matchedCluster ??
      (await createContentCluster({
        fingerprint: fingerprint || `single-${item.id}`,
        title: clusterTitle,
        summary: buildItemSummary(item),
        score: item.qualityScore,
        latestPublishedAt: item.publishedAt,
        eventType: resolvedEventSignature?.eventType ?? null,
        eventSubject: resolvedEventSignature?.eventSubject ?? null,
        eventAction: resolvedEventSignature?.eventAction ?? null,
        eventObject: resolvedEventSignature?.eventObject ?? null,
        eventDate: resolvedEventSignature?.eventDate ?? null,
      }));

    if (options.coordinator) {
      const candidate = toClusterAssignmentCandidate(cluster);

      if (fingerprint) {
        const { since, until } = buildCandidateRange(item, CLUSTER_LOOKBACK_MS);
        options.coordinator.exactMatches.set(buildExactMatchKey(fingerprint, since, until), candidate);
      }

      rememberRecentCandidate(options.coordinator, candidate, item.publishedAt);
    }

    await setItemCluster(item.id, cluster.id);
    // Note: Cluster summary recomputation is now handled at batch level in executeIngestion

    return {
      clusterId: cluster.id,
      matchSource,
      skippedIncompleteSignature,
      createdNewCluster,
    } satisfies ClusterAssignmentResult;
  });
}

export async function recomputeCluster(
  clusterId: string,
  aiProvider?: AiProvider,
  options?: { forceSummary?: boolean },
): Promise<ClusterRecomputeResult> {
  const cluster = await getClusterWithItems(clusterId);

  if (!cluster) {
    return {
      clusterId,
      deleted: false,
      updated: false,
      summaryAttempted: false,
      summarySucceeded: false,
    } satisfies ClusterRecomputeResult;
  }

  if (cluster.items.length === 0) {
    await deleteCluster(clusterId);
    return {
      clusterId,
      deleted: true,
      updated: false,
      summaryAttempted: false,
      summarySucceeded: false,
    } satisfies ClusterRecomputeResult;
  }

  const summaryInputHash = buildClusterSummaryInputHash(cluster.items);
  const presentation =
    !options?.forceSummary && cluster.summaryInputHash && cluster.summaryInputHash === summaryInputHash
      ? {
          title: cluster.title,
          summary: cluster.summary,
          summaryAttempted: false,
          summarySucceeded: false,
        }
      : await generateClusterPresentation(cluster.items, cluster.title, aiProvider);
  const eventSignature = buildClusterEventSignature(cluster.items);
  const score = Math.max(...cluster.items.map((item) => item.qualityScore));
  const latestPublishedAt = cluster.items[0]!.publishedAt;
  const nextItemCount = cluster.items.length;
  const shouldSkipUpdate =
    cluster.title === presentation.title &&
    cluster.summary === presentation.summary &&
    cluster.score === score &&
    cluster.itemCount === nextItemCount &&
    cluster.latestPublishedAt.getTime() === latestPublishedAt.getTime() &&
    cluster.eventType === (eventSignature?.eventType ?? null) &&
    cluster.eventSubject === (eventSignature?.eventSubject ?? null) &&
    cluster.eventAction === (eventSignature?.eventAction ?? null) &&
    cluster.eventObject === (eventSignature?.eventObject ?? null) &&
    cluster.eventDate === (eventSignature?.eventDate ?? null) &&
    cluster.summaryInputHash === summaryInputHash;

  if (shouldSkipUpdate) {
    return {
      clusterId,
      deleted: false,
      updated: false,
      summaryAttempted: presentation.summaryAttempted,
      summarySucceeded: presentation.summarySucceeded,
    } satisfies ClusterRecomputeResult;
  }

  await updateClusterSummary(clusterId, {
    title: presentation.title,
    summary: presentation.summary,
    summaryInputHash,
    score,
    itemCount: nextItemCount,
    latestPublishedAt,
    eventType: eventSignature?.eventType ?? null,
    eventSubject: eventSignature?.eventSubject ?? null,
    eventAction: eventSignature?.eventAction ?? null,
    eventObject: eventSignature?.eventObject ?? null,
    eventDate: eventSignature?.eventDate ?? null,
  });

  return {
    clusterId,
    deleted: false,
    updated: true,
    summaryAttempted: presentation.summaryAttempted,
    summarySucceeded: presentation.summarySucceeded,
  } satisfies ClusterRecomputeResult;
}

async function refreshClusterStats(clusterId: string) {
  const cluster = await getClusterWithItems(clusterId);

  if (!cluster) {
    return null;
  }

  if (cluster.items.length === 0) {
    await deleteCluster(clusterId);
    return null;
  }

  const eventSignature = buildClusterEventSignature(cluster.items);
  const score = Math.max(...cluster.items.map((item) => item.qualityScore));
  const latestPublishedAt = cluster.items[0]!.publishedAt;

  return prisma.contentCluster.update({
    where: { id: clusterId },
    data: {
      score,
      itemCount: cluster.items.length,
      latestPublishedAt,
      eventType: eventSignature?.eventType ?? null,
      eventSubject: eventSignature?.eventSubject ?? null,
      eventAction: eventSignature?.eventAction ?? null,
      eventObject: eventSignature?.eventObject ?? null,
      eventDate: eventSignature?.eventDate ?? null,
    },
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
  await prisma.item.update({
    where: { id: itemId },
    data: {
      clusterId: null,
      manualClusterAssignedAt: null,
    },
  });
  await recomputeCluster(previousClusterId, aiProvider);
  invalidateFeedCache();

  return previousClusterId;
}

export async function moveItemToCluster(itemId: string, clusterId: string, aiProvider?: AiProvider) {
  const [item, targetCluster] = await Promise.all([
    prisma.item.findUnique({
      where: { id: itemId },
      select: {
        id: true,
        clusterId: true,
        manualClusterAssignedAt: true,
        moderationStatus: true,
        status: true,
      },
    }),
    prisma.contentCluster.findUnique({
      where: { id: clusterId },
      select: {
        id: true,
        status: true,
      },
    }),
  ]);

  if (!item || item.status !== "processed" || (item.moderationStatus !== "allowed" && item.moderationStatus !== "restored")) {
    throw new Error("Item not found");
  }

  if (!targetCluster || targetCluster.status !== "active") {
    throw new Error("Cluster not found");
  }

  if (item.clusterId === clusterId) {
    if (!item.manualClusterAssignedAt) {
      await prisma.item.update({
        where: { id: itemId },
        data: { manualClusterAssignedAt: new Date() },
      });
      invalidateFeedCache();
    }

    return clusterId;
  }

  const previousClusterId = item.clusterId;
  await prisma.item.update({
    where: { id: itemId },
    data: {
      clusterId,
      manualClusterAssignedAt: new Date(),
    },
  });
  await recomputeCluster(clusterId, aiProvider);

  if (previousClusterId) {
    await recomputeCluster(previousClusterId, aiProvider);
  }

  invalidateFeedCache();

  return clusterId;
}

export type MergeSelectedItemsResult = {
  targetClusterId: string;
  targetClusterTitle: string;
  movedItemIds: string[];
  affectedClusterIds: string[];
  itemsMoved: number;
};

export async function mergeSelectedItemsToLargestCluster(
  itemIds: string[],
  aiProvider?: AiProvider,
): Promise<MergeSelectedItemsResult> {
  const uniqueItemIds = [...new Set(itemIds.map((id) => id.trim()).filter(Boolean))];
  if (uniqueItemIds.length < 2) {
    throw new Error("至少需要选择两个条目进行合并");
  }

  const items = await prisma.item.findMany({
    where: { id: { in: uniqueItemIds } },
    select: {
      id: true,
      clusterId: true,
      moderationStatus: true,
      status: true,
      cluster: {
        select: {
          id: true,
          title: true,
          itemCount: true,
          latestPublishedAt: true,
          status: true,
        },
      },
    },
  });
  const itemsById = new Map(items.map((item) => [item.id, item]));
  const missingIds = uniqueItemIds.filter((id) => !itemsById.has(id));
  if (missingIds.length > 0) {
    throw new Error(`部分条目不存在: ${missingIds.join(", ")}`);
  }

  const invalidItem = items.find(
    (item) => item.status !== "processed" || (item.moderationStatus !== "allowed" && item.moderationStatus !== "restored"),
  );
  if (invalidItem) {
    throw new Error("只能合并已处理且可展示的条目");
  }

  const clusterCandidates = new Map<string, NonNullable<(typeof items)[number]["cluster"]>>();
  for (const item of items) {
    if (!item.cluster) {
      continue;
    }
    if (item.cluster.status !== "active") {
      throw new Error("只能合并 active 状态聚合组中的条目");
    }
    clusterCandidates.set(item.cluster.id, item.cluster);
  }

  if (clusterCandidates.size === 0) {
    throw new Error("所选条目没有可作为合并基准的聚合组");
  }

  const targetCluster = [...clusterCandidates.values()].sort((left, right) => {
    if (right.itemCount !== left.itemCount) {
      return right.itemCount - left.itemCount;
    }
    return right.latestPublishedAt.getTime() - left.latestPublishedAt.getTime();
  })[0]!;

  const movedItemIds = items
    .filter((item) => item.clusterId !== targetCluster.id)
    .map((item) => item.id);

  if (movedItemIds.length === 0) {
    throw new Error("所选条目已在同一个聚合组中");
  }

  const previousClusterIds = [
    ...new Set(
      items
        .filter((item) => item.clusterId && item.clusterId !== targetCluster.id)
        .map((item) => item.clusterId!),
    ),
  ];

  await prisma.item.updateMany({
    where: { id: { in: movedItemIds } },
    data: {
      clusterId: targetCluster.id,
      manualClusterAssignedAt: new Date(),
    },
  });

  const affectedClusterIds = [targetCluster.id, ...previousClusterIds];
  for (const clusterId of affectedClusterIds) {
    await recomputeCluster(clusterId, aiProvider);
  }

  invalidateFeedCache();

  return {
    targetClusterId: targetCluster.id,
    targetClusterTitle: targetCluster.title,
    movedItemIds,
    affectedClusterIds,
    itemsMoved: movedItemIds.length,
  };
}

export async function setClusterVisibility(clusterId: string, visible: boolean) {
  const cluster = await updateClusterStatus(clusterId, visible ? "active" : "hidden");
  invalidateFeedCache();
  return cluster;
}

export async function enqueueClusterSummaryTask(clusterId: string, label?: string) {
  return enqueueTaskRun({
    kind: "cluster_regenerate_summary",
    triggerType: "admin_action",
    label: label ?? "重新生成聚合摘要",
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

  const aiUsage = createTaskAiUsageTracker(1, "cluster_summary");
  const initialAiUsage = aiUsage.snapshot();

  await updateTaskRun(taskRun.id, {
    status: "running",
    progressLabel: "正在重新生成聚合摘要",
    aiCallCountActual: 0,
    aiCallCountEstimated: initialAiUsage.estimated,
    aiCallBreakdown: initialAiUsage.breakdown,
  });

  try {
    const runtimeConfig = options?.aiProvider ? null : await getIngestionRuntimeConfig();
    const trackedAiProvider = aiUsage.wrapProvider(
      options?.aiProvider ??
        createAiProvider(runtimeConfig!.modelApi, {
          itemSummary: runtimeConfig!.selectedPromptConfigs?.itemSummary,
          itemAnalysis: runtimeConfig!.selectedPromptConfigs?.itemAnalysis,
          clusterSummary: runtimeConfig!.selectedPromptConfigs?.clusterSummary,
          clusterMatch: runtimeConfig!.selectedPromptConfigs?.clusterMatch,
        }),
      {
        summarizeClusterEstimated: false,
      },
    );
    const cluster = await recomputeCluster(
      taskRun.entityId,
      trackedAiProvider,
      { forceSummary: true },
    );

    const progressLabel = cluster.summaryAttempted
      ? cluster.summarySucceeded
        ? "已完成聚合摘要重生成（AI生成成功）"
        : "已完成聚合摘要重生成（AI生成失败，使用回退摘要）"
      : "已完成聚合摘要重生成（条目不足2条，跳过AI生成）";

    await updateTaskRun(taskRun.id, {
      status: "succeeded",
      progressCurrent: 1,
      progressTotal: 1,
      progressLabel,
      aiCallCountActual: aiUsage.snapshot().actual,
      aiCallCountEstimated: aiUsage.snapshot().estimated,
      aiCallBreakdown: aiUsage.snapshot().breakdown,
      finishedAt: new Date(),
      errorSummary: null,
    });

    invalidateFeedCache();
    return cluster;
  } catch (error) {
    await updateTaskRun(taskRun.id, {
      status: "failed",
      progressCurrent: 1,
      progressTotal: 1,
      progressLabel: "聚合摘要重生成失败",
      aiCallCountActual: aiUsage.snapshot().actual,
      aiCallCountEstimated: aiUsage.snapshot().estimated,
      aiCallBreakdown: aiUsage.snapshot().breakdown,
      finishedAt: new Date(),
      errorSummary: error instanceof Error ? error.message : "Unknown cluster summary error",
    });
    throw error;
  }
}

// Internal lightweight merge that moves items and deletes emptied clusters
// without creating separate background tasks (used during ingestion merge pass).
async function mergeClustersInternal(
  targetClusterId: string,
  sourceClusterIds: string[],
): Promise<{ itemsMoved: number }> {
  // Move all items from source clusters to target cluster
  const moveResult = await prisma.item.updateMany({
    where: {
      clusterId: { in: sourceClusterIds },
      status: "processed",
      moderationStatus: { in: ["allowed", "restored"] },
    },
    data: { clusterId: targetClusterId },
  });

  // Delete emptied source clusters
  await prisma.contentCluster.deleteMany({
    where: {
      id: { in: sourceClusterIds },
      items: { none: {} },
    },
  });

  // Refresh target cluster stats
  await refreshClusterStats(targetClusterId);

  return { itemsMoved: moveResult.count };
}

export type ClusterMergePassResult = {
  baseClusters: number;
  candidates: number;
  totalPairs: number;
  rejectedObjectConflict: number;
  rejectedDateConflict: number;
  rejectedNoEventAnchor: number;
  belowGrayScore: number;
  relatedPairs: number;
  aiEligiblePairs: number;
  cleanPairsSkipped: number;
  dirtyPairs: number;
  preLimitCandidates: number;
  postLimitCandidates: number;
  dirtyCandidates: number;
  aiMergeGroups: number;
  skipped: boolean;
  mergedCount: number;
  itemsMoved: number;
  failedGroups: number;
  affectedClusterIds: string[];
};

type EvaluatedClusterMergeCandidate = Parameters<typeof buildClusterMergeCandidateInputHash>[0] & { id: string };

async function markClusterMergeCandidatesEvaluated(candidates: EvaluatedClusterMergeCandidate[]) {
  if (candidates.length === 0) {
    return;
  }

  await prisma.$transaction(
    candidates.map((candidate) =>
      prisma.contentCluster.updateMany({
        where: { id: candidate.id },
        data: { mergeInputHash: buildClusterMergeCandidateInputHash(candidate) },
      }),
    ),
  );
}

export async function executeClusterMerge(
  aiProvider: AiProvider | undefined,
  now: Date,
): Promise<ClusterMergePassResult> {
  const lookbackSince = new Date(now.getTime() - CLUSTER_LOOKBACK_MS);

  // Refresh itemCount for clusters in the lookback window.
  // Newly created clusters start with itemCount=0 and only get updated
  // during cluster_finalize — which runs AFTER merge.  Without this,
  // clusters created/modified in the current task are excluded by the
  // itemCount >= 2 filter below.
  await prisma.$executeRaw`
    UPDATE content_clusters
    SET itemCount = (
      SELECT COUNT(*) FROM items
      WHERE items.clusterId = content_clusters.id
      AND items.status = 'processed'
      AND items.moderationStatus IN ('allowed', 'restored')
    )
    WHERE status = 'active'
    AND latestPublishedAt >= ${lookbackSince.getTime()}
  `;

  // Load active clusters within the 7-day window, then locally narrow them
  // before asking AI to judge merge groups.
  const recentClusters = await prisma.contentCluster.findMany({
    where: {
      status: "active",
      latestPublishedAt: { gte: lookbackSince },
      items: {
        some: {
          status: "processed",
          moderationStatus: { in: ["allowed", "restored"] },
          source: {
            aggregationEnabled: true,
          },
        },
      },
    },
    orderBy: { id: "asc" },
  });
  const { candidates: allCandidates, diagnostics } = buildClusterMergeCandidateSelection(recentClusters);

  const baseResult = {
    baseClusters: recentClusters.length,
    candidates: allCandidates.length,
    totalPairs: diagnostics.totalPairs,
    rejectedObjectConflict: diagnostics.rejectedObjectConflict,
    rejectedDateConflict: diagnostics.rejectedDateConflict,
    rejectedNoEventAnchor: diagnostics.rejectedNoEventAnchor,
    belowGrayScore: diagnostics.belowGrayScore,
    relatedPairs: diagnostics.relatedPairs,
    aiEligiblePairs: diagnostics.aiEligiblePairs,
    cleanPairsSkipped: diagnostics.cleanPairsSkipped,
    dirtyPairs: diagnostics.dirtyPairs,
    preLimitCandidates: diagnostics.preLimitCandidates,
    postLimitCandidates: diagnostics.postLimitCandidates,
    dirtyCandidates: diagnostics.dirtyCandidateCount,
  };

  if (allCandidates.length < 2) {
    return {
      ...baseResult,
      aiMergeGroups: 0,
      skipped: true,
      mergedCount: 0,
      itemsMoved: 0,
      failedGroups: 0,
      affectedClusterIds: [],
    };
  }

  // `mergeInputHash` is per-cluster input state. This lets a new or changed
  // cluster pull in stable neighbors without repeatedly sending old clean pairs.
  const allHashesMatch = allCandidates.every(
    (candidate) => candidate.mergeInputHash === buildClusterMergeCandidateInputHash(candidate),
  );

  if (allHashesMatch) {
    return {
      ...baseResult,
      aiMergeGroups: 0,
      skipped: true,
      mergedCount: 0,
      itemsMoved: 0,
      failedGroups: 0,
      affectedClusterIds: [],
    };
  }

  // If no AI provider, just update hashes and skip
  if (!aiProvider) {
    await markClusterMergeCandidatesEvaluated(allCandidates);

    return {
      ...baseResult,
      aiMergeGroups: 0,
      skipped: true,
      mergedCount: 0,
      itemsMoved: 0,
      failedGroups: 0,
      affectedClusterIds: [],
    };
  }

  // Build merge candidates and call AI
  const clustersJson = buildClusterMergeInput(allCandidates);
  let mergeGroups: string[][];

  try {
    mergeGroups = await aiProvider.mergeClusters(clustersJson);
  } catch {
    // On AI failure, update hashes and return without merging
    await markClusterMergeCandidatesEvaluated(allCandidates);

    return {
      ...baseResult,
      aiMergeGroups: 0,
      skipped: true,
      mergedCount: 0,
      itemsMoved: 0,
      failedGroups: 0,
      affectedClusterIds: [],
    };
  }

  // Execute merges
  const affectedClusterIds = new Set<string>();
  let mergedCount = 0;
  let itemsMoved = 0;
  let failedGroups = 0;

  for (const group of mergeGroups) {
    if (group.length < 2) continue;

    // Sort by itemCount descending; the first becomes the target
    const groupWithCounts = group
      .map((id) => allCandidates.find((c) => c.id === id))
      .filter((c): c is NonNullable<typeof c> => c != null)
      .sort((a, b) => b.itemCount - a.itemCount);

    if (groupWithCounts.length < 2) continue;

    const target = groupWithCounts[0]!;
    const sources = groupWithCounts.slice(1).map((c) => c.id);

    try {
      const mergeResult = await mergeClustersInternal(target.id, sources);
      affectedClusterIds.add(target.id);
      mergedCount += sources.length;
      itemsMoved += mergeResult.itemsMoved;
    } catch {
      // Continue with other groups on individual merge failure
      failedGroups += 1;
    }
  }

  // Update mergeInputHash on evaluated candidates after merge. Deleted source
  // clusters are ignored by updateMany.
  await markClusterMergeCandidatesEvaluated(allCandidates);

  return {
    ...baseResult,
    aiMergeGroups: mergeGroups.filter((group) => group.length >= 2).length,
    skipped: false,
    mergedCount,
    itemsMoved,
    failedGroups,
    affectedClusterIds: [...affectedClusterIds],
  };
}

type ClusterMergeResult = {
  targetClusterId: string;
  mergedClusterIds: string[];
  itemsMoved: number;
  taskId: string;
};

export async function mergeClusters(
  targetClusterId: string,
  sourceClusterIds: string[],
): Promise<ClusterMergeResult> {
  if (sourceClusterIds.length === 0) {
    throw new Error("至少需要选择一个要合并的聚合组");
  }

  if (sourceClusterIds.includes(targetClusterId)) {
    throw new Error("目标聚合组不能在待合并列表中");
  }

  // 验证目标聚合组存在且为active状态
  const targetCluster = await prisma.contentCluster.findUnique({
    where: { id: targetClusterId },
    include: {
      items: {
        where: {
          status: "processed",
          moderationStatus: { in: ["allowed", "restored"] },
        },
      },
    },
  });

  if (!targetCluster) {
    throw new Error("目标聚合组不存在");
  }

  if (targetCluster.status !== "active") {
    throw new Error("只能合并到active状态的聚合组");
  }

  // 验证所有源聚合组存在且为active状态
  const sourceClusters = await prisma.contentCluster.findMany({
    where: {
      id: { in: sourceClusterIds },
      status: "active",
    },
    include: {
      items: {
        where: {
          status: "processed",
          moderationStatus: { in: ["allowed", "restored"] },
        },
      },
    },
  });

  if (sourceClusters.length !== sourceClusterIds.length) {
    const foundIds = new Set(sourceClusters.map((c) => c.id));
    const missingIds = sourceClusterIds.filter((id) => !foundIds.has(id));
    throw new Error(`部分聚合组不存在或已隐藏: ${missingIds.join(", ")}`);
  }

  // 收集所有要移动的条目
  const itemsToMove: string[] = [];
  for (const cluster of sourceClusters) {
    for (const item of cluster.items) {
      itemsToMove.push(item.id);
    }
  }

  if (itemsToMove.length === 0) {
    throw new Error("选中的聚合组中没有可移动的条目");
  }

  // 移动所有条目到目标聚合组
  await prisma.item.updateMany({
    where: { id: { in: itemsToMove } },
    data: { clusterId: targetClusterId },
  });

  await prisma.contentCluster.deleteMany({
    where: {
      id: { in: sourceClusterIds },
      items: { none: {} },
    },
  });
  await refreshClusterStats(targetClusterId);

  // 清除缓存
  invalidateFeedCache();

  // 创建异步任务重新生成目标聚合组摘要
  const task = await enqueueClusterSummaryTask(
    targetClusterId,
    `合并 ${sourceClusterIds.length} 个聚合组后重新生成摘要`
  );

  return {
    targetClusterId,
    mergedClusterIds: sourceClusterIds,
    itemsMoved: itemsToMove.length,
    taskId: task.id,
  };
}
