import { getAdminErrorStatus } from "@/lib/admin/http";
import { requireAdmin } from "@/lib/admin/session";
import { requestTaskRunCancellation, toTaskRunSnapshot } from "@/lib/tasks/service";

export async function POST(_request: Request, context: RouteContext<"/api/admin/monitor/tasks/[id]/cancel">) {
  try {
    await requireAdmin();
    const { id } = await context.params;
    const taskRun = await requestTaskRunCancellation(id);

    return Response.json({
      task: toTaskRunSnapshot(taskRun),
    });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Invalid request",
      },
      { status: getAdminErrorStatus(error) },
    );
  }
}
