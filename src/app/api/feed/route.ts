import { listFeedItems } from "@/lib/feed/repository";
import {
  isFeedRange,
  isFeedSort,
  normalizeFeedDateInput,
  normalizeFeedFilterId,
  normalizeFeedTimeZoneOffset,
  resolveFeedFilters,
} from "@/lib/feed/range";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rangeParam = searchParams.get("range") ?? "today";
  const sortParam = searchParams.get("sort") ?? "time_desc";
  const start = normalizeFeedDateInput(searchParams.get("start"));
  const end = normalizeFeedDateInput(searchParams.get("end"));
  const groupId = normalizeFeedFilterId(searchParams.get("groupId"));
  const sourceId = normalizeFeedFilterId(searchParams.get("sourceId"));
  const title = searchParams.get("title")?.trim() || null;
  const cursor = searchParams.get("cursor");
  const timeZoneOffsetMinutes = normalizeFeedTimeZoneOffset(searchParams.get("tzOffsetMinutes"));
  const range = isFeedRange(rangeParam) ? rangeParam : "today";
  const sort = isFeedSort(sortParam) ? sortParam : "time_desc";
  const filters = resolveFeedFilters({ range, sort, start, end, groupId, sourceId, title }, new Date(), timeZoneOffsetMinutes);
  const result = await listFeedItems(filters, cursor);

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
