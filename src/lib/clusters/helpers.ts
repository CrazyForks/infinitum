import crypto from "node:crypto";

import type { Item, Source } from "@prisma/client";

import { type AiEventSignature, type AiProvider } from "@/lib/ai/provider";
import { shouldRegenerateChineseSummary } from "@/lib/ai/summary-language";
import type { ClusterAssignmentCandidate } from "@/lib/clusters/repository";
import {
  normalizeEventActionForStorage,
  normalizeEventObjectForStorage,
  normalizeEventSignatureForMatch,
  normalizeEventSignatureForStorage,
  normalizeEventSubjectForStorage,
  normalizeStoredEventType,
} from "@/lib/clusters/normalization";
import { getDisplaySummary, getDisplayTitle } from "@/lib/feed/presentation";

export type ItemWithSource = Item & { source: Source };

export type ClusterAssignmentCoordinator = {
  exactMatches: Map<string, ClusterAssignmentCandidate | null>;
  recentCandidates: Map<string, { sinceMs: number; untilMs: number; candidates: ClusterAssignmentCandidate[] }>;
};

export function createClusterAssignmentCoordinator(): ClusterAssignmentCoordinator {
  return {
    exactMatches: new Map(),
    recentCandidates: new Map(),
  };
}

export function normalizeFingerprint(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

export function buildItemSummary(item: ItemWithSource): string {
  return getDisplaySummary(item.summaryText, item.rssExcerpt, item.fullText ?? item.rssContent);
}

function normalizeOptionalText(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed || null;
}

function normalizeComparableText(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

export function getItemEventSignature(item: {
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

export function buildClusterFingerprintSeed(options: { eventSignature?: AiEventSignature | null }) {
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

export function hasCompleteClusterMatchSignature(eventSignature?: AiEventSignature | null) {
  return Boolean(
    eventSignature?.eventSubject &&
      eventSignature.eventObject &&
      (eventSignature.eventAction || eventSignature.eventType),
  );
}

export function buildCandidateRange(item: ItemWithSource, lookbackMs: number) {
  return {
    since: new Date(item.publishedAt.getTime() - lookbackMs),
    until: new Date(item.publishedAt.getTime() + lookbackMs),
  };
}

export function buildCandidateRangeKey(since: Date, until: Date) {
  return `${since.getTime()}:${until.getTime()}`;
}

export function buildExactMatchKey(fingerprint: string, since: Date, until: Date) {
  return `${fingerprint}:${buildCandidateRangeKey(since, until)}`;
}

export function toClusterAssignmentCandidate(cluster: {
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

export function buildClusterEventSignature(clusterItems: ItemWithSource[]): AiEventSignature | null {
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

export function rankClusterCandidates(
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

export function rememberRecentCandidate(
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

export function buildEventDisplayTitle(eventSignature?: AiEventSignature | null) {
  if (!eventSignature?.eventSubject || !eventSignature.eventObject) {
    return "";
  }

  const middle = eventSignature.eventAction || eventSignature.eventType || "";
  return [eventSignature.eventSubject, middle, eventSignature.eventObject].filter(Boolean).join(" ");
}

export function buildClusterMatchInput(
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

function stripPresentationCodeFence(value: string): string {
  return value.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
}

function normalizePresentationTitle(value: string | null | undefined, fallback: string) {
  const title = value
    ?.replace(/[\r\n]+/g, " ")
    .replace(/^#+\s*/, "")
    .trim();

  return title || fallback;
}

function parseClusterPresentationOutput(
  rawContent: string | null | undefined,
  fallback: { title: string; summary: string },
) {
  const normalized = stripPresentationCodeFence(rawContent ?? "");

  if (!normalized) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(normalized) as {
      title?: string | null;
      summary?: string | null;
    };

    return {
      title: normalizePresentationTitle(parsed.title, fallback.title),
      summary: parsed.summary?.trim() || fallback.summary,
    };
  } catch {
    return {
      title: fallback.title,
      summary: normalized || fallback.summary,
    };
  }
}

function shouldGenerateAiClusterSummary(clusterItems: ItemWithSource[], aiProvider?: AiProvider) {
  return Boolean(aiProvider) && clusterItems.length >= 2;
}

function buildClusterSummarySeed(clusterItems: ItemWithSource[]) {
  return clusterItems
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
}

export function buildClusterSummaryInputHash(clusterItems: ItemWithSource[]) {
  const seed = buildClusterSummarySeed(clusterItems);

  return crypto
    .createHash("sha256")
    .update(JSON.stringify({ seed }))
    .digest("hex");
}

export async function generateClusterPresentation(
  clusterItems: ItemWithSource[],
  existingTitle?: string,
  aiProvider?: AiProvider,
) {
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
    const summarySeed = buildClusterSummarySeed(clusterItems);

    let aiPresentation = parseClusterPresentationOutput(
      await summaryProvider.summarizeCluster(summarySeed, { title: fallback.title }),
      fallback,
    );
    if (shouldRegenerateChineseSummary(aiPresentation.summary)) {
      aiPresentation = parseClusterPresentationOutput(
        await summaryProvider.summarizeCluster(summarySeed, { title: fallback.title }),
        fallback,
      );
    }
    const useAiPresentation =
      Boolean(aiPresentation.summary.trim()) &&
      (aiPresentation.title !== fallback.title || aiPresentation.summary !== fallback.summary);

    return {
      title: useAiPresentation ? aiPresentation.title : fallback.title,
      summary: useAiPresentation ? aiPresentation.summary : fallback.summary,
      summaryAttempted: true,
      summarySucceeded: useAiPresentation,
    };
  } catch {
    return {
      ...fallback,
      summaryAttempted: true,
      summarySucceeded: false,
    };
  }
}

export function buildClusterMergeInputHash(
  clusters: Array<{ id: string; fingerprint: string; itemCount: number; latestPublishedAt: Date }>,
): string {
  const sorted = [...clusters].sort((a, b) => a.id.localeCompare(b.id));
  const payload = sorted.map((c) => ({
    id: c.id,
    fingerprint: c.fingerprint,
    itemCount: c.itemCount,
    latestPublishedAt: c.latestPublishedAt.getTime(),
  }));

  return crypto
    .createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex");
}

export type ClusterMergeCandidate = {
  id: string;
  title: string;
  summary: string;
  eventType: string | null;
  eventSubject: string | null;
  eventAction: string | null;
  eventObject: string | null;
  eventDate: string | null;
  itemCount: number;
};

export function buildClusterMergeInput(clusters: ClusterMergeCandidate[]): string {
  return JSON.stringify(
    clusters.map((c) => ({
      id: c.id,
      title: c.title,
      summary: c.summary,
      eventType: c.eventType,
      eventSubject: c.eventSubject,
      eventAction: c.eventAction,
      eventObject: c.eventObject,
      eventDate: c.eventDate,
      itemCount: c.itemCount,
    })),
  );
}

export function getClusterAssignmentWindowKeys(publishedAt: Date, lookbackMs: number) {
  const currentBucket = Math.floor(publishedAt.getTime() / lookbackMs);

  return [currentBucket - 1, currentBucket, currentBucket + 1].map((bucket) => `window:${bucket}`);
}
