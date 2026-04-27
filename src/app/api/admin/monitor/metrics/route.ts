import { adminErrorResponse } from "@/lib/admin/http";
import { requireAdmin } from "@/lib/admin/session";
import { getIngestionMetrics } from "@/lib/ingestion/metrics-service";

export async function GET() {
  try {
    await requireAdmin();

    return Response.json(await getIngestionMetrics());
  } catch (error) {
    return adminErrorResponse(error);
  }
}
