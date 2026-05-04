import { adminErrorResponse } from "@/lib/admin/http";
import { requireAdmin } from "@/lib/admin/session";
import { splitClusterIntoSingletons } from "@/lib/clusters/service";

type SplitRouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: Request, context: SplitRouteContext) {
  try {
    await requireAdmin();
    const { id } = await context.params;
    const result = await splitClusterIntoSingletons(id);

    return Response.json({
      success: true,
      result,
      cluster: null,
    });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
