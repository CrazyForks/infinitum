import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";

import type { RuntimeConfig } from "@/config/runtime";
import type { ArticleFetchContext, ArticleFetcher } from "@/lib/ingestion/types";

export async function fetchArticleContent(url: string): Promise<string | null> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "infinitum-feed-bot/1.0",
    },
  });

  if (!response.ok) {
    throw new Error(`Article fetch failed with status ${response.status}`);
  }

  const html = await response.text();
  const dom = new JSDOM(html, { url });
  const article = new Readability(dom.window.document).parse();

  return article?.textContent?.trim() || null;
}

function trimExtractedContent(value: string | null, maxChars: number): string | null {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed.length > maxChars ? trimmed.slice(0, maxChars).trimEnd() : trimmed;
}

function isValidExtractedContent(value: string | null, minChars: number) {
  return Boolean(value && value.trim().length >= minChars);
}

export function shouldSkipJinaForUrl(url: string) {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return hostname === "weixin.qq.com" || hostname.endsWith(".weixin.qq.com");
  } catch {
    return false;
  }
}

function buildJinaReaderUrl(baseUrl: string, targetUrl: string) {
  return `${baseUrl.replace(/\/+$/, "")}/${targetUrl}`;
}

function createJinaRateLimiter(rpmLimit: number) {
  let nextAvailableAt = 0;
  const minIntervalMs = Math.ceil(60_000 / Math.max(1, rpmLimit));

  return async function waitForSlot() {
    const now = Date.now();
    const waitMs = Math.max(0, nextAvailableAt - now);
    nextAvailableAt = Math.max(now, nextAvailableAt) + minIntervalMs;

    if (waitMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  };
}

function createSemaphore(limit: number) {
  let active = 0;
  const queue: Array<() => void> = [];

  return async function runWithSlot<T>(task: () => Promise<T>): Promise<T> {
    if (active >= limit) {
      await new Promise<void>((resolve) => queue.push(resolve));
    }

    active += 1;
    try {
      return await task();
    } finally {
      active -= 1;
      queue.shift()?.();
    }
  };
}

async function fetchJinaReaderContent(
  url: string,
  config: RuntimeConfig["contentExtraction"],
  waitForSlot: () => Promise<void>,
): Promise<string | null> {
  await waitForSlot();

  const headers: Record<string, string> = {
    Accept: "text/plain",
    "X-Respond-With": "markdown",
  };

  if (config.jinaApiKey) {
    headers.Authorization = `Bearer ${config.jinaApiKey}`;
  }

  const response = await fetch(buildJinaReaderUrl(config.jinaBaseUrl, url), {
    headers,
    signal: AbortSignal.timeout(config.timeoutMs),
  });

  if (!response.ok) {
    throw new Error(`Jina Reader fetch failed with status ${response.status}`);
  }

  return trimExtractedContent(await response.text(), config.maxChars);
}

export function createConfiguredArticleFetcher(
  config: RuntimeConfig["contentExtraction"],
  localFetcher: ArticleFetcher = fetchArticleContent,
): ArticleFetcher {
  if (!config.jinaEnabled) {
    return localFetcher;
  }

  const waitForJinaSlot = createJinaRateLimiter(config.rpmLimit);
  const runJinaWithSlot = createSemaphore(config.concurrency);
  let jinaCalls = 0;

  return async (url: string, context?: ArticleFetchContext) => {
    const shouldTryJinaFirst = context?.reason === "rss_html";
    const canCallJina = () => !shouldSkipJinaForUrl(url) && config.maxPerRun > 0 && jinaCalls < config.maxPerRun;

    const tryJina = async () => {
      if (!canCallJina()) {
        return null;
      }

      if (context?.metrics) {
        context.metrics.jinaAttempted = true;
      }
      jinaCalls += 1;
      try {
        const content = await runJinaWithSlot(() => fetchJinaReaderContent(url, config, waitForJinaSlot));
        if (!isValidExtractedContent(content, config.minChars)) {
          return null;
        }
        if (context?.metrics) {
          context.metrics.used = "jina";
        }
        return content;
      } catch (error) {
        console.error("[Article Fetcher] Jina Reader fetch failed:", error);
        return null;
      }
    };

    const tryLocal = async () => {
      if (context?.metrics) {
        context.metrics.localAttempted = true;
      }
      try {
        const content = trimExtractedContent(await localFetcher(url, context), config.maxChars);
        if (!isValidExtractedContent(content, config.minChars)) {
          return null;
        }
        if (context?.metrics) {
          context.metrics.used = "local";
        }
        return content;
      } catch (error) {
        console.error("[Article Fetcher] Local article fetch failed:", error);
        return null;
      }
    };

    if (shouldTryJinaFirst) {
      return (await tryJina()) ?? (await tryLocal());
    }

    return (await tryLocal()) ?? (await tryJina());
  };
}
