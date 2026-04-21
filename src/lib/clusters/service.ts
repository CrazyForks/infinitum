import type { Item, Source } from "@prisma/client";

import { createAiProvider, type AiEventSignature, type AiProvider } from "@/lib/ai/provider";
import {
  type ClusterAssignmentCandidate,
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
import { invalidateFeedCache } from "@/lib/feed/cache";
import { getDisplaySummary, getDisplayTitle } from "@/lib/feed/presentation";
import { getIngestionRuntimeConfig } from "@/lib/settings/service";
import { createTaskAiUsageTracker } from "@/lib/tasks/ai-usage";
import { enqueueTaskRun, updateTaskRun } from "@/lib/tasks/service";

const CLUSTER_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;
const clusterAssignmentQueues = new Map<string, Promise<void>>();
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

type ItemWithSource = Item & { source: Source };
type ClusterAssignmentCoordinator = {
  exactMatches: Map<string, ClusterAssignmentCandidate | null>;
  recentCandidates: Map<string, { sinceMs: number; untilMs: number; candidates: ClusterAssignmentCandidate[] }>;
};

export function createClusterAssignmentCoordinator(): ClusterAssignmentCoordinator {
  return {
    exactMatches: new Map(),
    recentCandidates: new Map(),
  };
}

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

function normalizeStoredEventType(value: string | null | undefined): AiEventSignature["eventType"] {
  return value && EVENT_TYPES.has(value as NonNullable<AiEventSignature["eventType"]>)
    ? (value as NonNullable<AiEventSignature["eventType"]>)
    : null;
}

function getItemEventSignature(item: {
  eventType?: string | null;
  eventSubject?: string | null;
  eventAction?: string | null;
  eventObject?: string | null;
  eventDate?: string | null;
}): AiEventSignature | null {
  return {
    eventType: normalizeStoredEventType(item.eventType),
    eventSubject: item.eventSubject ?? null,
    eventAction: item.eventAction ?? null,
    eventObject: item.eventObject ?? null,
    eventDate: item.eventDate ?? null,
  };
}

function buildClusterFingerprintSeed(options: { eventSignature?: AiEventSignature | null }) {
  const signature = options.eventSignature;

  if (!signature?.eventSubject || !signature.eventObject) {
    return "";
  }

  const eventKind = signature.eventAction || signature.eventType;

  if (!eventKind) {
    return "";
  }

  return [
    signature.eventType || "",
    signature.eventSubject,
    signature.eventAction || "",
    signature.eventObject,
    signature.eventDate || "",
  ].join("|");
}

function buildCandidateRange(item: ItemWithSource) {
  return {
    since: new Date(item.publishedAt.getTime() - CLUSTER_LOOKBACK_MS),
    until: new Date(item.publishedAt.getTime() + CLUSTER_LOOKBACK_MS),
  };
}

function buildCandidateRangeKey(since: Date, until: Date) {
  return `${since.getTime()}:${until.getTime()}`;
}

function buildExactMatchKey(fingerprint: string, since: Date, until: Date) {
  return `${fingerprint}:${buildCandidateRangeKey(since, until)}`;
}

function toClusterAssignmentCandidate(cluster: {
  id: string;
  title: string;
  summary: string;
  fingerprint: string;
  latestPublishedAt: Date;
  itemCount?: number;
}): ClusterAssignmentCandidate {
  return {
    id: cluster.id,
    title: cluster.title,
    summary: cluster.summary,
    fingerprint: cluster.fingerprint,
    latestPublishedAt: cluster.latestPublishedAt,
    itemCount: cluster.itemCount ?? 1,
  };
}

function rememberRecentCandidate(
  coordinator: ClusterAssignmentCoordinator,
  candidate: ClusterAssignmentCandidate,
  publishedAt: Date,
) {
  for (const cached of coordinator.recentCandidates.values()) {
    if (publishedAt.getTime() < cached.sinceMs || publishedAt.getTime() > cached.untilMs) {
      continue;
    }

    cached.candidates = [candidate, ...cached.candidates.filter((entry) => entry.id !== candidate.id)]
      .sort((left, right) => right.latestPublishedAt.getTime() - left.latestPublishedAt.getTime());
  }
}

function buildEventSignatureLines(eventSignature?: AiEventSignature | null) {
  if (!eventSignature) {
    return [];
  }

  return [
    eventSignature.eventType ? `事件类型：${eventSignature.eventType}` : null,
    eventSignature.eventSubject ? `事件主体：${eventSignature.eventSubject}` : null,
    eventSignature.eventAction ? `事件动作：${eventSignature.eventAction}` : null,
    eventSignature.eventObject ? `关键对象：${eventSignature.eventObject}` : null,
    eventSignature.eventDate ? `事件日期：${eventSignature.eventDate}` : null,
  ].filter(Boolean);
}

function buildEventDisplayTitle(eventSignature?: AiEventSignature | null) {
  if (!eventSignature?.eventSubject || !eventSignature.eventObject) {
    return "";
  }

  const middle = eventSignature.eventAction || eventSignature.eventType || "";
  return [eventSignature.eventSubject, middle, eventSignature.eventObject].filter(Boolean).join(" ");
}

function buildClusterMatchInput(
  item: ItemWithSource,
  options: { eventSignature?: AiEventSignature | null },
): string {
  return [
    `标题：${getDisplayTitle(item.originalTitle, item.translatedTitle)}`,
    ...buildEventSignatureLines(options.eventSignature),
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

function shouldGenerateAiClusterSummary(clusterItems: ItemWithSource[], aiProvider?: AiProvider) {
  return Boolean(aiProvider) && clusterItems.length >= 2;
}

async function generateClusterPresentation(clusterItems: ItemWithSource[], existingTitle?: string, aiProvider?: AiProvider) {
  const fallback = buildClusterFallback(clusterItems, existingTitle);

  if (!shouldGenerateAiClusterSummary(clusterItems, aiProvider)) {
    return fallback;
  }

  const summaryProvider = aiProvider!;

  try {
    const summarySeed = clusterItems
      .map((item, index) =>
        [
          `候选 ${index + 1}`,
          `标题：${getDisplayTitle(item.originalTitle, item.translatedTitle)}`,
          buildItemSummary(item) ? `摘要：${buildItemSummary(item)}` : null,
          ...buildEventSignatureLines(getItemEventSignature(item)),
        ]
          .filter(Boolean)
          .join("\n"),
      )
      .join("\n");

    return {
      title: fallback.title,
      summary: (await summaryProvider.summarizeCluster(summarySeed, { title: fallback.title })) || fallback.summary,
    };
  } catch {
    return fallback;
  }
}

async function findClusterForItem(
  item: ItemWithSource,
  options: {
    eventSignature?: AiEventSignature | null;
    aiProvider?: AiProvider;
    coordinator?: ClusterAssignmentCoordinator;
  },
) {
  const fingerprintSeed = buildClusterFingerprintSeed(options);
  const fingerprint = fingerprintSeed ? normalizeFingerprint(fingerprintSeed) : "";
  const { since, until } = buildCandidateRange(item);
  const rangeKey = buildCandidateRangeKey(since, until);
  const exactMatchKey = fingerprint ? buildExactMatchKey(fingerprint, since, until) : "";
  let exactMatch = fingerprint ? options.coordinator?.exactMatches.get(exactMatchKey) : undefined;

  if (fingerprint && typeof exactMatch === "undefined") {
    exactMatch = await findActiveClusterByFingerprint(fingerprint, since, until);
    options.coordinator?.exactMatches.set(exactMatchKey, exactMatch ? toClusterAssignmentCandidate(exactMatch) : null);
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

function getClusterAssignmentWindowKeys(publishedAt: Date) {
  const bucketSizeMs = CLUSTER_LOOKBACK_MS;
  const currentBucket = Math.floor(publishedAt.getTime() / bucketSizeMs);

  return [currentBucket - 1, currentBucket, currentBucket + 1].map((bucket) => `window:${bucket}`);
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
  },
) {
  const item = await prisma.item.findUnique({
    where: { id: itemId },
    include: { source: true },
  });

  if (!item || (item.moderationStatus !== "allowed" && item.moderationStatus !== "restored")) {
    return null;
  }

  return runWithClusterAssignmentWindowLocks(getClusterAssignmentWindowKeys(item.publishedAt), async () => {
    const item = await prisma.item.findUnique({
      where: { id: itemId },
      include: { source: true },
    });

    if (!item || (item.moderationStatus !== "allowed" && item.moderationStatus !== "restored")) {
      return null;
    }

    const resolvedEventSignature = options.eventSignature ?? getItemEventSignature(item);
    const { cluster: matchedCluster, fingerprint } = await findClusterForItem(item, {
      ...options,
      eventSignature: resolvedEventSignature,
    });
    const eventDisplayTitle = buildEventDisplayTitle(resolvedEventSignature);
    const cluster =
      matchedCluster ??
      (await createContentCluster({
        fingerprint: fingerprint || `single-${item.id}`,
        title: eventDisplayTitle || getDisplayTitle(item.originalTitle, item.translatedTitle),
        summary: buildItemSummary(item),
        score: item.qualityScore,
        latestPublishedAt: item.publishedAt,
      }));

    if (options.coordinator) {
      const candidate = toClusterAssignmentCandidate(cluster);

      if (fingerprint) {
        const { since, until } = buildCandidateRange(item);
        options.coordinator.exactMatches.set(buildExactMatchKey(fingerprint, since, until), candidate);
      }

      rememberRecentCandidate(options.coordinator, candidate, item.publishedAt);
    }

    await setItemCluster(item.id, cluster.id);
    // Note: Cluster summary recomputation is now handled at batch level in executeIngestion

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
  const nextItemCount = cluster.items.length;
  const shouldSkipUpdate =
    cluster.title === presentation.title &&
    cluster.summary === presentation.summary &&
    cluster.score === score &&
    cluster.itemCount === nextItemCount &&
    cluster.latestPublishedAt.getTime() === latestPublishedAt.getTime();

  if (shouldSkipUpdate) {
    return cluster;
  }

  return updateClusterSummary(clusterId, {
    title: presentation.title,
    summary: presentation.summary,
    score,
    itemCount: nextItemCount,
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
  invalidateFeedCache();

  return previousClusterId;
}

export async function setClusterVisibility(clusterId: string, visible: boolean) {
  const cluster = await updateClusterStatus(clusterId, visible ? "active" : "hidden");
  invalidateFeedCache();
  return cluster;
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
    );

    await updateTaskRun(taskRun.id, {
      status: "succeeded",
      progressCurrent: 1,
      progressTotal: 1,
      progressLabel: "已完成聚合摘要重生成",
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
