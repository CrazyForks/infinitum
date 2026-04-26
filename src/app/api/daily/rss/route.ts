import { buildRssFeed, escapeXml } from "@/lib/feed/rss";
import { listDailyReports } from "@/lib/daily-report/repository";
import { resolvePublicOrigin, resolvePublicRequestUrl } from "@/lib/http/public-origin";

export const revalidate = 300;

function stripInlineMarkdown(value: string) {
  return value
    .replace(/\*\*([^*\n]+)\*\*/g, "$1")
    .replace(/__([^_\n]+)__/g, "$1")
    .replace(/\*([^*\n]+)\*/g, "$1")
    .replace(/_([^_\n]+)_/g, "$1")
    .trim();
}

export async function GET(request: Request) {
  const baseUrl = resolvePublicOrigin(request);
  const selfLink = resolvePublicRequestUrl(request);
  const reports = await listDailyReports({
    isAdmin: false,
    status: "published",
  });

  const items = reports.slice(0, 50).map((report) => ({
    title: report.title,
    description: escapeXml(stripInlineMarkdown(report.openingSummary)),
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
