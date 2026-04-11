import { AdminAuthError, requireAdmin } from "@/lib/admin/session";
import { hasActiveFetchRun } from "@/lib/feed/repository";
import { toFetchRunSnapshot } from "@/lib/feed/repository";
import { startIngestion } from "@/lib/ingestion/service";

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

  if (await hasActiveFetchRun()) {
    return Response.json(
      {
        error: "An ingestion run is already in progress.",
      },
      { status: 409 },
    );
  }

  const run = await startIngestion({ trigger: "manual" });

  return Response.json(
    {
      run: toFetchRunSnapshot(run),
    },
    { status: 202 },
  );
}
