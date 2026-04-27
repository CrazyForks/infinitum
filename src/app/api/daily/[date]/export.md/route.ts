import { normalizeDailyReportDate } from "@/lib/daily-report/date";
import { buildDailyReportExportMarkdown } from "@/lib/daily-report/export";
import { getDailyReportByDate } from "@/lib/daily-report/repository";

export const revalidate = 300;

type DailyReportExportRouteContext = {
  params: Promise<{ date: string }>;
};

export async function GET(_request: Request, { params }: DailyReportExportRouteContext) {
  const { date: rawDate } = await params;
  let date = "";

  try {
    date = normalizeDailyReportDate(rawDate);
  } catch {
    return Response.json({ error: "日报不存在" }, { status: 404 });
  }

  const report = await getDailyReportByDate(date, false);
  if (!report) {
    return Response.json({ error: "日报不存在" }, { status: 404 });
  }

  return new Response(buildDailyReportExportMarkdown(report), {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${date}-ai-daily.md"`,
      "Cache-Control": "public, max-age=300, stale-while-revalidate=300",
    },
  });
}
