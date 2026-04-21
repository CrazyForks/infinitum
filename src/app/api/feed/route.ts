import { resolveFeedRequest } from "@/lib/feed/request";
import { getCachedFeedItems } from "@/lib/feed/service";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const { filters, pagination } = resolveFeedRequest(searchParams);
  const result = await getCachedFeedItems(filters, pagination);

  return Response.json({
    ...result,
    range: filters.range,
    sort: filters.sort,
    start: filters.start,
    end: filters.end,
    groupId: filters.groupId,
    sourceId: filters.sourceId,
    title: filters.title,
  });
}
