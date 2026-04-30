import { prisma } from "@/lib/db";
import { PAGE_VIEW_STATS_CACHE_TTL_MS, PAGE_VIEW_WRITE_DEDUPE_TTL_MS } from "@/config/constants";

type PageViewStats = {
  pv: number;
  uv: number;
};

type AnalyticsCacheEntry<T> = {
  expiresAt: number;
  value: T;
};

declare global {
  var __infinitumPageViewStatsCache__: Map<string, AnalyticsCacheEntry<PageViewStats>> | undefined;
  var __infinitumPageViewWriteDedupe__: Map<string, number> | undefined;
}

function getStatsCacheStore() {
  globalThis.__infinitumPageViewStatsCache__ ??= new Map<string, AnalyticsCacheEntry<PageViewStats>>();
  return globalThis.__infinitumPageViewStatsCache__;
}

function getWriteDedupeStore() {
  globalThis.__infinitumPageViewWriteDedupe__ ??= new Map<string, number>();
  return globalThis.__infinitumPageViewWriteDedupe__;
}

export async function getPageViewStats(path: string) {
  const cacheStore = getStatsCacheStore();
  const cached = cacheStore.get(path);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  if (cached) {
    cacheStore.delete(path);
  }

  const [pv, uvRows] = await Promise.all([
    prisma.pageView.count({ where: { path } }),
    prisma.pageView.groupBy({
      by: ["visitorId"],
      where: { path },
    }),
  ]);

  const stats = { pv, uv: uvRows.length };
  cacheStore.set(path, {
    expiresAt: Date.now() + PAGE_VIEW_STATS_CACHE_TTL_MS,
    value: stats,
  });

  return stats;
}

export async function recordPageView(path: string, visitorId: string) {
  const date = new Date().toISOString().slice(0, 10);
  const dedupeKey = `${date}:${path}:${visitorId}`;
  const dedupeStore = getWriteDedupeStore();
  const dedupeExpiresAt = dedupeStore.get(dedupeKey);

  if (dedupeExpiresAt && dedupeExpiresAt > Date.now()) {
    return { recorded: false };
  }

  if (dedupeExpiresAt) {
    dedupeStore.delete(dedupeKey);
  }

  await prisma.pageView.create({
    data: { path, visitorId, date },
  });

  dedupeStore.set(dedupeKey, Date.now() + PAGE_VIEW_WRITE_DEDUPE_TTL_MS);

  return { recorded: true };
}

export function invalidatePageViewAnalyticsCache() {
  getStatsCacheStore().clear();
  getWriteDedupeStore().clear();
}
