import type { FetchRun, FetchRunStatus } from "@prisma/client";

import { createAiProvider } from "@/lib/ai/provider";
import {
  completeFetchRun,
  createFetchRun,
  findExistingItem,
  syncSources,
  updateFetchRunProgress,
  upsertItem,
} from "@/lib/feed/repository";
import { shouldTranslateTitle, stripHtmlTags } from "@/lib/feed/presentation";
import { buildDedupeKeys, shouldFetchFullText } from "@/lib/ingestion/dedupe";
import { findBlacklistMatch } from "@/lib/ingestion/filtering";
import { fetchArticleContent } from "@/lib/ingestion/article";
import { createRssParser } from "@/lib/ingestion/parser";
import type {
  ParsedFeedItem,
  ProcessedItemRecord,
  RunIngestionOptions,
} from "@/lib/ingestion/types";
import { getIngestionRuntimeConfig } from "@/lib/settings/service";

type PreparedFeedItem = {
  item: ParsedFeedItem;
  sourceId: string;
  sourceName: string;
  fetchFullTextWhenMissing: boolean;
};

type ResolvedRunOptions = RunIngestionOptions & {
  now: Date;
};

const activeBackgroundRuns = new Map<string, Promise<void>>();

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

async function resolveRunOptions(options?: Partial<RunIngestionOptions>): Promise<ResolvedRunOptions> {
  const now = options?.now ?? new Date();
  const runtimeConfig =
    !options?.aiProvider || !options?.sourceConfigs || !options?.blacklist ? await getIngestionRuntimeConfig() : null;

  return {
    trigger: options?.trigger ?? "manual",
    parser: options?.parser ?? createRssParser(),
    articleFetcher: options?.articleFetcher ?? fetchArticleContent,
    aiProvider: options?.aiProvider ?? createAiProvider(runtimeConfig?.modelApi ?? { apiKey: "", baseURL: "", model: "gpt-4.1-mini" }),
    sourceConfigs: options?.sourceConfigs ?? runtimeConfig?.rssSources ?? [],
    blacklist: options?.blacklist ?? runtimeConfig?.blacklistKeywords ?? [],
    itemConcurrency: options?.itemConcurrency ?? runtimeConfig?.ingestion.itemConcurrency ?? 3,
    now,
  };
}

async function runWithConcurrency(tasks: Array<() => Promise<void>>, concurrency: number) {
  let nextTaskIndex = 0;

  async function worker() {
    while (true) {
      const currentIndex = nextTaskIndex;
      nextTaskIndex += 1;

      if (currentIndex >= tasks.length) {
        return;
      }

      await tasks[currentIndex]?.();
    }
  }

  const workerCount = Math.max(1, Math.min(concurrency, tasks.length));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
}

async function processFeedItem({
  item,
  sourceId,
  sourceName,
  fetchFullTextWhenMissing,
  blacklist,
  articleFetcher,
  aiProvider,
  now,
}: {
  item: ParsedFeedItem;
  sourceId: string;
  sourceName: string;
  fetchFullTextWhenMissing: boolean;
  blacklist: string[];
  articleFetcher: RunIngestionOptions["articleFetcher"];
  aiProvider: RunIngestionOptions["aiProvider"];
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

  let fullText = existing?.fullText ?? null;
  let translatedTitle = existing?.translatedTitle ?? null;
  let summaryText = existing?.summaryText ?? null;
  let status: ProcessedItemRecord["status"] = existing?.status ?? "new";
  let filterReason: string | null = null;
  const issues: string[] = [];
  const contentForFullTextDecision = fullText || rssContent || rssExcerpt || "";
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
        filterReason: initialFilterMatch,
        errorMessage: null,
      },
    );

    return { id: stored.id, status: stored.status };
  }

  if (!fullText && shouldFetchFullText(contentForFullTextDecision, fetchFullTextWhenMissing)) {
    try {
      fullText = await articleFetcher(originalUrl);
      status = "fetched";
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
    filterReason = filterMatch;
  } else {
    const translateTitle = !translatedTitle && shouldTranslateTitle(originalTitle);
    const needsSummary = !summaryText;
    const enrichmentInput = fullText || rssContent || rssExcerpt || originalTitle;

    if (translateTitle || needsSummary) {
      try {
        const enrichment = await aiProvider.enrichContent(enrichmentInput, {
          title: originalTitle,
          sourceName,
          translateTitle,
        });

        if (translateTitle) {
          translatedTitle = enrichment.translatedTitle?.trim() || originalTitle;
        }

        if (needsSummary) {
          summaryText = stripHtmlTags(enrichment.summary) || null;
        }
      } catch (error) {
        appendIssue(issues, error, "Unknown ai enrichment error");
      }
    }

    if (!summaryText) {
      summaryText = buildFallbackSummary(rssExcerpt, fullText || rssContent);
    }

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
      filterReason,
      errorMessage: issues.length > 0 ? issues.join(" | ") : null,
    },
  );

  return { id: stored.id, status: stored.status };
}

async function executeIngestion(run: FetchRun, options: ResolvedRunOptions) {
  const {
    parser,
    articleFetcher,
    aiProvider,
    sourceConfigs,
    blacklist,
    itemConcurrency,
    now,
  } = options;
  const sources = await syncSources(sourceConfigs);
  const preparedItems: PreparedFeedItem[] = [];
  const errors: string[] = [];
  let successCount = 0;
  let failureCount = 0;

  for (const source of sources) {
    try {
      const feed = await parser.parseURL(source.rssUrl);

      for (const item of feed.items ?? []) {
        preparedItems.push({
          item,
          sourceId: source.id,
          sourceName: source.name,
          fetchFullTextWhenMissing: source.fetchFullTextWhenMissing,
        });
      }
    } catch (error) {
      errors.push(`${source.name}: ${error instanceof Error ? error.message : "Unknown feed error"}`);
      failureCount += 1;
    }
  }

  await updateFetchRunProgress(run.id, {
    sourceCount: sources.length,
    itemCount: preparedItems.length,
    successCount,
    failureCount,
    errorSummary: errors.length > 0 ? errors.join(" | ") : null,
  });

  let progressChain = Promise.resolve();
  const enqueueProgressUpdate = (result: ProcessedItemRecord | null, issue?: string) => {
    progressChain = progressChain.then(async () => {
      if (issue) {
        errors.push(issue);
        failureCount += 1;
      } else if (result?.status === "failed") {
        failureCount += 1;
      } else if (result && result.status !== "filtered") {
        successCount += 1;
      }

      await updateFetchRunProgress(run.id, {
        sourceCount: sources.length,
        itemCount: preparedItems.length,
        successCount,
        failureCount,
        errorSummary: errors.length > 0 ? errors.join(" | ") : null,
      });
    });

    return progressChain;
  };

  await runWithConcurrency(
    preparedItems.map((preparedItem) => async () => {
      try {
        const result = await processFeedItem({
          ...preparedItem,
          blacklist,
          articleFetcher,
          aiProvider,
          now,
        });

        await enqueueProgressUpdate(result);
      } catch (error) {
        const message =
          error instanceof Error
            ? `${preparedItem.sourceName}: ${preparedItem.item.title ?? "Untitled item"}: ${error.message}`
            : `${preparedItem.sourceName}: Unknown item processing error`;
        await enqueueProgressUpdate(null, message);
      }
    }),
    itemConcurrency,
  );

  await progressChain;

  const status: FetchRunStatus =
    errors.length > 0 || failureCount > 0
      ? successCount > 0
        ? "partial"
        : "failed"
      : "succeeded";

  return completeFetchRun(run.id, {
    status,
    finishedAt: new Date(),
    sourceCount: sources.length,
    itemCount: preparedItems.length,
    successCount,
    failureCount,
    errorSummary: errors.length > 0 ? errors.join(" | ") : null,
  });
}

async function runExistingFetchRun(run: FetchRun, options: ResolvedRunOptions) {
  try {
    return await executeIngestion(run, options);
  } catch (error) {
    return completeFetchRun(run.id, {
      status: "failed",
      finishedAt: new Date(),
      sourceCount: 0,
      itemCount: 0,
      successCount: 0,
      failureCount: 1,
      errorSummary: error instanceof Error ? error.message : "Unknown ingestion error",
    });
  }
}

export async function runIngestion(options?: Partial<RunIngestionOptions>) {
  const resolvedOptions = await resolveRunOptions(options);
  const run = await createFetchRun(resolvedOptions.trigger, resolvedOptions.now);

  return runExistingFetchRun(run, resolvedOptions);
}

export async function startIngestion(options?: Partial<RunIngestionOptions>) {
  const resolvedOptions = await resolveRunOptions(options);
  const run = await createFetchRun(resolvedOptions.trigger, resolvedOptions.now);
  const backgroundRun = runExistingFetchRun(run, resolvedOptions).then(() => undefined);

  activeBackgroundRuns.set(run.id, backgroundRun);
  void backgroundRun.finally(() => {
    activeBackgroundRuns.delete(run.id);
  });

  return run;
}
