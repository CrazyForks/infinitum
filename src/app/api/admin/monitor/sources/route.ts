import { adminErrorResponse } from "@/lib/admin/http";
import { requireAdmin } from "@/lib/admin/session";
import { getSourceMonitorSnapshot } from "@/lib/source-monitor/service";

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, Number(searchParams.get("page")) || 1);
    const pageSize = Math.min(200, Math.max(1, Number(searchParams.get("pageSize")) || 10));
    const healthStatus = searchParams.get("healthStatus") ?? undefined;
    const inactivity = searchParams.get("inactivity") ?? undefined;
    const groupName = searchParams.get("groupName") ?? undefined;

    return Response.json(
      await getSourceMonitorSnapshot(new Date(), {
        page,
        pageSize,
        healthStatus,
        inactivity,
        groupName,
      }),
    );
  } catch (error) {
    return adminErrorResponse(error);
  }
}
