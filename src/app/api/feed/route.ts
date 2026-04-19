import { listFeedItems } from "@/lib/feed/repository";
import { DEFAULT_FEED_PAGE_SIZE } from "@/lib/feed/types";
import {
  isFeedRange,
  isFeedSort,
  normalizeFeedDateInput,
  normalizeFeedFilterId,
  normalizeFeedTimeZoneOffset,
  resolveFeedFilters,
} from "@/lib/feed/range";

function parsePage(value: string | null): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function parsePageSize(value: string | null): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 100) : DEFAULT_FEED_PAGE_SIZE;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rangeParam = searchParams.get("range") ?? "today";
  const sortParam = searchParams.get("sort") ?? "time_desc";
  const start = normalizeFeedDateInput(searchParams.get("start"));
  const end = normalizeFeedDateInput(searchParams.get("end"));
  const groupId = normalizeFeedFilterId(searchParams.get("groupId"));
  const sourceId = normalizeFeedFilterId(searchParams.get("sourceId"));
  const title = searchParams.get("title")?.trim() || null;
  const page = parsePage(searchParams.get("page"));
  const size = parsePageSize(searchParams.get("size"));
  const timeZoneOffsetMinutes = normalizeFeedTimeZoneOffset(searchParams.get("tzOffsetMinutes"));
  const range = isFeedRange(rangeParam) ? rangeParam : "today";
  const sort = isFeedSort(sortParam) ? sortParam : "time_desc";
  const filters = resolveFeedFilters({ range, sort, start, end, groupId, sourceId, title }, new Date(), timeZoneOffsetMinutes);
  const result = await listFeedItems(filters, { page, size });

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
