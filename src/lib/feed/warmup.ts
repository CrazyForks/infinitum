import { DEFAULT_FEED_PAGE_SIZE } from "@/lib/feed/types";
import { DEFAULT_RSS_FEED_PAGE_SIZE } from "@/lib/feed/rss";

const FEED_CACHE_WARM_DISABLED_VALUES = new Set(["1", "true", "yes", "on"]);
const FEED_CACHE_WARM_URL_ENV_KEYS = [
  "FEED_CACHE_WARM_URL",
  "INFINITUM_APP_URL",
  "SITE_URL",
  "NEXT_PUBLIC_SITE_URL",
  "PUBLIC_SITE_URL",
] as const;

const DEFAULT_FEED_CACHE_WARM_ORIGIN = "http://app:3000";

const FEED_CACHE_WARM_PATHS = [
  "/",
  `/api/feed?range=today&sort=time_desc&size=${DEFAULT_FEED_PAGE_SIZE}`,
  `/api/feed?range=all&sort=time_desc&size=${DEFAULT_FEED_PAGE_SIZE}`,
  `/api/feed/rss?range=all&sort=time_desc&size=${DEFAULT_RSS_FEED_PAGE_SIZE}`,
] as const;

type FeedCacheWarmOptions = {
  reason?: string;
};

function normalizeOrigin(value: string | null | undefined) {
  const rawValue = value?.trim();
  if (!rawValue) {
    return null;
  }

  try {
    return new URL(rawValue).origin;
  } catch {
    return null;
  }
}

function isFeedCacheWarmDisabled() {
  return FEED_CACHE_WARM_DISABLED_VALUES.has(process.env.FEED_CACHE_WARM_DISABLED?.trim().toLowerCase() ?? "");
}

function resolveFeedCacheWarmOrigin() {
  for (const key of FEED_CACHE_WARM_URL_ENV_KEYS) {
    const origin = normalizeOrigin(process.env[key]);
    if (origin) {
      return origin;
    }
  }

  return DEFAULT_FEED_CACHE_WARM_ORIGIN;
}

function shouldWarmFeedCache() {
  return process.env.NODE_ENV !== "test" && !isFeedCacheWarmDisabled();
}

async function warmFeedCacheUrl(origin: string, path: string, reason: string | undefined) {
  const url = new URL(path, origin);
  const response = await fetch(url, {
    headers: {
      "user-agent": "infinitum-cache-warmer",
      ...(reason ? { "x-infinitum-cache-warm-reason": reason } : {}),
    },
  });

  if (!response.ok) {
    throw new Error(`Cache warm request failed: ${response.status} ${url.pathname}${url.search}`);
  }
}

export async function warmDefaultFeedHttpCaches(options: FeedCacheWarmOptions = {}) {
  if (!shouldWarmFeedCache()) {
    return;
  }

  const origin = resolveFeedCacheWarmOrigin();
  if (!origin) {
    return;
  }

  const results = await Promise.allSettled(
    FEED_CACHE_WARM_PATHS.map((path) => warmFeedCacheUrl(origin, path, options.reason)),
  );
  const failedResult = results.find((result): result is PromiseRejectedResult => result.status === "rejected");

  if (failedResult) {
    throw failedResult.reason;
  }
}

export function scheduleDefaultFeedCacheWarm(options: FeedCacheWarmOptions = {}) {
  if (!shouldWarmFeedCache()) {
    return;
  }

  setTimeout(() => {
    void warmDefaultFeedHttpCaches(options).catch((error) => {
      console.warn("[feed-cache-warmup] failed", error);
    });
  }, 0);
}
