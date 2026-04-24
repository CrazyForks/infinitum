import type { AiEventSignature } from "@/lib/ai/provider";
import type { ClusterAssignmentCoordinator } from "@/lib/clusters/helpers";
import { assignItemToCluster } from "@/lib/clusters/service";
import {
  findExistingItem,
  upsertItem,
} from "@/lib/feed/repository";
import { shouldTranslateTitle, stripHtmlTags } from "@/lib/feed/presentation";
import { buildDedupeKeys, shouldFetchFullText } from "@/lib/ingestion/dedupe";
import { findBlacklistMatch } from "@/lib/ingestion/filtering";
import type {
  ParsedFeedItem,
  ProcessedItemRecord,
  RunIngestionOptions,
} from "@/lib/ingestion/types";

export type PreparedFeedItem = {
  item: ParsedFeedItem;
  sourceId: string;
  sourceName: string;
  aiParsingEnabled: boolean;
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

export function deriveSourceConcurrency(itemConcurrency: number) {
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

function hasSucceededSummary(existing?: {
  summaryStatus?: string | null;
  summaryText?: string | null;
} | null) {
  return existing?.summaryStatus === "succeeded" && Boolean(stripHtmlTags(existing.summaryText));
}

function hasSucceededAnalysis(existing?: {
  analysisStatus?: string | null;
} | null) {
  return existing?.analysisStatus === "succeeded";
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

export function willRequireAiAnalysis(preparedItem: PreparedFeedItem, blacklist: string[]) {
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

export async function processFeedItem({
  item,
  sourceId,
  sourceName,
  aiParsingEnabled,
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
  aiParsingEnabled: boolean;
  blacklist: string[];
  articleFetcher: RunIngestionOptions["articleFetcher"];
  aiProvider: RunIngestionOptions["aiProvider"];
  clusterAssignmentCoordinator: ClusterAssignmentCoordinator;
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
  let summaryStatus: "pending" | "succeeded" | "failed" = existing?.summaryStatus === "succeeded" || existing?.summaryStatus === "failed"
    ? existing.summaryStatus
    : "pending";
  let analysisStatus: "pending" | "succeeded" | "failed" = existing?.analysisStatus === "succeeded" || existing?.analysisStatus === "failed"
    ? existing.analysisStatus
    : "pending";
  let filterReason: string | null = existing?.filterReason ?? null;
  let moderationStatus = existing?.moderationStatus ?? "allowed";
  let moderationReason = existing?.moderationReason ?? null;
  let moderationDetail = existing?.moderationDetail ?? null;
  let qualityScore = existing?.qualityScore ?? 50;
  let qualityRationale = existing?.qualityRationale ?? "AI analysis unavailable";
  let eventSignature: AiEventSignature | null = readStoredEventSignature(existing);
  let fullTextFetched = false;
  let summaryCompleted = false;
  let summaryFailed = false;
  let analysisCompleted = false;
  const issues: string[] = [];
  const contentForFullTextDecision = fullText || rssContent || rssExcerpt || "";
  const canReuseExistingAnalysis = Boolean(
    existing &&
      !analysisInputsChanged &&
      hasSucceededSummary(existing) &&
      hasSucceededAnalysis(existing) &&
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
        summaryStatus: "pending",
        analysisStatus: "pending",
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
        aiProcessedAt: null,
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
      metrics: {
        blacklistFiltered: true,
      },
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
        summaryStatus,
        analysisStatus,
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

    return {
      id: stored.id,
      status: stored.status,
      isNew,
      fullTextFetched,
      metrics: {
        reusedExisting: true,
      },
    };
  }

  if (!fullText && shouldFetchFullText(contentForFullTextDecision, aiParsingEnabled, fullTextFetchThreshold)) {
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
    summaryStatus = "pending";
    analysisStatus = "pending";
    filterReason = filterMatch;
    moderationStatus = "filtered";
    moderationReason = "rule_blacklist";
    moderationDetail = `Matched blacklist keyword: ${filterMatch}`;
  } else if (aiParsingEnabled) {
    const translateTitle = shouldTranslateTitle(originalTitle);
    const summarySourceText = fullText || rssContent || rssExcerpt || originalTitle;
    const canReuseExistingSummary = Boolean(existing && !analysisInputsChanged && hasSucceededSummary(existing));
    const canReuseExistingCompletedAnalysis = Boolean(existing && !analysisInputsChanged && hasSucceededAnalysis(existing));

    if (canReuseExistingSummary) {
      summaryText = stripHtmlTags(existing?.summaryText) || buildFallbackSummary(rssExcerpt, fullText || rssContent);
      summaryStatus = "succeeded";
    } else {
      try {
        summaryText = stripHtmlTags(
          await aiProvider.summarizeItem(summarySourceText, {
            title: originalTitle,
            sourceName,
          }),
        ) || buildFallbackSummary(rssExcerpt, fullText || rssContent);
        summaryCompleted = true;
        summaryStatus = "succeeded";
      } catch (error) {
        appendIssue(issues, error, "Unknown item summary error");
        summaryFailed = true;
        summaryStatus = "failed";
        summaryText = buildFallbackSummary(rssExcerpt, fullText || rssContent);
      }
    }

    if (canReuseExistingCompletedAnalysis) {
      analysisStatus = "succeeded";
    } else {
      try {
        const enrichment = await aiProvider.enrichContent(summaryText || originalTitle, {
          title: originalTitle,
          sourceName,
          translateTitle,
        });

        if (translateTitle) {
          translatedTitle = enrichment.translatedTitle?.trim() || originalTitle;
        }

        moderationStatus = enrichment.moderationStatus === "restored" ? "allowed" : enrichment.moderationStatus;
        moderationReason = enrichment.moderationReason;
        moderationDetail = enrichment.moderationDetail;
        qualityScore = enrichment.qualityScore;
        qualityRationale = enrichment.qualityRationale;
        eventSignature = enrichment.eventSignature;
        analysisCompleted = true;
        analysisStatus = "succeeded";
      } catch (error) {
        appendIssue(issues, error, "Unknown ai enrichment error");
        moderationStatus = "allowed";
        moderationReason = null;
        moderationDetail = null;
        qualityScore = 50;
        qualityRationale = "AI analysis unavailable";
        eventSignature = null;
        analysisStatus = "failed";
      }
    }

    status = moderationStatus === "filtered" ? "filtered" : "processed";
  } else {
    if (shouldTranslateTitle(originalTitle)) {
      translatedTitle = originalTitle;
    }

    summaryText = buildFallbackSummary(rssExcerpt, fullText || rssContent);
    summaryStatus = "pending";
    analysisStatus = "pending";
    moderationStatus = "allowed";
    moderationReason = null;
    moderationDetail = null;
    qualityScore = 50;
    qualityRationale = "AI parsing disabled for this source";
    eventSignature = null;
    status = "processed";
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
      summaryStatus,
      analysisStatus,
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
      aiProcessedAt: analysisStatus === "succeeded" ? new Date() : null,
      clusterId: moderationStatus === "filtered" ? null : existing?.clusterId ?? null,
      errorMessage: issues.length > 0 ? issues.join(" | ") : null,
    },
  );

  let affectedClusterId: string | null = null;
  let clusterAssignmentMetrics: NonNullable<ProcessedItemRecord["metrics"]>["clusterAssignment"] | undefined;

  if (moderationStatus === "filtered") {
    if (existing?.clusterId) {
      affectedClusterId = existing.clusterId;
    }
  } else {
    const clusterAssignment = await assignItemToCluster(stored.id, {
      eventSignature,
      aiProvider,
      coordinator: clusterAssignmentCoordinator,
    });

    clusterAssignmentMetrics = {
      exactMatch: clusterAssignment.matchSource === "exact_match",
      cheapRankDirect: clusterAssignment.matchSource === "cheap_rank_direct",
      aiMatch: clusterAssignment.matchSource === "ai_match",
      skippedIncompleteSignature: clusterAssignment.skippedIncompleteSignature,
      newCluster: clusterAssignment.createdNewCluster,
    };

    if (clusterAssignment.clusterId && (isNew || existing?.clusterId !== clusterAssignment.clusterId)) {
      affectedClusterId = clusterAssignment.clusterId;
    }
  }

  return {
    id: stored.id,
    status: stored.status,
    isNew,
    affectedClusterId,
    fullTextFetched,
    metrics: {
      blacklistFiltered: Boolean(filterMatch),
      summaryCompleted,
      summaryFailed,
      analysisCompleted,
      analysisFiltered: analysisCompleted && moderationStatus === "filtered",
      clusterAssignment: clusterAssignmentMetrics,
    },
  };
}
