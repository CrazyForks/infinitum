import type { MetadataRoute } from "next";
import { headers } from "next/headers";

import { listDailyReports } from "@/lib/daily-report/repository";
import { getCachedLatestFetchRunSnapshot } from "@/lib/feed/service";
import { resolveOriginFromHeaders } from "@/lib/http/public-origin";

export const dynamic = "force-dynamic";
export const revalidate = 300;

export type SitemapInputs = {
  origin?: string;
  dailyReports?: Awaited<ReturnType<typeof listDailyReports>>["reports"];
  latestRunFinishedAt?: string | null;
};

export function buildSitemapEntries(
  origin: string,
  inputs: { dailyReports: SitemapInputs["dailyReports"]; latestRunFinishedAt: string | null },
): MetadataRoute.Sitemap {
  const reports = inputs.dailyReports ?? [];
  const homeLastModified = inputs.latestRunFinishedAt
    ? new Date(inputs.latestRunFinishedAt)
    : new Date();
  const dailyListLastModified =
    reports[0]?.publishedAt ?? reports[0]?.generatedAt ?? new Date();

  return [
    {
      url: origin,
      lastModified: homeLastModified,
      changeFrequency: "hourly",
      priority: 1,
    },
    {
      url: `${origin}/daily`,
      lastModified: dailyListLastModified,
      changeFrequency: "daily",
      priority: 0.8,
    },
    ...reports.map((report) => ({
      url: `${origin}/daily/${report.date}`,
      lastModified: report.publishedAt ?? report.generatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    })),
  ];
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const requestHeaders = await headers();
  const headerRecord: Record<string, string> = {};
  requestHeaders.forEach((value, key) => {
    headerRecord[key] = value;
  });

  const origin = resolveOriginFromHeaders(headerRecord);
  const [latestRun, dailyResult] = await Promise.all([
    getCachedLatestFetchRunSnapshot(),
    listDailyReports({ isAdmin: false, status: "published" }),
  ]);

  return buildSitemapEntries(origin, {
    dailyReports: dailyResult.reports,
    latestRunFinishedAt: latestRun?.finishedAt ?? null,
  });
}
