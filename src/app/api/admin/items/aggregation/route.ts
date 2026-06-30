import { adminErrorResponse } from "@/lib/admin/http";
import { requireAdmin } from "@/lib/admin/session";
import { listAggregationSplitParents } from "@/lib/feed/repository";

const AGGREGATION_SPLIT_STATUSES = new Set([
  "detected",
  "parsed",
  "failed",
]);
const RANGE_DAYS = new Set([1, 3, 7]);

function getRangeStart(value: string | null) {
  const rangeDays = Number(value);
  if (!RANGE_DAYS.has(rangeDays)) {
    return null;
  }

  const now = new Date();
  return new Date(now.getTime() - rangeDays * 24 * 60 * 60 * 1000);
}

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, Number(searchParams.get("page")) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(searchParams.get("pageSize")) || 20));
    const status = searchParams.get("status")?.trim() ?? "";

    const result = await listAggregationSplitParents(page, pageSize, {
      search: searchParams.get("search")?.trim() ?? "",
      status: AGGREGATION_SPLIT_STATUSES.has(status) ? status : "",
      updatedAtStart: getRangeStart(searchParams.get("rangeDays")),
    });

    return Response.json({
      aggregationSplits: result.items,
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
    });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
