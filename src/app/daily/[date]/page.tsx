import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { DailyReportDetail } from "@/components/daily/daily-report-detail";
import { BackToTopButton } from "@/components/ui/back-to-top-button";
import { getDailyReportByDate } from "@/lib/daily-report/repository";
import { normalizeDailyReportDate } from "@/lib/daily-report/date";
import { PageShell } from "@/components/ui/page-shell";
import type { DailyReportDetailDTO } from "@/lib/daily-report/types";
import {
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

function buildDailyReportJsonLd(report: DailyReportDetailDTO) {
  const origin = getSiteOrigin();
  const url = `${origin}/daily/${report.date}`;

  return {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: report.title,
    description: toSeoDescription(report.openingSummary),
    url,
    mainEntityOfPage: url,
    inLanguage: "zh-CN",
    isAccessibleForFree: true,
    datePublished: report.publishedAt ?? report.generatedAt,
    dateCreated: report.generatedAt,
    author: {
      "@type": "Organization",
      name: SITE_NAME,
    },
    publisher: {
      "@type": "Organization",
      name: SITE_NAME,
      url: origin,
    },
    citation: report.sources.slice(0, 20).map((source) => source.url),
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

  const report = await getDailyReportByDate(date, false);

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
  const { date: rawDate } = await params;
  let date = "";

  try {
    date = normalizeDailyReportDate(rawDate);
  } catch {
    notFound();
  }

  const report = await getDailyReportByDate(date, false);
  const jsonLd = report ? buildDailyReportJsonLd(report) : null;

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
