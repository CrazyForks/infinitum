import { FEED_FILTER_OPTIONS_CACHE_TTL_MS, FEED_LIST_CACHE_TTL_MS, FEED_STATUS_CACHE_TTL_MS } from "@/config/constants";
import { listFeedFilterOptions, listFeedItems, getLatestFetchRun, toFetchRunSnapshot } from "@/lib/feed/repository";
import { withFeedCache } from "@/lib/feed/cache";

type FeedFiltersInput = Parameters<typeof listFeedItems>[0];
type FeedPaginationInput = Parameters<typeof listFeedItems>[1];

function serializeFeedFilters(filters: FeedFiltersInput, visitorId?: string) {
  return JSON.stringify({
    ...filters,
    rangeStart: filters.rangeStart?.toISOString() ?? null,
    rangeEnd: filters.rangeEnd?.toISOString() ?? null,
    visitorId: visitorId ?? null,
  });
}

function serializeFeedPagination(pagination: FeedPaginationInput) {
  return `${pagination.page}:${pagination.size}`;
}

export async function getCachedFeedItems(filters: FeedFiltersInput, pagination: FeedPaginationInput, visitorId?: string) {
  return withFeedCache(
    `feed:list:${serializeFeedFilters(filters, visitorId)}:${serializeFeedPagination(pagination)}`,
    () => listFeedItems(filters, pagination, visitorId),
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
