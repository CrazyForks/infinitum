import { buildRssFeed, mapFeedEntriesToRssItems } from "@/lib/feed/rss";
import { resolveFeedRequest } from "@/lib/feed/request";
import { getCachedFeedItems } from "@/lib/feed/service";
import { resolvePublicOrigin, resolvePublicRequestUrl } from "@/lib/http/public-origin";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const { filters } = resolveFeedRequest(searchParams);

  const baseUrl = resolvePublicOrigin(request);
  const selfLink = resolvePublicRequestUrl(request);

  // RSS feed 默认获取较多条目（50条）
  const rssPagination = {
    page: 1,
    size: 50,
  };

  const result = await getCachedFeedItems(filters, rssPagination);

  // 构建 RSS feed
  const rssItems = mapFeedEntriesToRssItems(result.items, baseUrl);

  // 根据筛选条件构建标题
  let feedTitle = "Infinitum 资讯聚合";
  let feedDescription = "最新资讯聚合 RSS 订阅";

  if (filters.groupId) {
    const group = result.groups.find((g) => g.id === filters.groupId);
    if (group) {
      feedTitle = `${feedTitle} - ${group.name}`;
      feedDescription = `${group.name} 资讯订阅`;
    }
  }

  if (filters.sourceId) {
    feedDescription += "（指定来源）";
  }

  if (filters.title) {
    feedTitle = `"${filters.title}" 的搜索结果 - ${feedTitle}`;
  }

  // 根据 range 添加描述
  const rangeLabels: Record<string, string> = {
    today: "今日",
    "3d": "近3天",
    "7d": "近7天",
    "1m": "近1月",
    "1y": "近1年",
    all: "全部",
  };
  feedDescription += ` [${rangeLabels[filters.range] ?? filters.range}]`;

  const rssFeed = buildRssFeed({
    title: feedTitle,
    description: feedDescription,
    link: baseUrl,
    selfLink,
    lastBuildDate: new Date().toISOString(),
    items: rssItems,
  });

  return new Response(rssFeed, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=300", // RSS 缓存5分钟
    },
  });
}
