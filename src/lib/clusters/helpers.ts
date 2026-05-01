import crypto from "node:crypto";

import type { Item, Source } from "@prisma/client";

import {
  CLUSTER_MERGE_AI_PAIR_GRAY_SCORE,
  CLUSTER_MERGE_AI_PAIR_MIN_SCORE,
  CLUSTER_MERGE_AI_PAIR_STRONG_SCORE,
  CLUSTER_MERGE_CANDIDATE_LIMIT,
  CLUSTER_MERGE_RELATED_PAIR_LIMIT,
  CLUSTER_MERGE_TARGET_CANDIDATE_COUNT,
} from "@/config/constants";
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
    const recovered = parseMalformedClusterPresentationOutput(normalized, fallback);
    if (recovered) {
      return recovered;
    }

    if (looksLikeClusterPresentationJson(normalized)) {
      return fallback;
    }

    return {
      title: fallback.title,
      summary: normalized || fallback.summary,
    };
  }
}

function looksLikeClusterPresentationJson(value: string) {
  return /"?title"?\s*:/i.test(value) || /"?summary"?\s*:/i.test(value);
}

function parseMalformedClusterPresentationOutput(
  value: string,
  fallback: { title: string; summary: string },
) {
  const titleMatch = value.match(/"?title"?\s*:\s*"([\s\S]*?)"\s*,?\s*"?summary"?\s*:/i);
  const summaryKeyMatch = value.match(/"?summary"?\s*:\s*"/i);

  if (!summaryKeyMatch) {
    return null;
  }

  const summaryStart = summaryKeyMatch.index! + summaryKeyMatch[0].length;
  const summaryEndMatch = value.slice(summaryStart).match(/"\s*}\s*$/);
  const summaryEnd = summaryEndMatch?.index;

  if (summaryEnd == null) {
    return null;
  }

  const summary = value.slice(summaryStart, summaryStart + summaryEnd).trim();

  if (!summary) {
    return null;
  }

  return {
    title: normalizePresentationTitle(titleMatch?.[1], fallback.title),
    summary,
  };
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

type ClusterMergeInputHashSeed = {
  id: string;
  fingerprint: string;
  title?: string | null;
  summary?: string | null;
  eventType?: string | null;
  eventSubject?: string | null;
  eventAction?: string | null;
  eventObject?: string | null;
  eventDate?: string | null;
  itemCount: number;
  latestPublishedAt: Date;
};

function buildClusterMergeInputHashPayload(c: ClusterMergeInputHashSeed) {
  return {
    id: c.id,
    fingerprint: c.fingerprint,
    title: c.title ?? null,
    summary: c.summary ?? null,
    eventType: c.eventType ?? null,
    eventSubject: c.eventSubject ?? null,
    eventAction: c.eventAction ?? null,
    eventObject: c.eventObject ?? null,
    eventDate: c.eventDate ?? null,
    itemCount: c.itemCount,
    latestPublishedAt: c.latestPublishedAt.getTime(),
  };
}

export function buildClusterMergeCandidateInputHash(cluster: ClusterMergeInputHashSeed): string {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(buildClusterMergeInputHashPayload(cluster)))
    .digest("hex");
}

export function buildClusterMergeInputHash(clusters: ClusterMergeInputHashSeed[]): string {
  const sorted = [...clusters].sort((a, b) => a.id.localeCompare(b.id));
  const payload = sorted.map(buildClusterMergeInputHashPayload);

  return crypto
    .createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex");
}

export type ClusterMergeCandidate = {
  id: string;
  title: string;
  summary: string;
  fingerprint: string;
  mergeInputHash?: string | null;
  eventType: string | null;
  eventSubject: string | null;
  eventAction: string | null;
  eventObject: string | null;
  eventDate: string | null;
  itemCount: number;
  latestPublishedAt: Date;
};

function tokenizeMergeText(value: string | null | undefined) {
  const normalized = normalizeComparableText(value);
  const words = normalized.match(/[a-z0-9]+|[\u4e00-\u9fff]+/g) ?? [];
  const tokens = new Set<string>();

  for (const word of words) {
    if (/^[\u4e00-\u9fff]+$/u.test(word)) {
      if (word.length <= 2) {
        tokens.add(word);
        continue;
      }

      for (let index = 0; index < word.length - 1; index += 1) {
        tokens.add(word.slice(index, index + 2));
      }
      continue;
    }

    if (word.length >= 2) {
      tokens.add(word);
    }
  }

  return tokens;
}

function countTokenOverlap(left: Set<string>, right: Set<string>) {
  let overlap = 0;

  for (const token of left) {
    if (right.has(token)) {
      overlap += 1;
    }
  }

  return overlap;
}

function textSimilarity(left: string | null | undefined, right: string | null | undefined) {
  const leftText = normalizeComparableText(left);
  const rightText = normalizeComparableText(right);

  if (!leftText || !rightText) {
    return {
      exact: false,
      similar: false,
      strong: false,
      overlap: 0,
    };
  }

  if (leftText === rightText) {
    return {
      exact: true,
      similar: true,
      strong: true,
      overlap: Math.max(1, tokenizeMergeText(leftText).size),
    };
  }

  const includes = leftText.includes(rightText) || rightText.includes(leftText);
  const leftTokens = tokenizeMergeText(leftText);
  const rightTokens = tokenizeMergeText(rightText);
  const overlap = countTokenOverlap(leftTokens, rightTokens);
  const strongOverlap = overlap >= 2;
  const weakOverlap = overlap >= 1 && (leftTokens.size <= 2 || rightTokens.size <= 2);

  return {
    exact: false,
    similar: includes || strongOverlap || weakOverlap,
    strong: includes || strongOverlap,
    overlap,
  };
}

function buildMergeTextBlob(candidate: ClusterMergeCandidate) {
  return [
    candidate.title,
    candidate.summary,
    candidate.eventSubject,
    candidate.eventObject,
  ]
    .filter(Boolean)
    .join(" ");
}

const RELATIONAL_OBJECT_TOKENS = new Set(["合同", "协议", "合作", "交易", "收购", "融资", "投资", "诉讼", "政策"]);
const COMMON_MERGE_TOKENS = new Set([
  "发布",
  "推出",
  "上线",
  "更新",
  "变更",
  "调整",
  "宣布",
  "报道",
  "消息",
  "产品",
  "功能",
  "服务",
  "平台",
  "公司",
  "新闻",
  "内容",
  "new",
  "launch",
  "launched",
  "release",
  "released",
  "update",
  "updates",
  "announces",
  "announced",
]);

function hasRelationalObjectOverlap(left: string | null, right: string | null) {
  if (!left || !right) {
    return false;
  }

  const leftTokens = tokenizeMergeText(left);
  const rightTokens = tokenizeMergeText(right);

  for (const token of leftTokens) {
    if (rightTokens.has(token) && RELATIONAL_OBJECT_TOKENS.has(token)) {
      return true;
    }
  }

  return false;
}

function buildExcludedMergeTokens(values: Array<string | null | undefined>) {
  const tokens = new Set<string>(COMMON_MERGE_TOKENS);

  for (const value of values) {
    for (const token of tokenizeMergeText(value)) {
      tokens.add(token);
    }
  }

  return tokens;
}

function countDistinctiveTextOverlap(
  left: ClusterMergeCandidate,
  right: ClusterMergeCandidate,
  excludedTokens: Set<string>,
) {
  const leftTokens = tokenizeMergeText(buildMergeTextBlob(left));
  const rightTokens = tokenizeMergeText(buildMergeTextBlob(right));
  let overlap = 0;

  for (const token of leftTokens) {
    if (!excludedTokens.has(token) && rightTokens.has(token)) {
      overlap += 1;
    }
  }

  return overlap;
}

type ClusterMergePairRejectionReason = "object_conflict" | "date_conflict" | "no_event_anchor";

type ClusterMergePairScore = {
  rejected: boolean;
  rejectedReason: ClusterMergePairRejectionReason | null;
  score: number;
  softObjectConflict: boolean;
};

export type ClusterMergeCandidateDiagnostics = {
  totalPairs: number;
  rejectedObjectConflict: number;
  rejectedDateConflict: number;
  rejectedNoEventAnchor: number;
  belowGrayScore: number;
  relatedPairs: number;
  aiEligiblePairs: number;
  cleanPairsSkipped: number;
  dirtyPairs: number;
  softObjectConflictPairs: number;
  softObjectConflictSelectedPairs: number;
  softObjectConflictCleanPairsSkipped: number;
  preLimitCandidates: number;
  postLimitCandidates: number;
  dirtyCandidateCount: number;
};

function createClusterMergeCandidateDiagnostics(): ClusterMergeCandidateDiagnostics {
  return {
    totalPairs: 0,
    rejectedObjectConflict: 0,
    rejectedDateConflict: 0,
    rejectedNoEventAnchor: 0,
    belowGrayScore: 0,
    relatedPairs: 0,
    aiEligiblePairs: 0,
    cleanPairsSkipped: 0,
    dirtyPairs: 0,
    softObjectConflictPairs: 0,
    softObjectConflictSelectedPairs: 0,
    softObjectConflictCleanPairsSkipped: 0,
    preLimitCandidates: 0,
    postLimitCandidates: 0,
    dirtyCandidateCount: 0,
  };
}

function scoreClusterMergePair(left: ClusterMergeCandidate, right: ClusterMergeCandidate): ClusterMergePairScore {
  const leftSubject = normalizeEventSubjectForStorage(left.eventSubject);
  const rightSubject = normalizeEventSubjectForStorage(right.eventSubject);
  const leftAction = normalizeEventActionForStorage(left.eventAction) ?? normalizeStoredEventType(left.eventType);
  const rightAction = normalizeEventActionForStorage(right.eventAction) ?? normalizeStoredEventType(right.eventType);
  const leftObject = normalizeEventObjectForStorage(left.eventObject);
  const rightObject = normalizeEventObjectForStorage(right.eventObject);
  const subjectSimilarity = textSimilarity(leftSubject, rightSubject);
  const objectSimilarity = textSimilarity(leftObject, rightObject);
  const textOverlap = textSimilarity(buildMergeTextBlob(left), buildMergeTextBlob(right));
  const relationalObjectOverlap = hasRelationalObjectOverlap(leftObject, rightObject);
  const excludedMergeTokens = buildExcludedMergeTokens([leftSubject, rightSubject, leftAction, rightAction]);
  const distinctiveTextOverlapCount = countDistinctiveTextOverlap(
    left,
    right,
    excludedMergeTokens,
  );
  const distinctiveTextOverlap = distinctiveTextOverlapCount > 0;
  const hasSoftObjectAnchor =
    subjectSimilarity.similar &&
    textOverlap.strong &&
    distinctiveTextOverlapCount >= 2;
  const hasObjectConflict = Boolean(leftObject && rightObject && !objectSimilarity.strong && !relationalObjectOverlap);

  if (hasObjectConflict && !hasSoftObjectAnchor) {
    return {
      rejected: true,
      rejectedReason: "object_conflict",
      score: 0,
      softObjectConflict: false,
    };
  }

  if (left.eventDate && right.eventDate && left.eventDate !== right.eventDate) {
    return {
      rejected: true,
      rejectedReason: "date_conflict",
      score: 0,
      softObjectConflict: false,
    };
  }

  let score = 0;

  if (subjectSimilarity.similar) {
    score += 35;
  }

  if (objectSimilarity.similar) {
    score += 40;
  }

  if (leftAction && rightAction && leftAction === rightAction) {
    score += 20;
  } else if (left.eventType && right.eventType && left.eventType === right.eventType) {
    score += 12;
  }

  if (left.eventDate && right.eventDate && left.eventDate === right.eventDate) {
    score += 15;
  }

  if (textOverlap.strong) {
    score += 20;
  } else if (textOverlap.similar) {
    score += 8;
  }

  const publishedAtDiffMs = Math.abs(left.latestPublishedAt.getTime() - right.latestPublishedAt.getTime());
  if (publishedAtDiffMs <= 24 * 60 * 60 * 1000) {
    score += 8;
  } else if (publishedAtDiffMs <= 72 * 60 * 60 * 1000) {
    score += 4;
  }

  const hasEventAnchor = objectSimilarity.similar || distinctiveTextOverlap || (hasObjectConflict && hasSoftObjectAnchor);
  if (!hasEventAnchor) {
    return {
      rejected: true,
      rejectedReason: "no_event_anchor",
      score,
      softObjectConflict: false,
    };
  }

  return {
    rejected: false,
    rejectedReason: null,
    score,
    softObjectConflict: hasObjectConflict,
  };
}

function shouldSendMergePairToAi(score: number, relatedPairCount: number) {
  if (score >= CLUSTER_MERGE_AI_PAIR_STRONG_SCORE) {
    return true;
  }

  if (score >= CLUSTER_MERGE_AI_PAIR_MIN_SCORE) {
    return true;
  }

  return score >= CLUSTER_MERGE_AI_PAIR_GRAY_SCORE && relatedPairCount <= 2;
}

function incrementClusterMergeRejection(
  diagnostics: ClusterMergeCandidateDiagnostics,
  reason: ClusterMergePairRejectionReason | null,
) {
  switch (reason) {
    case "object_conflict":
      diagnostics.rejectedObjectConflict += 1;
      break;
    case "date_conflict":
      diagnostics.rejectedDateConflict += 1;
      break;
    case "no_event_anchor":
      diagnostics.rejectedNoEventAnchor += 1;
      break;
    default:
      break;
  }
}

export function buildClusterMergeCandidateSelection(clusters: ClusterMergeCandidate[]) {
  const selectedIds = new Set<string>();
  const bestScores = new Map<string, number>();
  const currentInputHashes = new Map(
    clusters.map((cluster) => [cluster.id, buildClusterMergeCandidateInputHash(cluster)]),
  );
  const dirtyIds = new Set(
    clusters
      .filter((cluster) => cluster.mergeInputHash !== currentInputHashes.get(cluster.id))
      .map((cluster) => cluster.id),
  );
  const diagnostics = createClusterMergeCandidateDiagnostics();
  const softObjectConflictPairs: Array<{
    left: ClusterMergeCandidate;
    right: ClusterMergeCandidate;
    score: number;
  }> = [];

  for (let leftIndex = 0; leftIndex < clusters.length; leftIndex += 1) {
    const left = clusters[leftIndex]!;
    const relatedPairs: Array<{ right: ClusterMergeCandidate; score: number }> = [];

    for (let rightIndex = 0; rightIndex < clusters.length; rightIndex += 1) {
      if (leftIndex === rightIndex) {
        continue;
      }

      const right = clusters[rightIndex]!;
      const result = scoreClusterMergePair(left, right);
      diagnostics.totalPairs += 1;

      if (result.rejected) {
        incrementClusterMergeRejection(diagnostics, result.rejectedReason);
        continue;
      }

      if (result.score < CLUSTER_MERGE_AI_PAIR_GRAY_SCORE) {
        diagnostics.belowGrayScore += 1;
        continue;
      }

      if (result.softObjectConflict) {
        diagnostics.softObjectConflictPairs += 1;
        softObjectConflictPairs.push({ left, right, score: result.score });
        continue;
      }

      if (result.score >= CLUSTER_MERGE_AI_PAIR_GRAY_SCORE) {
        diagnostics.relatedPairs += 1;
        relatedPairs.push({ right, score: result.score });
      }
    }

    for (const pair of relatedPairs
      .sort((left, right) => {
        if (right.score !== left.score) {
          return right.score - left.score;
        }

        return right.right.latestPublishedAt.getTime() - left.right.latestPublishedAt.getTime();
      })
      .filter((pair) => shouldSendMergePairToAi(pair.score, relatedPairs.length))
      .slice(0, CLUSTER_MERGE_RELATED_PAIR_LIMIT)) {
      const leftChanged = left.mergeInputHash !== currentInputHashes.get(left.id);
      const rightChanged = pair.right.mergeInputHash !== currentInputHashes.get(pair.right.id);
      diagnostics.aiEligiblePairs += 1;

      if (!leftChanged && !rightChanged) {
        diagnostics.cleanPairsSkipped += 1;
        continue;
      }

      diagnostics.dirtyPairs += 1;
      selectedIds.add(left.id);
      selectedIds.add(pair.right.id);
      bestScores.set(left.id, Math.max(bestScores.get(left.id) ?? 0, pair.score));
      bestScores.set(pair.right.id, Math.max(bestScores.get(pair.right.id) ?? 0, pair.score));
    }
  }

  if (selectedIds.size < CLUSTER_MERGE_TARGET_CANDIDATE_COUNT) {
    const sortedSoftPairs = softObjectConflictPairs
      .sort((left, right) => {
        const leftDirty = dirtyIds.has(left.left.id) || dirtyIds.has(left.right.id) ? 1 : 0;
        const rightDirty = dirtyIds.has(right.left.id) || dirtyIds.has(right.right.id) ? 1 : 0;

        if (rightDirty !== leftDirty) {
          return rightDirty - leftDirty;
        }

        if (right.score !== left.score) {
          return right.score - left.score;
        }

        return Math.max(right.left.latestPublishedAt.getTime(), right.right.latestPublishedAt.getTime()) -
          Math.max(left.left.latestPublishedAt.getTime(), left.right.latestPublishedAt.getTime());
      });

    for (const pair of sortedSoftPairs) {
      if (selectedIds.size >= CLUSTER_MERGE_TARGET_CANDIDATE_COUNT) {
        break;
      }

      const leftChanged = pair.left.mergeInputHash !== currentInputHashes.get(pair.left.id);
      const rightChanged = pair.right.mergeInputHash !== currentInputHashes.get(pair.right.id);

      if (!leftChanged && !rightChanged) {
        diagnostics.softObjectConflictCleanPairsSkipped += 1;
        continue;
      }

      diagnostics.dirtyPairs += 1;
      diagnostics.softObjectConflictSelectedPairs += 1;
      selectedIds.add(pair.left.id);
      selectedIds.add(pair.right.id);
      bestScores.set(pair.left.id, Math.max(bestScores.get(pair.left.id) ?? 0, pair.score));
      bestScores.set(pair.right.id, Math.max(bestScores.get(pair.right.id) ?? 0, pair.score));
    }
  }

  const candidates = clusters
    .filter((cluster) => selectedIds.has(cluster.id))
    .sort((left, right) => {
      const leftDirty = dirtyIds.has(left.id) ? 1 : 0;
      const rightDirty = dirtyIds.has(right.id) ? 1 : 0;
      const leftBestScore = bestScores.get(left.id) ?? 0;
      const rightBestScore = bestScores.get(right.id) ?? 0;

      if (rightDirty !== leftDirty) {
        return rightDirty - leftDirty;
      }

      if (rightBestScore !== leftBestScore) {
        return rightBestScore - leftBestScore;
      }

      if (right.itemCount !== left.itemCount) {
        return right.itemCount - left.itemCount;
      }

      return right.latestPublishedAt.getTime() - left.latestPublishedAt.getTime();
    });
  diagnostics.preLimitCandidates = candidates.length;
  diagnostics.dirtyCandidateCount = candidates.filter((candidate) => dirtyIds.has(candidate.id)).length;

  const limitedCandidates = candidates.slice(0, CLUSTER_MERGE_CANDIDATE_LIMIT);
  diagnostics.postLimitCandidates = limitedCandidates.length;

  return {
    candidates: limitedCandidates,
    diagnostics,
  };
}

export function buildClusterMergeCandidates(clusters: ClusterMergeCandidate[]) {
  return buildClusterMergeCandidateSelection(clusters).candidates;
}

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
