import { adminErrorResponse } from "@/lib/admin/http";
import { requireAdmin } from "@/lib/admin/session";
import { getAggregationSplitParent } from "@/lib/feed/repository";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    await requireAdmin();
    const { id } = await context.params;
    const item = await getAggregationSplitParent(id);

    if (!item) {
      return Response.json({ error: "Aggregation parent not found" }, { status: 404 });
    }

    return Response.json({ aggregationSplit: item });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
