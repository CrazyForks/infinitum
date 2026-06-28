import {
  DAILY_REPORT_HEADLINE_MAX_LENGTH,
  DAILY_REPORT_TITLE_MAX_LENGTH,
} from "@/lib/daily-report/types";

function asHeadlineText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    return value
      .map((entry) => asHeadlineText(entry))
      .filter(Boolean)
      .join("、");
  }
  return "";
}

export function trimDailyReportTitleSeparators(value: string) {
  return value.replace(/[、，,。；;:：|｜\s]+$/g, "").trim();
}

export function truncateDailyReportTitleText(value: string, maxLength: number) {
  return trimDailyReportTitleSeparators(Array.from(value).slice(0, maxLength).join(""));
}

export function normalizeDailyReportHeadline(value: unknown, maxLength = DAILY_REPORT_HEADLINE_MAX_LENGTH) {
  const headline = asHeadlineText(value)
    .replace(/^#+\s*/, "")
    .replace(/\s+/g, " ")
    .replace(/^(?:\d{4}-)?\d{2}-\d{2}\s*(?:AI\s*)?日报\s*[|｜:：-]?\s*/i, "")
    .replace(/^(?:AI\s*)?日报\s*[|｜:：-]?\s*/i, "")
    .replace(/[、，,。；;:：|｜\s]+$/g, "")
    .trim();
  return truncateDailyReportTitleText(headline, maxLength);
}

export function formatDailyReportTitle(date: string, headline: string) {
  const datePrefix = `${date.slice(5)}日报`;
  const normalizedHeadline = normalizeDailyReportHeadline(headline);
  if (!normalizedHeadline) return datePrefix;
  const prefix = `${datePrefix} | `;
  const availableHeadlineLength = Math.max(0, DAILY_REPORT_TITLE_MAX_LENGTH - Array.from(prefix).length);
  const title = `${prefix}${truncateDailyReportTitleText(normalizedHeadline, availableHeadlineLength)}`;
  return truncateDailyReportTitleText(title, DAILY_REPORT_TITLE_MAX_LENGTH);
}
