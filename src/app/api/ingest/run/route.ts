import { adminErrorResponse } from "@/lib/admin/http";
import { requireAdmin } from "@/lib/admin/session";
import { startIngestionTask } from "@/lib/ingestion/service";

export async function POST() {
  try {
    await requireAdmin();
  } catch (error) {
    return adminErrorResponse(error, 401, "Unauthorized");
  }

  try {
    const taskRun = await startIngestionTask({ triggerType: "manual" });

    return Response.json(
      {
        taskRun,
      },
      { status: 202 },
    );
  } catch (error) {
    return adminErrorResponse(error, 409, "Failed to queue ingestion task.");
  }
}
