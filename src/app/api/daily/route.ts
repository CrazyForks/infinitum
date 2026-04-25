import { getAdminSession } from "@/lib/admin/session";
import { listDailyReportArchiveWeeks, listDailyReports } from "@/lib/daily-report/repository";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const session = await getAdminSession();
  const status = searchParams.get("status") ?? undefined;
  const selectedStatus = status === "draft" || status === "published" || status === "all" ? status : undefined;
  const week = searchParams.get("week");

  const reports = await listDailyReports({
    isAdmin: session.isAdmin,
    status: selectedStatus,
    week,
  });
  const weeks = await listDailyReportArchiveWeeks({
    isAdmin: session.isAdmin,
    status: selectedStatus,
  });

  return Response.json({
    reports,
    weeks,
  });
}
