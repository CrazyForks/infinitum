import { adminErrorResponse } from "@/lib/admin/http";
import { requireAdmin } from "@/lib/admin/session";
import { enqueueClusterSummaryTask } from "@/lib/clusters/service";

export async function POST(_request: Request, context: RouteContext<"/api/admin/clusters/[id]/regenerate-summary">) {
  try {
    await requireAdmin();
    const { id } = await context.params;
    const taskRun = await enqueueClusterSummaryTask(id);

    return Response.json({
      taskRun,
    }, { status: 202 });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
