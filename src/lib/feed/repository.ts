import { type FetchRun, FetchRunStatus, type Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { getDisplaySummary, getDisplayTitle } from "@/lib/feed/presentation";
import { getRangeStart } from "@/lib/feed/range";
import type { FeedItemDTO, FeedRange, FetchRunSnapshot, SourceConfig } from "@/lib/feed/types";

export async function syncSources(sourceConfigs: SourceConfig[]) {
  for (const source of sourceConfigs) {
    await prisma.source.upsert({
      where: { rssUrl: source.rssUrl },
      update: {
        name: source.name,
        siteUrl: source.siteUrl,
        enabled: source.enabled,
        fetchFullTextWhenMissing: source.fetchFullTextWhenMissing,
      },
      create: {
        name: source.name,
        rssUrl: source.rssUrl,
        siteUrl: source.siteUrl,
        enabled: source.enabled,
        fetchFullTextWhenMissing: source.fetchFullTextWhenMissing,
      },
    });
  }

  return prisma.source.findMany({
    where: { enabled: true },
    orderBy: { name: "asc" },
  });
}

export async function findExistingItem(urlHash: string, dedupeSignature: string) {
  return prisma.item.findFirst({
    where: {
      OR: [{ urlHash }, { dedupeSignature }],
    },
  });
}

export async function upsertItem(
  where: { id?: string; urlHash: string; dedupeSignature: string },
  data: Prisma.ItemUncheckedCreateInput,
) {
  if (where.id) {
    return prisma.item.update({
      where: { id: where.id },
      data,
    });
  }

  return prisma.item.create({ data });
}

export async function createFetchRun(triggerType: "scheduled" | "manual", startedAt: Date) {
  return prisma.fetchRun.create({
    data: {
      triggerType,
      status: "running",
      startedAt,
    },
  });
}

export async function completeFetchRun(
  id: string,
  data: {
    status: FetchRunStatus;
    finishedAt: Date;
    sourceCount: number;
    itemCount: number;
    successCount: number;
    failureCount: number;
    errorSummary?: string | null;
  },
) {
  return prisma.fetchRun.update({
    where: { id },
    data,
  });
}

export async function updateFetchRunProgress(
  id: string,
  data: {
    sourceCount?: number;
    itemCount?: number;
    successCount?: number;
    failureCount?: number;
    errorSummary?: string | null;
  },
) {
  return prisma.fetchRun.update({
    where: { id },
    data,
  });
}

export async function getLatestFetchRun() {
  return prisma.fetchRun.findFirst({
    orderBy: { startedAt: "desc" },
  });
}

export function toFetchRunSnapshot(run: FetchRun): FetchRunSnapshot {
  return {
    id: run.id,
    status: run.status,
    triggerType: run.triggerType,
    startedAt: run.startedAt.toISOString(),
    finishedAt: run.finishedAt?.toISOString() ?? null,
    sourceCount: run.sourceCount,
    itemCount: run.itemCount,
    successCount: run.successCount,
    failureCount: run.failureCount,
    errorSummary: run.errorSummary,
  };
}

export async function hasActiveFetchRun() {
  const count = await prisma.fetchRun.count({
    where: { status: "running" },
  });

  return count > 0;
}

export async function listFeedItems(range: FeedRange, cursor?: string | null) {
  const rangeStart = getRangeStart(range);
  const take = 20;
  const where: Prisma.ItemWhereInput = {
    status: "processed",
    ...(rangeStart
      ? {
          publishedAt: {
            gte: rangeStart,
          },
        }
      : {}),
  };

  const items = await prisma.item.findMany({
    where,
    include: { source: true },
    orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
    take: take + 1,
    ...(cursor
      ? {
          cursor: { id: cursor },
          skip: 1,
        }
      : {}),
  });

  const hasMore = items.length > take;
  const slice = hasMore ? items.slice(0, take) : items;

  const mappedItems: FeedItemDTO[] = slice.map((item) => ({
    id: item.id,
    title: getDisplayTitle(item.originalTitle, item.translatedTitle),
    originalUrl: item.originalUrl,
    publishedAt: item.publishedAt.toISOString(),
    sourceName: item.source.name,
    author: item.author,
    summary: getDisplaySummary(item.summaryText, item.rssExcerpt, item.fullText ?? item.rssContent),
  }));

  return {
    items: mappedItems,
    nextCursor: hasMore ? slice[slice.length - 1]?.id ?? null : null,
  };
}
