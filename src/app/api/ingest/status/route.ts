import { AdminAuthError, requireAdmin } from "@/lib/admin/session";
import { getLatestFetchRun, toFetchRunSnapshot } from "@/lib/feed/repository";

export async function GET() {
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

  const latestRun = await getLatestFetchRun();

  return Response.json({
    run: latestRun ? toFetchRunSnapshot(latestRun) : null,
  });
}
