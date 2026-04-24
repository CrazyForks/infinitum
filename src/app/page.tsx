import { getAdminSession } from "@/lib/admin/session";
import { FeedPanel } from "@/components/feed/feed-panel";
import {
  getCachedFeedFilterOptions,
  getCachedFeedItems,
  getCachedLatestFetchRunSnapshot,
} from "@/lib/feed/service";
import { resolveFeedRequest } from "@/lib/feed/request";
import { getVisitorIdCookie } from "@/lib/feed/visitor";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function Home({ searchParams }: PageProps) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const { filters, pagination } = resolveFeedRequest(resolvedSearchParams);
  const visitorId = await getVisitorIdCookie();
  const [feed, latestRunSnapshot, adminSession, feedFilterOptions] = await Promise.all([
    getCachedFeedItems(filters, pagination, visitorId),
    getCachedLatestFetchRunSnapshot(),
    getAdminSession(),
    getCachedFeedFilterOptions(),
  ]);

  return (
    <main>
      <FeedPanel
        initialItems={feed.items}
        initialRange={filters.range}
        initialSort={filters.sort}
        initialStartDate={filters.start}
        initialEndDate={filters.end}
        initialPublishedStartDate={filters.publishedStart}
        initialPublishedEndDate={filters.publishedEnd}
        initialNextCursor={feed.nextCursor}
        initialPagination={feed.pagination}
        initialStatus={latestRunSnapshot}
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
