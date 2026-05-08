import { buildRssFeed, renderRssDescriptionHtml } from "@/lib/feed/rss";
import { listDailyReports } from "@/lib/daily-report/repository";
import { resolvePublicOrigin, resolvePublicRequestUrl } from "@/lib/http/public-origin";

export const revalidate = 300;

export async function GET(request: Request) {
  const baseUrl = resolvePublicOrigin(request);
  const selfLink = resolvePublicRequestUrl(request);
  const { reports } = await listDailyReports({
    isAdmin: false,
    status: "published",
    page: 1,
    pageSize: 50,
  });

  const items = reports.map((report) => ({
    title: report.title,
    description: renderRssDescriptionHtml(report.openingSummary),
    link: `${baseUrl}/daily/${report.date}`,
    pubDate: report.publishedAt ?? report.generatedAt,
    guid: `daily:${report.date}`,
    sourceName: `${report.sourceCount} 个引用`,
    author: "Infinitum",
  }));

  const rssFeed = buildRssFeed({
    title: "Infinitum AI 日报",
    description: "Infinitum AI 日报 RSS 订阅",
    link: `${baseUrl}/daily`,
    selfLink,
    lastBuildDate: new Date().toISOString(),
    items,
  });

  return new Response(rssFeed, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=300, stale-while-revalidate=300",
    },
  });
}
