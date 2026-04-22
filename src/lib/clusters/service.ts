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
import {
  normalizeEventActionForStorage,
  normalizeEventObjectForStorage,
  normalizeEventSignatureForMatch,
  normalizeEventSignatureForStorage,
  normalizeEventSubjectForStorage,
  normalizeStoredEventType,
} from "@/lib/clusters/normalization";
import { prisma } from "@/lib/db";
import { invalidateFeedCache } from "@/lib/feed/cache";
import { getDisplaySummary, getDisplayTitle } from "@/lib/feed/presentation";
import { getIngestionRuntimeConfig } from "@/lib/settings/service";
import { createTaskAiUsageTracker } from "@/lib/tasks/ai-usage";
import { enqueueTaskRun, updateTaskRun } from "@/lib/tasks/service";

const CLUSTER_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;
const CLUSTER_AI_CANDIDATE_LIMIT = 10;
const CLUSTER_DIRECT_MATCH_MIN_SCORE = 105;
const CLUSTER_DIRECT_MATCH_MIN_GAP = 20;
const CLUSTER_AI_MIN_SCORE = 35;
const clusterAssignmentQueues = new Map<string, Promise<void>>();

type ItemWithSource = Item & { source: Source };
type ClusterAssignmentCoordinator = {
  exactMatches: Map<string, ClusterAssignmentCandidate | null>;
  recentCandidates: Map<string, { sinceMs: number; untilMs: number; candidates: ClusterAssignmentCandidate[] }>;
};

export type ClusterAssignmentSource = "exact_match" | "cheap_rank_direct" | "ai_match";

export type ClusterAssignmentResult = {
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

function normalizeOptionalText(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed || null;
}

function normalizeComparableText(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function getItemEventSignature(item: {
  eventType?: string | null;
  eventSubject?: string | null;
  eventAction?: string | null;
  eventObject?: string | null;
  eventDate?: string | null;
}): AiEventSignature | null {
  return normalizeEventSignatureForStorage({
    eventType: normalizeStoredEventType(item.eventType),
    eventSubject: item.eventSubject ?? null,
    eventAction: item.eventAction ?? null,
    eventObject: item.eventObject ?? null,
    eventDate: item.eventDate ?? null,
  });
}

function getCandidateEventSignature(candidate: {
  eventType?: string | null;
  eventSubject?: string | null;
  eventAction?: string | null;
  eventObject?: string | null;
  eventDate?: string | null;
}): AiEventSignature {
  return normalizeEventSignatureForStorage({
    eventType: normalizeStoredEventType(candidate.eventType),
    eventSubject: normalizeOptionalText(candidate.eventSubject),
    eventAction: normalizeOptionalText(candidate.eventAction),
    eventObject: normalizeOptionalText(candidate.eventObject),
    eventDate: normalizeOptionalText(candidate.eventDate),
  }) ?? {
    eventType: null,
    eventSubject: null,
    eventAction: null,
    eventObject: null,
    eventDate: null,
  };
}

function buildClusterFingerprintSeed(options: { eventSignature?: AiEventSignature | null }) {
  const signature = normalizeEventSignatureForStorage(options.eventSignature);

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

function hasCompleteClusterMatchSignature(eventSignature?: AiEventSignature | null) {
  return Boolean(
    eventSignature?.eventSubject &&
      eventSignature.eventObject &&
      (eventSignature.eventAction || eventSignature.eventType),
  );
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
  eventType?: string | null;
  eventSubject?: string | null;
  eventAction?: string | null;
  eventObject?: string | null;
  eventDate?: string | null;
  latestPublishedAt: Date;
  itemCount?: number;
}): ClusterAssignmentCandidate {
  return {
    id: cluster.id,
    title: cluster.title,
    summary: cluster.summary,
    fingerprint: cluster.fingerprint,
    eventType: cluster.eventType ?? null,
    eventSubject: cluster.eventSubject ?? null,
    eventAction: cluster.eventAction ?? null,
    eventObject: cluster.eventObject ?? null,
    eventDate: cluster.eventDate ?? null,
    latestPublishedAt: cluster.latestPublishedAt,
    itemCount: cluster.itemCount ?? 1,
  };
}

function pickDominantSignatureValue<T extends string>(
  values: Array<{
    value: T | null;
    qualityScore: number;
    publishedAt: Date;
  }>,
) {
  const scoreMap = new Map<
    string,
    {
      value: T;
      count: number;
      bestQualityScore: number;
      latestPublishedAtMs: number;
    }
  >();

  for (const entry of values) {
    if (!entry.value) {
      continue;
    }

    const existing = scoreMap.get(entry.value);
    if (!existing) {
      scoreMap.set(entry.value, {
        value: entry.value,
        count: 1,
        bestQualityScore: entry.qualityScore,
        latestPublishedAtMs: entry.publishedAt.getTime(),
      });
      continue;
    }

    existing.count += 1;
    existing.bestQualityScore = Math.max(existing.bestQualityScore, entry.qualityScore);
    existing.latestPublishedAtMs = Math.max(existing.latestPublishedAtMs, entry.publishedAt.getTime());
  }

  return [...scoreMap.values()]
    .sort((left, right) => {
      if (right.count !== left.count) {
        return right.count - left.count;
      }
      if (right.bestQualityScore !== left.bestQualityScore) {
        return right.bestQualityScore - left.bestQualityScore;
      }
      return right.latestPublishedAtMs - left.latestPublishedAtMs;
    })[0]?.value ?? null;
}

function buildClusterEventSignature(clusterItems: ItemWithSource[]): AiEventSignature | null {
  const eventType = pickDominantSignatureValue(
    clusterItems.map((item) => ({
      value: normalizeStoredEventType(item.eventType),
      qualityScore: item.qualityScore,
      publishedAt: item.publishedAt,
    })),
  );
  const eventSubject = pickDominantSignatureValue(
    clusterItems.map((item) => ({
      value: normalizeEventSubjectForStorage(item.eventSubject),
      qualityScore: item.qualityScore,
      publishedAt: item.publishedAt,
    })),
  );
  const eventAction = pickDominantSignatureValue(
    clusterItems.map((item) => ({
      value: normalizeEventActionForStorage(item.eventAction),
      qualityScore: item.qualityScore,
      publishedAt: item.publishedAt,
    })),
  );
  const eventObject = pickDominantSignatureValue(
    clusterItems.map((item) => ({
      value: normalizeEventObjectForStorage(item.eventObject),
      qualityScore: item.qualityScore,
      publishedAt: item.publishedAt,
    })),
  );
  const eventDate = pickDominantSignatureValue(
    clusterItems.map((item) => ({
      value: normalizeOptionalText(item.eventDate),
      qualityScore: item.qualityScore,
      publishedAt: item.publishedAt,
    })),
  );

  if (!eventType && !eventSubject && !eventAction && !eventObject && !eventDate) {
    return null;
  }

  return normalizeEventSignatureForStorage({
    eventType,
    eventSubject,
    eventAction,
    eventObject,
    eventDate,
  });
}

function scoreClusterCandidate(
  item: ItemWithSource,
  eventSignature: AiEventSignature,
  candidate: ClusterAssignmentCandidate,
) {
  const candidateSignature = getCandidateEventSignature(candidate);
  const currentTitle = normalizeComparableText(getDisplayTitle(item.originalTitle, item.translatedTitle));
  const currentSummary = normalizeComparableText(buildItemSummary(item));
  const candidateTitle = normalizeComparableText(candidate.title);
  const candidateSummary = normalizeComparableText(candidate.summary);
  const normalizedCurrentSignature = normalizeEventSignatureForMatch(eventSignature);
  const normalizedCandidateSignature = normalizeEventSignatureForMatch(candidateSignature);
  const currentSubject = normalizeComparableText(normalizedCurrentSignature.eventSubject);
  const currentAction = normalizeComparableText(normalizedCurrentSignature.eventAction || normalizedCurrentSignature.eventType);
  const currentObject = normalizeComparableText(normalizedCurrentSignature.eventObject);
  const currentDate = normalizeComparableText(normalizedCurrentSignature.eventDate);
  const candidateSubject = normalizeComparableText(normalizedCandidateSignature.eventSubject);
  const candidateAction = normalizeComparableText(normalizedCandidateSignature.eventAction || normalizedCandidateSignature.eventType);
  const candidateObject = normalizeComparableText(normalizedCandidateSignature.eventObject);
  const candidateDate = normalizeComparableText(normalizedCandidateSignature.eventDate);

  let score = 0;
  const subjectExact = Boolean(currentSubject && candidateSubject && currentSubject === candidateSubject);
  const actionExact = Boolean(currentAction && candidateAction && currentAction === candidateAction);
  const objectExact = Boolean(currentObject && candidateObject && currentObject === candidateObject);
  const dateExact = Boolean(currentDate && candidateDate && currentDate === candidateDate);

  if (subjectExact) {
    score += 45;
  } else if (currentSubject && candidateSubject) {
    score -= 30;
  } else if (currentSubject && (candidateTitle.includes(currentSubject) || candidateSummary.includes(currentSubject))) {
    score += 18;
  }

  if (objectExact) {
    score += 40;
  } else if (currentObject && candidateObject) {
    score -= 18;
  } else if (currentObject && (candidateTitle.includes(currentObject) || candidateSummary.includes(currentObject))) {
    score += 15;
  } else if (currentObject && (currentTitle.includes(candidateObject) || currentSummary.includes(candidateObject))) {
    score += 8;
  }

  if (actionExact) {
    score += 20;
  } else if (currentAction && candidateAction) {
    score -= 10;
  }

  if (
    normalizedCurrentSignature.eventType &&
    normalizedCandidateSignature.eventType &&
    normalizedCurrentSignature.eventType === normalizedCandidateSignature.eventType
  ) {
    score += 12;
  }

  if (dateExact) {
    score += 15;
  } else if (currentDate && candidateDate) {
    score -= 25;
  }

  const publishedAtDiffMs = Math.abs(item.publishedAt.getTime() - candidate.latestPublishedAt.getTime());
  if (publishedAtDiffMs <= 24 * 60 * 60 * 1000) {
    score += 8;
  } else if (publishedAtDiffMs <= 72 * 60 * 60 * 1000) {
    score += 4;
  }

  return {
    candidate,
    score,
    strongMatch:
      subjectExact &&
      objectExact &&
      Boolean(actionExact || normalizedCurrentSignature.eventType === normalizedCandidateSignature.eventType),
  };
}

function rankClusterCandidates(
  item: ItemWithSource,
  eventSignature: AiEventSignature,
  candidates: ClusterAssignmentCandidate[],
) {
  return candidates
    .map((candidate) => scoreClusterCandidate(item, eventSignature, candidate))
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return right.candidate.latestPublishedAt.getTime() - left.candidate.latestPublishedAt.getTime();
    });
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
    return {
      ...fallback,
      summaryAttempted: false,
      summarySucceeded: false,
    };
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
      summaryAttempted: true,
      summarySucceeded: true,
    };
  } catch {
    return {
      ...fallback,
      summaryAttempted: true,
      summarySucceeded: false,
    };
  }
}

async function findClusterForItem(
  item: ItemWithSource,
  options: {
    eventSignature?: AiEventSignature | null;
    aiProvider?: AiProvider;
    coordinator?: ClusterAssignmentCoordinator;
  },
): Promise<{
  cluster: ClusterAssignmentCandidate | null;
  fingerprint: string;
  matchSource: ClusterAssignmentSource | null;
  skippedIncompleteSignature: boolean;
}> {
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

  if (exactMatch) {
    return {
      cluster: exactMatch,
      fingerprint,
      matchSource: "exact_match" as const,
      skippedIncompleteSignature: false,
    };
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
    return {
      clusterId: null,
      matchSource: null,
      skippedIncompleteSignature: false,
      createdNewCluster: false,
    } satisfies ClusterAssignmentResult;
  }

  return runWithClusterAssignmentWindowLocks(getClusterAssignmentWindowKeys(item.publishedAt), async () => {
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
    const { cluster: matchedCluster, fingerprint, matchSource, skippedIncompleteSignature } =
      await findClusterForItem(item, {
      ...options,
      eventSignature: resolvedEventSignature,
    });
    const eventDisplayTitle = buildEventDisplayTitle(resolvedEventSignature);
    const createdNewCluster = !matchedCluster;
    const cluster =
      matchedCluster ??
      (await createContentCluster({
        fingerprint: fingerprint || `single-${item.id}`,
        title: eventDisplayTitle || getDisplayTitle(item.originalTitle, item.translatedTitle),
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
        const { since, until } = buildCandidateRange(item);
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

export async function recomputeCluster(clusterId: string, aiProvider?: AiProvider) {
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

  const presentation = await generateClusterPresentation(cluster.items, cluster.title, aiProvider);
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
    cluster.eventDate === (eventSignature?.eventDate ?? null);

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

export async function moveItemToCluster(itemId: string, clusterId: string, aiProvider?: AiProvider) {
  const [item, targetCluster] = await Promise.all([
    prisma.item.findUnique({
      where: { id: itemId },
      select: {
        id: true,
        clusterId: true,
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
    return clusterId;
  }

  const previousClusterId = item.clusterId;
  await setItemCluster(itemId, clusterId);
  await recomputeCluster(clusterId, aiProvider);

  if (previousClusterId) {
    await recomputeCluster(previousClusterId, aiProvider);
  }

  invalidateFeedCache();

  return clusterId;
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
