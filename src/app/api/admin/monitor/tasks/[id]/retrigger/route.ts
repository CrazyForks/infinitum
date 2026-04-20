import { getAdminErrorStatus } from "@/lib/admin/http";
import { requireAdmin } from "@/lib/admin/session";
import { enqueueTaskRun, getTaskRun, toTaskRunSnapshot } from "@/lib/tasks/service";

export async function POST(_request: Request, context: RouteContext<"/api/admin/monitor/tasks/[id]/retrigger">) {
  try {
    await requireAdmin();
    const { id } = await context.params;

    // Get the original task directly from database
    const originalTask = await getTaskRun(id);

    if (!originalTask) {
      throw new Error("Task not found");
    }

    // Create a new task with the same kind and label
    const newTask = await enqueueTaskRun({
      kind: originalTask.kind,
      triggerType: "admin_action",
      label: `${originalTask.label} (重新触发)`,
      entityId: originalTask.entityId,
    });

    return Response.json({
      task: toTaskRunSnapshot(newTask),
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
