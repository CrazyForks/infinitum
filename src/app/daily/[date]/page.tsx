import { notFound } from "next/navigation";

import { DailyReportDetail } from "@/components/daily/daily-report-detail";
import { BackToTopButton } from "@/components/ui/back-to-top-button";
import { getAdminSession } from "@/lib/admin/session";
import { getDailyReportByDate } from "@/lib/daily-report/repository";
import { normalizeDailyReportDate } from "@/lib/daily-report/date";
import { PageShell } from "@/components/ui/page-shell";

export const dynamic = "force-dynamic";

type DailyReportPageProps = {
  params: Promise<{ date: string }>;
};

export default async function DailyReportPage({ params }: DailyReportPageProps) {
  const { date: rawDate } = await params;
  let date = "";

  try {
    date = normalizeDailyReportDate(rawDate);
  } catch {
    notFound();
  }

  const session = await getAdminSession();
  const report = await getDailyReportByDate(date, session.isAdmin);

  if (!report) {
    notFound();
  }

  return (
    <PageShell
      header={{
        activeNav: "daily",
        isAdmin: session.isAdmin,
        showShadow: false,
        rssHref: "/api/daily/rss",
      }}
      contentClassName="max-w-none gap-0"
      contentPaddingClassName="px-0 pt-0 pb-6 sm:pb-8 lg:pb-10"
    >
      <DailyReportDetail report={report} isAdmin={session.isAdmin} />
      <BackToTopButton />
    </PageShell>
  );
}
