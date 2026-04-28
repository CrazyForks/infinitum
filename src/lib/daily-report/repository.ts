import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { withDailyReportCache } from "@/lib/daily-report/cache";
import { getDailyReportDateRange } from "@/lib/daily-report/date";
import {
  DAILY_REPORT_TIMEZONE,
  type DailyReportCandidate,
  type DailyReportContent,
  type DailyReportDetailDTO,
  type DailyReportListItemDTO,
} from "@/lib/daily-report/types";
import { stripDailyReportGeneratedLabel } from "@/lib/daily-report/validator";
import { getDisplaySummary, getDisplayTitle } from "@/lib/feed/presentation";

const DISPLAYABLE_MODERATION_STATUSES = ["allowed", "restored"] as const;
const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
const DAILY_REPORT_ARCHIVE_WEEK_COUNT = 53;

async function getDailyReportCacheVersion(isAdmin: boolean) {
  const latestReport = await prisma.dailyReport.findFirst({
    where: isAdmin
      ? { status: { not: "failed" } }
      : { status: "published" },
    select: {
      id: true,
      updatedAt: true,
      generatedAt: true,
      publishedAt: true,
      status: true,
    },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
  });

  if (!latestReport) {
    return "no-daily-reports";
  }

  return [
    latestReport.id,
    latestReport.status,
    latestReport.updatedAt.toISOString(),
    latestReport.generatedAt.toISOString(),
    latestReport.publishedAt?.toISOString() ?? "unpublished",
  ].join(":");
}

export async function listDailyReportCandidates(date: string, limit = 120) {
  const { start, end } = getDailyReportDateRange(date);
  const rows = await prisma.item.findMany({
    take: limit,
    where: {
      createdAt: {
        gte: start,
        lt: end,
      },
      status: "processed",
      moderationStatus: {
        in: [...DISPLAYABLE_MODERATION_STATUSES],
      },
      source: {
        is: {
          enabled: true,
        },
      },
    },
    select: {
      id: true,
      clusterId: true,
      originalTitle: true,
      translatedTitle: true,
      originalUrl: true,
      summaryText: true,
      rssExcerpt: true,
      fullText: true,
      rssContent: true,
      qualityScore: true,
      createdAt: true,
      publishedAt: true,
      eventType: true,
      eventSubject: true,
      eventAction: true,
      eventObject: true,
      eventDate: true,
      source: {
        select: {
          name: true,
        },
      },
    },
    orderBy: [{ qualityScore: "desc" }, { createdAt: "desc" }],
  });

  return rows.map((item, index): DailyReportCandidate => ({
    id: index + 1,
    itemId: item.id,
    clusterId: item.clusterId,
    title: getDisplayTitle(item.originalTitle, item.translatedTitle),
    sourceName: item.source.name,
    url: item.originalUrl,
    summary: getDisplaySummary(item.summaryText, item.rssExcerpt, item.fullText ?? item.rssContent),
    qualityScore: item.qualityScore,
    createdAt: item.createdAt.toISOString(),
    publishedAt: item.publishedAt.toISOString(),
    eventType: item.eventType,
    eventSubject: item.eventSubject,
    eventAction: item.eventAction,
    eventObject: item.eventObject,
    eventDate: item.eventDate,
  }));
}

function parseContent(summaryJson: string): DailyReportContent {
  return JSON.parse(summaryJson) as DailyReportContent;
}

function toListItem(report: {
  id: string;
  date: string;
  timezone: string;
  status: "draft" | "published" | "failed";
  title: string;
  openingSummary: string;
  generatedAt: Date;
  publishedAt: Date | null;
  errorMessage: string | null;
  _count?: { sources: number };
}): DailyReportListItemDTO {
  return {
    id: report.id,
    date: report.date,
    timezone: report.timezone,
    status: report.status,
    title: report.title,
    openingSummary: stripDailyReportGeneratedLabel(report.openingSummary),
    sourceCount: report._count?.sources ?? 0,
    generatedAt: report.generatedAt.toISOString(),
    publishedAt: report.publishedAt?.toISOString() ?? null,
    errorMessage: report.errorMessage,
  };
}

export async function listDailyReports(input: {
  isAdmin: boolean;
  status?: "draft" | "published" | "all";
  week?: string | null;
  page?: number;
  pageSize?: number;
}) {
  if (!input.isAdmin) {
    const cacheVersion = await getDailyReportCacheVersion(false);

    return withDailyReportCache(
      `daily:list:${cacheVersion}:${input.status ?? "published"}:${input.week ?? "all"}:${input.page ?? ""}:${input.pageSize ?? ""}`,
      () => listDailyReportsUncached(input),
    );
  }

  return listDailyReportsUncached(input);
}

async function listDailyReportsUncached(input: {
  isAdmin: boolean;
  status?: "draft" | "published" | "all";
  week?: string | null;
  page?: number;
  pageSize?: number;
}) {
  const where = buildDailyReportVisibilityWhere(input);

  const weekRange = getDailyReportArchiveWeekRange(input.week);
  if (weekRange) {
    where.date = {
      gte: weekRange.start,
      lte: weekRange.end,
    };
  }

  const take = input.pageSize;
  const skip = input.page != null && take != null ? (input.page - 1) * take : undefined;

  const [reports, total] = await Promise.all([
    prisma.dailyReport.findMany({
      where,
      include: {
        _count: {
          select: { sources: true },
        },
      },
      orderBy: [{ date: "desc" }, { generatedAt: "desc" }],
      ...(take != null ? { take } : {}),
      ...(skip != null ? { skip } : {}),
    }),
    prisma.dailyReport.count({ where }),
  ]);

  return {
    reports: reports.map(toListItem),
    total,
    ...(input.page != null ? { page: input.page, pageSize: input.pageSize! } : {}),
  };
}

function buildDailyReportVisibilityWhere(input: {
  isAdmin: boolean;
  status?: "draft" | "published" | "all";
}): Prisma.DailyReportWhereInput {
  if (input.isAdmin && input.status && input.status !== "all") {
    return { status: input.status };
  }

  if (input.isAdmin) {
    return { status: { not: "failed" } };
  }

  return { status: "published" };
}

function toDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function parseDateKey(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year!, month! - 1, day!));
}

function startOfShanghaiToday(now = new Date()) {
  const shanghai = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  return new Date(Date.UTC(shanghai.getUTCFullYear(), shanghai.getUTCMonth(), shanghai.getUTCDate()));
}

function startOfWeek(date: Date) {
  const day = date.getUTCDay();
  const mondayOffset = day === 0 ? 6 : day - 1;
  return new Date(date.getTime() - mondayOffset * DAY_MS);
}

function formatWeekLabel(start: string, end: string) {
  return `${start.replace(/-/g, "/")} - ${end.replace(/-/g, "/")}`;
}

function getDailyReportArchiveWeekRange(weekKey: string | null | undefined) {
  if (!weekKey || !/^\d{4}-\d{2}-\d{2}$/.test(weekKey)) {
    return null;
  }

  const today = startOfShanghaiToday();
  const lowerBound = new Date(today.getTime() - 365 * DAY_MS);
  const start = parseDateKey(weekKey);
  const end = new Date(start.getTime() + 6 * DAY_MS);

  if (Number.isNaN(start.getTime()) || end < lowerBound || start > today) {
    return null;
  }

  return {
    start: toDateKey(new Date(Math.max(start.getTime(), lowerBound.getTime()))),
    end: toDateKey(new Date(Math.min(end.getTime(), today.getTime()))),
  };
}

export async function listDailyReportArchiveWeeks(input: {
  isAdmin: boolean;
  status?: "draft" | "published" | "all";
}) {
  if (!input.isAdmin) {
    const cacheVersion = await getDailyReportCacheVersion(false);

    return withDailyReportCache(
      `daily:weeks:${cacheVersion}:${input.status ?? "published"}`,
      () => listDailyReportArchiveWeeksUncached(input),
    );
  }

  return listDailyReportArchiveWeeksUncached(input);
}

async function listDailyReportArchiveWeeksUncached(input: {
  isAdmin: boolean;
  status?: "draft" | "published" | "all";
}) {
  const today = startOfShanghaiToday();
  const currentWeekStart = startOfWeek(today);
  const lowerBound = new Date(today.getTime() - 365 * DAY_MS);
  const weeks = Array.from({ length: DAILY_REPORT_ARCHIVE_WEEK_COUNT }, (_, index) => {
    const startDate = new Date(currentWeekStart.getTime() - index * WEEK_MS);
    const endDate = new Date(startDate.getTime() + 6 * DAY_MS);
    const visibleStart = new Date(Math.max(startDate.getTime(), lowerBound.getTime()));
    const visibleEnd = new Date(Math.min(endDate.getTime(), today.getTime()));

    return {
      key: toDateKey(startDate),
      start: toDateKey(visibleStart),
      end: toDateKey(visibleEnd),
      label: formatWeekLabel(toDateKey(visibleStart), toDateKey(visibleEnd)),
    };
  }).filter((week) => week.start <= week.end);

  const reports = await prisma.dailyReport.findMany({
    where: {
      ...buildDailyReportVisibilityWhere(input),
      date: {
        gte: weeks.at(-1)?.start ?? toDateKey(lowerBound),
        lte: toDateKey(today),
      },
    },
    select: { date: true },
  });
  const counts = new Map<string, number>();

  for (const report of reports) {
    const date = parseDateKey(report.date);
    const weekStart = toDateKey(startOfWeek(date));
    counts.set(weekStart, (counts.get(weekStart) ?? 0) + 1);
  }

  return weeks
    .map((week) => ({
      key: week.key,
      label: week.label,
      count: counts.get(week.key) ?? 0,
    }))
    .filter((week) => week.count > 0);
}

export async function getDailyReportByDate(date: string, isAdmin: boolean): Promise<DailyReportDetailDTO | null> {
  if (!isAdmin) {
    const cacheVersion = await getDailyReportCacheVersion(false);

    return withDailyReportCache(`daily:detail:${cacheVersion}:${date}`, () => getDailyReportByDateUncached(date, false));
  }

  return getDailyReportByDateUncached(date, isAdmin);
}

async function getDailyReportByDateUncached(date: string, isAdmin: boolean): Promise<DailyReportDetailDTO | null> {
  const report = await prisma.dailyReport.findUnique({
    where: {
      date_timezone: {
        date,
        timezone: DAILY_REPORT_TIMEZONE,
      },
    },
    include: {
      sources: {
        orderBy: [{ sectionName: "asc" }, { sourceName: "asc" }],
      },
      _count: {
        select: { sources: true },
      },
    },
  });

  if (!report || report.status === "failed" || (!isAdmin && report.status !== "published")) {
    return null;
  }

  const [previous, next] = await Promise.all([
    prisma.dailyReport.findFirst({
      where: {
        date: { lt: report.date },
        ...(isAdmin ? { status: { not: "failed" as const } } : { status: "published" as const }),
      },
      orderBy: { date: "desc" },
      select: { date: true, title: true },
    }),
    prisma.dailyReport.findFirst({
      where: {
        date: { gt: report.date },
        ...(isAdmin ? { status: { not: "failed" as const } } : { status: "published" as const }),
      },
      orderBy: { date: "asc" },
      select: { date: true, title: true },
    }),
  ]);

  return {
    ...toListItem(report),
    closingThought: stripDailyReportGeneratedLabel(report.closingThought),
    content: parseContent(report.summaryJson),
    renderedMarkdown: report.renderedMarkdown,
    sources: report.sources.map((source) => ({
      id: source.id,
      itemId: source.itemId,
      clusterId: source.clusterId,
      sourceName: source.sourceName,
      title: source.title,
      url: source.url,
      sectionName: source.sectionName,
      topic: source.topic,
    })),
    previous,
    next,
  };
}
