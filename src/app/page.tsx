import { getAdminSession } from "@/lib/admin/session";
import { FeedPanel } from "@/components/feed/feed-panel";
import { getLatestFetchRun, listFeedFilterOptions, listFeedItems, toFetchRunSnapshot } from "@/lib/feed/repository";
import { isFeedRange, isFeedSort, normalizeFeedDateInput, normalizeFeedFilterId, resolveFeedFilters } from "@/lib/feed/range";

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
  const range = candidateRange && isFeedRange(candidateRange) ? candidateRange : "7d";
  const sort = candidateSort && isFeedSort(candidateSort) ? candidateSort : "time_desc";
  const filters = resolveFeedFilters({
    range,
    sort,
    start: normalizeFeedDateInput(candidateStart),
    end: normalizeFeedDateInput(candidateEnd),
    groupId: normalizeFeedFilterId(candidateGroupId),
    sourceId: normalizeFeedFilterId(candidateSourceId),
  });
  const [feed, latestRun, adminSession, feedFilterOptions] = await Promise.all([
    listFeedItems(filters),
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
        initialStatus={latestRun ? toFetchRunSnapshot(latestRun) : null}
        isAdmin={adminSession.isAdmin}
        initialGroupId={filters.groupId}
        initialSourceId={filters.sourceId}
        availableGroups={feedFilterOptions.groups}
        availableSources={feedFilterOptions.sources}
      />
    </main>
  );
}
