import type { FeedClusterPreviewItemDTO, FeedEntryDTO } from "@/lib/feed/types";

export const DEFAULT_RSS_FEED_PAGE_SIZE = 100;

type RssItem = {
  title: string;
  description: string;
  link: string;
  pubDate: string;
  guid: string;
  sourceName?: string;
  author?: string | null;
};

type RssFeed = {
  title: string;
  description: string;
  link: string;
  selfLink?: string;
  lastBuildDate: string;
  items: RssItem[];
};

export function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildClusterDescription(
  clusterSummary: string,
  items: FeedClusterPreviewItemDTO[],
  hasMoreItems: boolean,
): string {
  const parts: string[] = [];

  if (clusterSummary) {
    parts.push(`<p>${escapeXml(clusterSummary)}</p>`);
  }

  // 相关文章列表
  if (items.length > 0) {
    parts.push(`<p><strong>相关文章：</strong></p>`);
    parts.push("<ul>");

    for (const item of items) {
      const itemLink = escapeXml(item.originalUrl);
      const itemTitle = escapeXml(item.title);
      const itemSource = escapeXml(item.sourceName);
      parts.push(`<li><a href="${itemLink}">${itemTitle}</a> - ${itemSource}</li>`);
    }

    if (hasMoreItems) {
      parts.push(`<li><em>还有更多相关文章...</em></li>`);
    }

    parts.push("</ul>");
  }

  return parts.join("\n");
}

export function buildRssFeed(feed: RssFeed): string {
  const { title, description, link, selfLink = link, lastBuildDate, items } = feed;

  const itemsXml = items
    .map((item) => {
      const sourceMeta = item.sourceName ? `\n    <source>${escapeXml(item.sourceName)}</source>` : "";
      const authorMeta = item.author ? `\n    <author>${escapeXml(item.author)}</author>` : "";

      return `  <item>
    <title>${escapeXml(item.title)}</title>
    <description>${item.description}</description>
    <link>${escapeXml(item.link)}</link>
    <pubDate>${new Date(item.pubDate).toUTCString()}</pubDate>
    <guid isPermaLink="false">${escapeXml(item.guid)}</guid>${sourceMeta}${authorMeta}
  </item>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
  <title>${escapeXml(title)}</title>
  <description>${escapeXml(description)}</description>
  <link>${escapeXml(link)}</link>
  <lastBuildDate>${new Date(lastBuildDate).toUTCString()}</lastBuildDate>
  <language>zh-CN</language>
  <atom:link href="${escapeXml(selfLink)}" rel="self" type="application/rss+xml" />
${itemsXml}
</channel>
</rss>`;
}

export function mapFeedEntriesToRssItems(
  entries: FeedEntryDTO[],
  baseUrl: string,
): RssItem[] {
  return entries.map((entry) => {
    if (entry.type === "single") {
      // 单条内容
      return {
        title: entry.title,
        description: escapeXml(entry.summary),
        link: entry.originalUrl,
        pubDate: entry.createdAt, // 使用系统收录时间
        guid: entry.id,
        sourceName: entry.sourceName,
        author: entry.author,
      };
    }

    // 聚合内容：构建包含相关文章列表的描述
    const description = buildClusterDescription(
      entry.summary,
      entry.itemsPreview,
      entry.hasMoreItems,
    );

    // 聚合的链接指向详情页（如果有）或者使用第一条文章的链接
    const clusterLink = entry.itemsPreview[0]?.originalUrl ?? baseUrl;

    return {
      title: entry.title,
      description,
      link: clusterLink,
      pubDate: entry.createdAt, // 使用系统收录时间
      guid: entry.id,
      sourceName: `${entry.sourceCount} 个来源`,
      author: null,
    };
  });
}
