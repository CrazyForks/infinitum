import { listClusterItems } from "@/lib/feed/repository";
import { isFeedRange, isFeedSort, normalizeFeedDateInput, normalizeFeedFilterId, resolveFeedFilters } from "@/lib/feed/range";

export async function GET(request: Request, context: RouteContext<"/api/feed/clusters/[id]">) {
  const { id } = await context.params;
  const { searchParams } = new URL(request.url);
  const rangeParam = searchParams.get("range") ?? "7d";
  const sortParam = searchParams.get("sort") ?? "time_desc";
  const filters = resolveFeedFilters({
    range: isFeedRange(rangeParam) ? rangeParam : "7d",
    sort: isFeedSort(sortParam) ? sortParam : "time_desc",
    start: normalizeFeedDateInput(searchParams.get("start")),
    end: normalizeFeedDateInput(searchParams.get("end")),
    groupId: normalizeFeedFilterId(searchParams.get("groupId")),
    sourceId: normalizeFeedFilterId(searchParams.get("sourceId")),
  });
  const items = await listClusterItems(id, filters);

  return Response.json({ items });
}
