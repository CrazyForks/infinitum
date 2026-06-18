import type { DailyReportItem } from "@/lib/daily-report/types";

const DAILY_REPORT_ITEM_FIELD_ORDER = [
  "summary",
  "whyImportant",
  "action",
  "affected",
  "reason",
  "keyNumbers",
] as const;

function asDisplayText(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return null;
}

export function renderDailyReportItemBody(
  item: DailyReportItem,
  options: { formatText?: (value: string) => string } = {},
): string[] {
  const formatText = options.formatText ?? ((value: string) => value);
  const lines: string[] = [];
  const pushed = new Set<string>();

  for (const key of DAILY_REPORT_ITEM_FIELD_ORDER) {
    const text = asDisplayText(item[key]);
    if (!text) continue;
    if (key === "whyImportant") {
      lines.push("", `**重点：** ${formatText(text)}`);
    } else {
      lines.push(formatText(text));
    }
    pushed.add(key);
  }

  for (const [key, value] of Object.entries(item)) {
    if (pushed.has(key) || key === "topic" || key === "sourceIds" || value == null) continue;
    const text = asDisplayText(value);
    if (text) {
      lines.push(`**${formatText(key)}：** ${formatText(text)}`);
    } else if (Array.isArray(value)) {
      const joined = value
        .map((entry) => asDisplayText(entry))
        .filter((entry): entry is string => Boolean(entry))
        .join("、");
      if (joined) lines.push(`**${formatText(key)}：** ${formatText(joined)}`);
    } else {
      lines.push(`**${formatText(key)}：** ${formatText(String(value))}`);
    }
  }

  return lines;
}
