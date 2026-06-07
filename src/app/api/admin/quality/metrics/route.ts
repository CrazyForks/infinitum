import { adminErrorResponse } from "@/lib/admin/http";
import { requireAdmin } from "@/lib/admin/session";
import { getDailyReportQualityMetrics } from "@/lib/daily-report/quality";

const DEFAULT_DAYS = 14;
const MAX_DAYS = 180;

export async function GET(request: Request) {
  try {
    await requireAdmin();

    const url = new URL(request.url);
    const rawDays = Number.parseInt(url.searchParams.get("days") ?? "", 10);
    const days = Number.isFinite(rawDays) && rawDays > 0 ? Math.min(MAX_DAYS, rawDays) : DEFAULT_DAYS;

    return Response.json(await getDailyReportQualityMetrics({ days }));
  } catch (error) {
    return adminErrorResponse(error);
  }
}
