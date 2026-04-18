import { listClusterItems } from "@/lib/feed/repository";
import {
  isFeedRange,
  isFeedSort,
  normalizeFeedDateInput,
  normalizeFeedFilterId,
  normalizeFeedTimeZoneOffset,
  resolveFeedFilters,
} from "@/lib/feed/range";

export async function GET(request: Request, context: RouteContext<"/api/feed/clusters/[id]">) {
  const { id } = await context.params;
  const { searchParams } = new URL(request.url);
  const rangeParam = searchParams.get("range") ?? "today";
  const sortParam = searchParams.get("sort") ?? "time_desc";
  const timeZoneOffsetMinutes = normalizeFeedTimeZoneOffset(searchParams.get("tzOffsetMinutes"));
  const filters = resolveFeedFilters({
    range: isFeedRange(rangeParam) ? rangeParam : "today",
    sort: isFeedSort(sortParam) ? sortParam : "time_desc",
    start: normalizeFeedDateInput(searchParams.get("start")),
    end: normalizeFeedDateInput(searchParams.get("end")),
    groupId: normalizeFeedFilterId(searchParams.get("groupId")),
    sourceId: normalizeFeedFilterId(searchParams.get("sourceId")),
    title: searchParams.get("title")?.trim() || null,
  }, new Date(), timeZoneOffsetMinutes);
  const items = await listClusterItems(id, filters);

  return Response.json({ items });
}
