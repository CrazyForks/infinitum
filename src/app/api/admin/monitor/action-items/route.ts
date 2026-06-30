import { adminErrorResponse } from "@/lib/admin/http";
import { requireAdmin } from "@/lib/admin/session";
import { getActionableMonitorSnapshot } from "@/lib/admin/actionable-monitor";

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const { searchParams } = new URL(request.url);

    return Response.json(
      await getActionableMonitorSnapshot(new Date(), {
        rangeDays: searchParams.get("rangeDays"),
      }),
    );
  } catch (error) {
    return adminErrorResponse(error);
  }
}
