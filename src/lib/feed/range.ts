import type { FeedRange } from "@/lib/feed/types";

export const RANGE_OPTIONS: Array<{ value: FeedRange; label: string }> = [
  { value: "today", label: "当天" },
  { value: "3d", label: "3天" },
  { value: "7d", label: "7天" },
  { value: "1m", label: "1月" },
  { value: "1y", label: "1年" },
  { value: "all", label: "不限" },
];

const RANGE_SET = new Set<FeedRange>(RANGE_OPTIONS.map((option) => option.value));

export function isFeedRange(value: string): value is FeedRange {
  return RANGE_SET.has(value as FeedRange);
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
