import type { FeedFilters, FeedRange, FeedSort } from "@/lib/feed/types";

export const RANGE_OPTIONS: Array<{ value: FeedRange; label: string }> = [
  { value: "today", label: "当前" },
  { value: "3d", label: "3天" },
  { value: "7d", label: "7天" },
  { value: "1m", label: "1月" },
  { value: "1y", label: "1年" },
  { value: "all", label: "不限" },
];

export const SORT_OPTIONS: Array<{ value: FeedSort; label: string }> = [
  { value: "time_desc", label: "按时间倒序" },
  { value: "score_desc", label: "按评分倒序" },
];

const RANGE_SET = new Set<FeedRange>(RANGE_OPTIONS.map((option) => option.value));
const SORT_SET = new Set<FeedSort>(SORT_OPTIONS.map((option) => option.value));
const FEED_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function normalizeFeedFilterId(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

export function isFeedRange(value: string): value is FeedRange {
  return RANGE_SET.has(value as FeedRange);
}

export function isFeedSort(value: string): value is FeedSort {
  return SORT_SET.has(value as FeedSort);
}

export function normalizeFeedDateInput(value: string | null | undefined): string | null {
  if (!value || !FEED_DATE_PATTERN.test(value)) {
    return null;
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day!));

  if (
    Number.isNaN(date.getTime()) ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month! - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return value;
}

export function getRangeStart(range: FeedRange, now = new Date()): Date | null {
  const current = new Date(now);

  switch (range) {
    case "today":
      return new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), current.getUTCDate()));
    case "3d":
      return new Date(current.getTime() - 3 * 24 * 60 * 60 * 1000);
    case "7d":
      return new Date(current.getTime() - 7 * 24 * 60 * 60 * 1000);
    case "1m": {
      const date = new Date(current);
      date.setUTCMonth(date.getUTCMonth() - 1);
      return date;
    }
    case "1y": {
      const date = new Date(current);
      date.setUTCFullYear(date.getUTCFullYear() - 1);
      return date;
    }
    case "all":
      return null;
  }
}

function buildUtcDateBoundary(value: string, boundary: "start" | "end"): Date {
  const [year, month, day] = value.split("-").map(Number);

  if (boundary === "start") {
    return new Date(Date.UTC(year!, month! - 1, day!, 0, 0, 0, 0));
  }

  return new Date(Date.UTC(year!, month! - 1, day!, 23, 59, 59, 999));
}

export function resolveFeedFilters(
  input: Partial<FeedFilters> & Pick<FeedFilters, "range" | "sort">,
  now = new Date(),
): FeedFilters & { rangeStart: Date | null; rangeEnd: Date | null; isCustomRange: boolean } {
  let start = normalizeFeedDateInput(input.start);
  let end = normalizeFeedDateInput(input.end);

  if (start && end && start > end) {
    [start, end] = [end, start];
  }

  if (start || end) {
    return {
      range: input.range,
      sort: input.sort,
      start,
      end,
      groupId: normalizeFeedFilterId(input.groupId),
      sourceId: normalizeFeedFilterId(input.sourceId),
      title: input.title?.trim() ? input.title.trim() : null,
      rangeStart: start ? buildUtcDateBoundary(start, "start") : null,
      rangeEnd: end ? buildUtcDateBoundary(end, "end") : null,
      isCustomRange: true,
    };
  }

  return {
    range: input.range,
    sort: input.sort,
    start: null,
    end: null,
    groupId: normalizeFeedFilterId(input.groupId),
    sourceId: normalizeFeedFilterId(input.sourceId),
    title: input.title?.trim() ? input.title.trim() : null,
    rangeStart: getRangeStart(input.range, now),
    rangeEnd: null,
    isCustomRange: false,
  };
}
