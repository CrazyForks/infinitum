import { adminErrorResponse } from "@/lib/admin/http";
import { requireAdmin } from "@/lib/admin/session";
import { publishDailyReport } from "@/lib/daily-report/service";

export async function POST(_request: Request, context: { params: Promise<{ date: string }> }) {
  try {
    await requireAdmin();
    const { date } = await context.params;
    const report = await publishDailyReport(date);

    return Response.json({ report });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
