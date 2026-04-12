import { getAdminErrorStatus } from "@/lib/admin/http";
import { requireAdmin } from "@/lib/admin/session";
import { getBackgroundTaskMonitorSnapshot } from "@/lib/tasks/service";

export async function GET() {
  try {
    await requireAdmin();

    return Response.json(await getBackgroundTaskMonitorSnapshot());
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Invalid request",
      },
      { status: getAdminErrorStatus(error) },
    );
  }
}
