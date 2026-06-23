import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { headers } from "next/headers";

import { DailyReportDetail } from "@/components/daily/daily-report-detail";
import { BackToTopButton } from "@/components/ui/back-to-top-button";
import { getAdminSession } from "@/lib/admin/session";
import { getDailyReportByDate } from "@/lib/daily-report/repository";
import { normalizeDailyReportDate } from "@/lib/daily-report/date";
import { PageShell } from "@/components/ui/page-shell";
import type { DailyReportDetailDTO } from "@/lib/daily-report/types";
import {
  buildBreadcrumbListJsonLd,
  buildOrganizationJsonLd,
  buildWebSiteJsonLd,
  getSiteOrigin,
  PRIVATE_ROBOTS,
  PUBLIC_ROBOTS,
  serializeJsonLd,
  SITE_NAME,
  toSeoDescription,
} from "@/lib/seo/metadata";

export const revalidate = 300;

type DailyReportPageProps = {
  params: Promise<{ date: string }>;
};

function buildDailyReportJsonLd(report: DailyReportDetailDTO, origin: string) {
  const url = `${origin}/daily/${report.date}`;

  return {
    "@context": "https://schema.org",
    "@graph": [
      buildWebSiteJsonLd(),
      buildOrganizationJsonLd(),
      buildBreadcrumbListJsonLd([
        { name: SITE_NAME, path: "/" },
        { name: "AI 日报", path: "/daily" },
        { name: report.title, path: `/daily/${report.date}` },
      ]),
      {
        "@type": "NewsArticle",
        headline: report.title,
        description: toSeoDescription(report.openingSummary),
        url,
        mainEntityOfPage: url,
        inLanguage: "zh-CN",
        isAccessibleForFree: true,
        datePublished: report.publishedAt ?? report.generatedAt,
        dateCreated: report.generatedAt,
        author: { "@type": "Organization", name: SITE_NAME },
        publisher: {
          "@type": "Organization",
          name: SITE_NAME,
          url: origin,
        },
        citation: report.sources.slice(0, 20).map((source) => source.url),
      },
    ],
  };
}

export async function generateMetadata({ params }: DailyReportPageProps): Promise<Metadata> {
  const { date: rawDate } = await params;
  let date = "";

  try {
    date = normalizeDailyReportDate(rawDate);
  } catch {
    return {
      title: "日报不存在",
      robots: PRIVATE_ROBOTS,
    };
  }

  let report = await getDailyReportByDate(date, false);

  if (!report) {
    const session = await getAdminSession();
    if (session.isAdmin) {
      report = await getDailyReportByDate(date, true);
    }
  }

  if (!report) {
    return {
      title: "日报不存在",
      robots: PRIVATE_ROBOTS,
    };
  }

  const description = toSeoDescription(report.openingSummary);
  const robots = report.status === "published" ? PUBLIC_ROBOTS : PRIVATE_ROBOTS;

  return {
    title: report.title,
    description,
    robots,
    alternates: {
      canonical: `/daily/${report.date}`,
    },
    openGraph: {
      type: "article",
      locale: "zh_CN",
      siteName: SITE_NAME,
      title: report.title,
      description,
      url: `/daily/${report.date}`,
      publishedTime: report.publishedAt ?? report.generatedAt,
      authors: [SITE_NAME],
    },
    twitter: {
      card: "summary",
      title: report.title,
      description,
    },
  };
}

export default async function DailyReportPage({ params }: DailyReportPageProps) {
  const requestHeaders = await headers();
  const { date: rawDate } = await params;
  let date = "";

  try {
    date = normalizeDailyReportDate(rawDate);
  } catch {
    notFound();
  }

  const report = await getDailyReportByDate(date, false);
  const origin = getSiteOrigin(requestHeaders);
  const jsonLd = report ? buildDailyReportJsonLd(report, origin) : null;

  return (
    <PageShell
      header={{
        activeNav: "daily",
        isAdmin: false,
        resolveAdminClient: true,
        showShadow: false,
        rssHref: "/api/daily/rss",
      }}
      contentClassName="max-w-none gap-0"
      contentPaddingClassName="px-0 pt-0 pb-6 sm:pb-8 lg:pb-10"
      footerPath={`/daily/${date}`}
    >
      <DailyReportDetail report={report} date={date} isAdmin={false} hydrateAdminClient />
      {jsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
        />
      ) : null}
      <BackToTopButton />
    </PageShell>
  );
}
