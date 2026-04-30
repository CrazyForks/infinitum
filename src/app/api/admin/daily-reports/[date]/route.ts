import { adminErrorResponse } from "@/lib/admin/http";
import { requireAdmin } from "@/lib/admin/session";
import { normalizeDailyReportDate } from "@/lib/daily-report/date";
import { getDailyReportByDate } from "@/lib/daily-report/repository";
import { deleteDailyReport } from "@/lib/daily-report/service";

type RouteContext = {
  params: Promise<{ date: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    await requireAdmin();
    const { date: rawDate } = await context.params;
    const date = normalizeDailyReportDate(rawDate);
    const report = await getDailyReportByDate(date, true);

    if (!report) {
      return Response.json({ error: "日报不存在" }, { status: 404 });
    }

    return Response.json({ report });
  } catch (error) {
    return adminErrorResponse(error);
  }
}

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
