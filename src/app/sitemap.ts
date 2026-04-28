import type { MetadataRoute } from "next";

import { listDailyReports } from "@/lib/daily-report/repository";
import { getSiteOrigin } from "@/lib/seo/metadata";

export const dynamic = "force-dynamic";
export const revalidate = 300;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = getSiteOrigin();
  const { reports } = await listDailyReports({
    isAdmin: false,
    status: "published",
  });

  return [
    {
      url: origin,
      lastModified: new Date(),
      changeFrequency: "hourly",
      priority: 1,
    },
    {
      url: `${origin}/daily`,
      lastModified: reports[0]?.publishedAt ?? reports[0]?.generatedAt ?? new Date(),
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
