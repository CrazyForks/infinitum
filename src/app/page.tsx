import { getAdminSession } from "@/lib/admin/session";
import { FeedPanel } from "@/components/feed/feed-panel";
import { getLatestFetchRun, listFeedFilterOptions, listFeedItems, toFetchRunSnapshot } from "@/lib/feed/repository";
import { DEFAULT_FEED_PAGE_SIZE } from "@/lib/feed/types";
import {
  isFeedRange,
  isFeedSort,
  normalizeFeedDateInput,
  normalizeFeedFilterId,
  normalizeFeedTimeZoneOffset,
  resolveFeedFilters,
} from "@/lib/feed/range";

function parsePage(value: string | string[] | undefined): number {
  const candidate = Array.isArray(value) ? value[0] : value;
  const parsed = Number.parseInt(candidate ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function parsePageSize(value: string | string[] | undefined): number {
  const candidate = Array.isArray(value) ? value[0] : value;
  const parsed = Number.parseInt(candidate ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 100) : DEFAULT_FEED_PAGE_SIZE;
}

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function Home({ searchParams }: PageProps) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const rangeParam = resolvedSearchParams.range;
  const sortParam = resolvedSearchParams.sort;
  const startParam = resolvedSearchParams.start;
  const endParam = resolvedSearchParams.end;
  const candidateRange = Array.isArray(rangeParam) ? rangeParam[0] : rangeParam;
  const candidateSort = Array.isArray(sortParam) ? sortParam[0] : sortParam;
  const candidateStart = Array.isArray(startParam) ? startParam[0] : startParam;
  const candidateEnd = Array.isArray(endParam) ? endParam[0] : endParam;
  const candidateGroupId = Array.isArray(resolvedSearchParams.groupId) ? resolvedSearchParams.groupId[0] : resolvedSearchParams.groupId;
  const candidateSourceId =
    Array.isArray(resolvedSearchParams.sourceId) ? resolvedSearchParams.sourceId[0] : resolvedSearchParams.sourceId;
  const candidateTitle = Array.isArray(resolvedSearchParams.title) ? resolvedSearchParams.title[0] : resolvedSearchParams.title;
  const candidateTimeZoneOffset =
    Array.isArray(resolvedSearchParams.tzOffsetMinutes) ? resolvedSearchParams.tzOffsetMinutes[0] : resolvedSearchParams.tzOffsetMinutes;
  const page = parsePage(resolvedSearchParams.page);
  const size = parsePageSize(resolvedSearchParams.size);
  const range = candidateRange && isFeedRange(candidateRange) ? candidateRange : "today";
  const sort = candidateSort && isFeedSort(candidateSort) ? candidateSort : "time_desc";
  const filters = resolveFeedFilters({
    range,
    sort,
    start: normalizeFeedDateInput(candidateStart),
    end: normalizeFeedDateInput(candidateEnd),
    groupId: normalizeFeedFilterId(candidateGroupId),
    sourceId: normalizeFeedFilterId(candidateSourceId),
    title: candidateTitle?.trim() ? candidateTitle.trim() : null,
  }, new Date(), normalizeFeedTimeZoneOffset(candidateTimeZoneOffset));
  const [feed, latestRun, adminSession, feedFilterOptions] = await Promise.all([
    listFeedItems(filters, { page, size }),
    getLatestFetchRun(),
    getAdminSession(),
    listFeedFilterOptions(),
  ]);

  return (
    <main>
      <FeedPanel
        initialItems={feed.items}
        initialRange={filters.range}
        initialSort={filters.sort}
        initialStartDate={filters.start}
        initialEndDate={filters.end}
        initialNextCursor={feed.nextCursor}
        initialPagination={feed.pagination}
        initialStatus={latestRun ? toFetchRunSnapshot(latestRun) : null}
        isAdmin={adminSession.isAdmin}
        initialGroupId={filters.groupId}
        initialSourceId={filters.sourceId}
        initialTitle={filters.title}
        availableGroups={feed.groups}
        initialGroupTotalCount={feed.groupTotalCount}
        availableSources={feedFilterOptions.sources}
      />
    </main>
  );
}
