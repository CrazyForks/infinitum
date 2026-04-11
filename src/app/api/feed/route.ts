import { listFeedItems } from "@/lib/feed/repository";
import { isFeedRange, isFeedSort, normalizeFeedDateInput, resolveFeedFilters } from "@/lib/feed/range";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rangeParam = searchParams.get("range") ?? "7d";
  const sortParam = searchParams.get("sort") ?? "time_desc";
  const start = normalizeFeedDateInput(searchParams.get("start"));
  const end = normalizeFeedDateInput(searchParams.get("end"));
  const cursor = searchParams.get("cursor");
  const range = isFeedRange(rangeParam) ? rangeParam : "7d";
  const sort = isFeedSort(sortParam) ? sortParam : "time_desc";
  const filters = resolveFeedFilters({ range, sort, start, end });
  const result = await listFeedItems(filters, cursor);

  return Response.json({
    ...result,
    range: filters.range,
    sort: filters.sort,
    start: filters.start,
    end: filters.end,
  });
}
