import type { Metadata } from "next";
import { headers } from "next/headers";

import { DailyReportList } from "@/components/daily/daily-report-list";
import { BackToTopButton } from "@/components/ui/back-to-top-button";
import { listDailyReportArchiveWeeks, listDailyReports } from "@/lib/daily-report/repository";
import { PageShell } from "@/components/ui/page-shell";
import {
  buildBreadcrumbListJsonLd,
  buildWebSiteJsonLd,
  getSiteOrigin,
  PUBLIC_ROBOTS,
  serializeJsonLd,
  SITE_NAME,
  toSeoDescription,
} from "@/lib/seo/metadata";

export const revalidate = 300;

type DailyPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const DAILY_TITLE = "AI 日报";
const DAILY_DESCRIPTION = "按日期归档的 Infinitum AI 日报，汇总每日值得关注的技术资讯、变更、安全风险、开源工具和数据洞察。";

export async function generateMetadata(): Promise<Metadata> {
  // Touch headers() to opt this page into request-scoped rendering so
  // that the metadata (canonical / og:url) participates in the same
  // origin resolution as the page body below.
  await headers();
  return {
    title: DAILY_TITLE,
    description: DAILY_DESCRIPTION,
    robots: PUBLIC_ROBOTS,
    alternates: {
      canonical: "/daily",
      types: {
        "application/rss+xml": [{ title: "Infinitum AI 日报 RSS", url: "/api/daily/rss" }],
      },
    },
    openGraph: {
      type: "website",
      locale: "zh_CN",
      siteName: SITE_NAME,
      title: DAILY_TITLE,
      description: DAILY_DESCRIPTION,
      url: "/daily",
    },
    twitter: {
      card: "summary",
      title: DAILY_TITLE,
      description: DAILY_DESCRIPTION,
    },
  };
}

function buildDailyListJsonLd(reports: Awaited<ReturnType<typeof listDailyReports>>["reports"], origin: string) {

  return {
    "@context": "https://schema.org",
    "@graph": [
      buildWebSiteJsonLd(),
      buildBreadcrumbListJsonLd([
        { name: SITE_NAME, path: "/" },
        { name: DAILY_TITLE, path: "/daily" },
      ]),
      {
        "@type": "CollectionPage",
        name: "Infinitum AI 日报",
        url: `${origin}/daily`,
        inLanguage: "zh-CN",
        description: DAILY_DESCRIPTION,
        mainEntity: {
          "@type": "ItemList",
          itemListElement: reports.slice(0, 30).map((report, index) => ({
            "@type": "ListItem",
            position: index + 1,
            url: `${origin}/daily/${report.date}`,
            name: report.title,
            description: toSeoDescription(report.openingSummary, DAILY_DESCRIPTION),
            datePublished: report.publishedAt ?? report.generatedAt,
          })),
        },
      },
    ],
  };
}

export default async function DailyPage({ searchParams }: DailyPageProps) {
  const requestHeaders = await headers();
  const resolvedSearchParams = (await searchParams) ?? {};
  const selectedWeek = typeof resolvedSearchParams.week === "string" ? resolvedSearchParams.week : null;
  const rawStatus = typeof resolvedSearchParams.status === "string" ? resolvedSearchParams.status : "all";
  const selectedStatus = rawStatus === "draft" || rawStatus === "published" || rawStatus === "all" ? rawStatus : "all";
  const rawPage = typeof resolvedSearchParams.page === "string" ? Number(resolvedSearchParams.page) : 1;
  const rawPageSize = typeof resolvedSearchParams.pageSize === "string" ? Number(resolvedSearchParams.pageSize) : 20;
  const page = Number.isFinite(rawPage) && rawPage >= 1 ? rawPage : 1;
  const pageSize = Number.isFinite(rawPageSize) && rawPageSize >= 1 && rawPageSize <= 100 ? rawPageSize : 20;

  const [{ reports, total }, weeks] = await Promise.all([
    listDailyReports({
      isAdmin: false,
      status: selectedStatus,
      week: selectedWeek,
      page,
      pageSize,
    }),
    listDailyReportArchiveWeeks({
      isAdmin: false,
      status: selectedStatus,
    }),
  ]);
  const origin = getSiteOrigin(requestHeaders);
  const jsonLd = buildDailyListJsonLd(reports, origin);

  return (
    <PageShell
      header={{
        activeNav: "daily",
        isAdmin: false,
        resolveAdminClient: true,
        rssHref: "/api/daily/rss",
      }}
      contentPaddingClassName="px-4 pt-3 pb-6 sm:px-6 sm:pt-4 sm:pb-8 lg:px-8 lg:pt-4 lg:pb-10"
      footerPath="/daily"
    >
      <DailyReportList
        reports={reports}
        weeks={weeks}
        isAdmin={false}
        hydrateAdminClient
        selectedWeek={selectedWeek}
        selectedStatus={selectedStatus}
        total={total}
        page={page}
        pageSize={pageSize}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
      />
      <BackToTopButton />
    </PageShell>
  );
}
