import { listFeedFilterOptions, listFeedItems, getLatestFetchRun, toFetchRunSnapshot } from "@/lib/feed/repository";
import { withFeedCache } from "@/lib/feed/cache";

const FEED_LIST_CACHE_TTL_MS = 60 * 60 * 1000; // 1 小时
const FEED_FILTER_OPTIONS_CACHE_TTL_MS = 5 * 60_000;
const FEED_STATUS_CACHE_TTL_MS = 15_000;

type FeedFiltersInput = Parameters<typeof listFeedItems>[0];
type FeedPaginationInput = Parameters<typeof listFeedItems>[1];

function serializeFeedFilters(filters: FeedFiltersInput) {
  return JSON.stringify({
    ...filters,
    rangeStart: filters.rangeStart?.toISOString() ?? null,
    rangeEnd: filters.rangeEnd?.toISOString() ?? null,
  });
}

function serializeFeedPagination(pagination: FeedPaginationInput) {
  return `${pagination.page}:${pagination.size}`;
}

export async function getCachedFeedItems(filters: FeedFiltersInput, pagination: FeedPaginationInput) {
  return withFeedCache(
    `feed:list:${serializeFeedFilters(filters)}:${serializeFeedPagination(pagination)}`,
    () => listFeedItems(filters, pagination),
    FEED_LIST_CACHE_TTL_MS,
  );
}

export async function getCachedFeedFilterOptions() {
  return withFeedCache(
    "feed:filter-options",
    () => listFeedFilterOptions(),
    FEED_FILTER_OPTIONS_CACHE_TTL_MS,
  );
}

export async function getCachedLatestFetchRunSnapshot() {
  return withFeedCache(
    "feed:latest-run",
    async () => {
      const latestRun = await getLatestFetchRun();
      return latestRun ? toFetchRunSnapshot(latestRun) : null;
    },
    FEED_STATUS_CACHE_TTL_MS,
  );
}
