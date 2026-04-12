import { AdminAuthError, requireAdmin } from "@/lib/admin/session";
import { startIngestionTask } from "@/lib/ingestion/service";

export async function POST() {
  try {
    await requireAdmin();
  } catch (error) {
    if (error instanceof AdminAuthError || error instanceof Error) {
      return Response.json(
        {
          error: error.message,
        },
        { status: error instanceof AdminAuthError ? error.status : 401 },
      );
    }
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
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Failed to queue ingestion task.",
      },
      { status: 409 },
    );
  }
}
