import { getAdminSession } from "@/lib/admin/session";
import { DailyReportList } from "@/components/daily/daily-report-list";
import { BackToTopButton } from "@/components/ui/back-to-top-button";
import { listDailyReportArchiveWeeks, listDailyReports } from "@/lib/daily-report/repository";
import { PageShell } from "@/components/ui/page-shell";

export const dynamic = "force-dynamic";

type DailyPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function DailyPage({ searchParams }: DailyPageProps) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const session = await getAdminSession();
  const selectedWeek = typeof resolvedSearchParams.week === "string" ? resolvedSearchParams.week : null;
  const rawStatus = typeof resolvedSearchParams.status === "string" ? resolvedSearchParams.status : "all";
  const selectedStatus = rawStatus === "draft" || rawStatus === "published" || rawStatus === "all" ? rawStatus : "all";
  const [reports, weeks] = await Promise.all([
    listDailyReports({
      isAdmin: session.isAdmin,
      status: selectedStatus,
      week: selectedWeek,
    }),
    listDailyReportArchiveWeeks({
      isAdmin: session.isAdmin,
      status: selectedStatus,
    }),
  ]);

  return (
    <PageShell
      header={{
        activeNav: "daily",
        isAdmin: session.isAdmin,
        rssHref: "/api/daily/rss",
      }}
      contentPaddingClassName="px-4 pt-3 pb-6 sm:px-6 sm:pt-4 sm:pb-8 lg:px-8 lg:pt-4 lg:pb-10"
    >
      <DailyReportList
        reports={reports}
        weeks={weeks}
        isAdmin={session.isAdmin}
        selectedWeek={selectedWeek}
        selectedStatus={selectedStatus}
      />
      <BackToTopButton />
    </PageShell>
  );
}
