import { adminErrorResponse } from "@/lib/admin/http";
import { requireAdmin } from "@/lib/admin/session";
import { deleteDailyReport } from "@/lib/daily-report/service";

type RouteContext = {
  params: Promise<{ date: string }>;
};

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    await requireAdmin();
    const { date } = await context.params;
    await deleteDailyReport(date);

    return Response.json({ deleted: true });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
