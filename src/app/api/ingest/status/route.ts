import { adminErrorResponse } from "@/lib/admin/http";
import { requireAdmin } from "@/lib/admin/session";
import { getLatestFetchRun, toFetchRunSnapshot } from "@/lib/feed/repository";

export async function GET() {
  try {
    await requireAdmin();
  } catch (error) {
    return adminErrorResponse(error, 401, "Unauthorized");
  }

  const latestRun = await getLatestFetchRun();

  return Response.json({
    run: latestRun ? toFetchRunSnapshot(latestRun) : null,
  });
}
