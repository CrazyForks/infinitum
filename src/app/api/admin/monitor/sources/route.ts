import { adminErrorResponse } from "@/lib/admin/http";
import { requireAdmin } from "@/lib/admin/session";
import { getSourceMonitorSnapshot } from "@/lib/source-monitor/service";

export async function GET() {
  try {
    await requireAdmin();

    return Response.json(await getSourceMonitorSnapshot());
  } catch (error) {
    return adminErrorResponse(error);
  }
}
