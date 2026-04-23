import { adminErrorResponse } from "@/lib/admin/http";
import { requireAdmin } from "@/lib/admin/session";
import { enqueueItemReanalyzeTask } from "@/lib/items/service";

export async function POST(_request: Request, context: RouteContext<"/api/admin/items/[id]/reanalyze">) {
  try {
    await requireAdmin();
    const { id } = await context.params;
    const taskRun = await enqueueItemReanalyzeTask(id);

    return Response.json({
      taskRun,
    }, { status: 202 });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
