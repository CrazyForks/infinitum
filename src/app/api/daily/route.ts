import { getAdminSession } from "@/lib/admin/session";
import { listDailyReportArchiveWeeks, listDailyReports } from "@/lib/daily-report/repository";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const session = await getAdminSession();
  const status = searchParams.get("status") ?? undefined;
  const selectedStatus = status === "draft" || status === "published" || status === "all" ? status : undefined;
  const week = searchParams.get("week");
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(searchParams.get("pageSize")) || 20));

  const { reports, total } = await listDailyReports({
    isAdmin: session.isAdmin,
    status: selectedStatus,
    week,
    page,
    pageSize,
  });
  const weeks = await listDailyReportArchiveWeeks({
    isAdmin: session.isAdmin,
    status: selectedStatus,
  });

  return Response.json({
    reports,
    total,
    page,
    pageSize,
    weeks,
  });
}
