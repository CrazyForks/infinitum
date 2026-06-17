import { adminErrorResponse } from "@/lib/admin/http";
import { requireAdmin } from "@/lib/admin/session";
import { listAggregationSplitParents } from "@/lib/feed/repository";

const AGGREGATION_SPLIT_STATUSES = new Set([
  "detected",
  "parsed",
  "failed",
]);

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
