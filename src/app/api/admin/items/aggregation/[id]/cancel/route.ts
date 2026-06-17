import { adminErrorResponse } from "@/lib/admin/http";
import { requireAdmin } from "@/lib/admin/session";
import { cancelAggregationSplit } from "@/lib/items/service";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(_request: Request, context: RouteContext) {
  try {
    await requireAdmin();
    const { id } = await context.params;
    await cancelAggregationSplit(id);

    return Response.json({ success: true });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
