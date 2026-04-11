import { getAdminSession } from "@/lib/admin/session";
import { FeedPanel } from "@/components/feed/feed-panel";
import { getLatestFetchRun, listFeedItems, toFetchRunSnapshot } from "@/lib/feed/repository";
import { isFeedRange } from "@/lib/feed/range";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function Home({ searchParams }: PageProps) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const rangeParam = resolvedSearchParams.range;
  const candidateRange = Array.isArray(rangeParam) ? rangeParam[0] : rangeParam;
  const range = candidateRange && isFeedRange(candidateRange) ? candidateRange : "7d";
  const [feed, latestRun, adminSession] = await Promise.all([listFeedItems(range), getLatestFetchRun(), getAdminSession()]);

  return (
    <main>
      <FeedPanel
        initialItems={feed.items}
        initialRange={range}
        initialNextCursor={feed.nextCursor}
        initialStatus={latestRun ? toFetchRunSnapshot(latestRun) : null}
        isAdmin={adminSession.isAdmin}
      />
    </main>
  );
}
