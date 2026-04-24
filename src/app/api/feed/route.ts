import { resolveFeedRequest } from "@/lib/feed/request";
import { getCachedFeedItems } from "@/lib/feed/service";
import { getVisitorIdCookie } from "@/lib/feed/visitor";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const { filters, pagination } = resolveFeedRequest(searchParams);
  const visitorId = await getVisitorIdCookie();
  const result = await getCachedFeedItems(filters, pagination, visitorId);

  return Response.json(
    {
      ...result,
      range: filters.range,
      sort: filters.sort,
      start: filters.start,
      end: filters.end,
      groupId: filters.groupId,
      sourceId: filters.sourceId,
      title: filters.title,
    },
    {
      headers: {
        "cache-control": "no-store",
      },
    },
  );
}
