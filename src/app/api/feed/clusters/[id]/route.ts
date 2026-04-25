import { listClusterItems } from "@/lib/feed/repository";
import { resolveFeedRequest } from "@/lib/feed/request";

export async function GET(request: Request, context: RouteContext<"/api/feed/clusters/[id]">) {
  const { id } = await context.params;
  const { searchParams } = new URL(request.url);
  const { filters } = resolveFeedRequest(searchParams);
  const items = await listClusterItems(id, {
    ...filters,
    range: "all",
    start: null,
    end: null,
    rangeStart: null,
    rangeEnd: null,
    publishedStart: null,
    publishedEnd: null,
    publishedRangeStart: null,
    publishedRangeEnd: null,
  });

  return Response.json({ items });
}
