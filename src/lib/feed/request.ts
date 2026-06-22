import { DEFAULT_FEED_PAGE_SIZE, type FeedFilters, type FeedRange } from "@/lib/feed/types";
import {
  isFeedRange,
  isFeedSort,
  normalizeFeedDateInput,
  normalizeFeedFilterId,
  resolveFeedFilters,
} from "@/lib/feed/range";

type SearchParamRecord = Record<string, string | string[] | undefined>;
type SearchParamSource = URLSearchParams | SearchParamRecord;

type ResolvedFeedRequest = {
  filters: ReturnType<typeof resolveFeedFilters>;
  pagination: {
    page: number;
    size: number;
    includePopularTags: boolean;
  };
};

const ADVANCED_FILTER_KEYS = ["sourceId", "title", "tag", "publishedStart", "publishedEnd"] as const;
const CREATED_TIME_FILTER_KEYS = ["range", "start", "end"] as const;

function getSearchParamValue(searchParams: SearchParamSource, key: keyof FeedFilters | "page" | "size" | "includeTags") {
  if (searchParams instanceof URLSearchParams) {
    return searchParams.get(key) ?? undefined;
  }

  const value = searchParams[key];
  return Array.isArray(value) ? value[0] : value;
}

function parsePage(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function parsePageSize(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 200) : DEFAULT_FEED_PAGE_SIZE;
}

function hasParamValue(searchParams: SearchParamSource, key: keyof FeedFilters): boolean {
  return Boolean(getSearchParamValue(searchParams, key)?.trim());
}

function resolveDefaultRange(searchParams: SearchParamSource): FeedRange {
  const hasAdvancedFilter = ADVANCED_FILTER_KEYS.some((key) => hasParamValue(searchParams, key));
  const hasCreatedTimeFilter = CREATED_TIME_FILTER_KEYS.some((key) => hasParamValue(searchParams, key));

  return hasAdvancedFilter && !hasCreatedTimeFilter ? "all" : "today";
}

export function resolveFeedRequest(searchParams: SearchParamSource, now = new Date()): ResolvedFeedRequest {
  const rangeParam = getSearchParamValue(searchParams, "range");
  const sortParam = getSearchParamValue(searchParams, "sort");
  const startParam = getSearchParamValue(searchParams, "start");
  const endParam = getSearchParamValue(searchParams, "end");
  const publishedStartParam = getSearchParamValue(searchParams, "publishedStart");
  const publishedEndParam = getSearchParamValue(searchParams, "publishedEnd");
  const groupIdParam = getSearchParamValue(searchParams, "groupId");
  const sourceIdParam = getSearchParamValue(searchParams, "sourceId");
  const titleParam = getSearchParamValue(searchParams, "title");
  const tagParam = getSearchParamValue(searchParams, "tag");
  const defaultRange = resolveDefaultRange(searchParams);
  return {
    filters: resolveFeedFilters(
      {
        range: rangeParam && isFeedRange(rangeParam) ? rangeParam : defaultRange,
        sort: sortParam && isFeedSort(sortParam) ? sortParam : "time_desc",
        start: normalizeFeedDateInput(startParam),
        end: normalizeFeedDateInput(endParam),
        publishedStart: normalizeFeedDateInput(publishedStartParam),
        publishedEnd: normalizeFeedDateInput(publishedEndParam),
        groupId: normalizeFeedFilterId(groupIdParam),
        sourceId: normalizeFeedFilterId(sourceIdParam),
        title: titleParam?.trim() ? titleParam.trim() : null,
        tag: normalizeFeedFilterId(tagParam),
      },
      now,
    ),
    pagination: {
      page: parsePage(getSearchParamValue(searchParams, "page")),
      size: parsePageSize(getSearchParamValue(searchParams, "size")),
      includePopularTags: getSearchParamValue(searchParams, "includeTags") !== "false",
    },
  };
}
