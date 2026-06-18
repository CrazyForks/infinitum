import {
  DAILY_REPORT_CLOSING_LABEL_MAX_LENGTH,
  DAILY_REPORT_OPENING_LABEL_MAX_LENGTH,
  type DailyReportContent,
  type DailyReportItem,
} from "@/lib/daily-report/types";

function stripCodeFence(value: string) {
  return value.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
}

function safeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function stripDailyReportGeneratedLabel(value: unknown) {
  return safeText(value)
    .replace(
      /^(?:\*\*)?\s*(?:摘要|开场摘要|今日观察|收尾观察|重点|为什么重要|来源|受影响|影响对象|建议|建议动作|行动建议|风险级别|关键数字|数据|适用场景|价值)\s*[：:]\s*(?:\*\*)?\s*/,
      "",
    )
    .trim();
}

function normalizeIds(value: unknown, maxId: number) {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value.filter((entry): entry is number => Number.isInteger(entry) && entry >= 1 && entry <= maxId),
    ),
  );
}

function normalizeOptionalLabel(value: unknown, maxLength: number): string | undefined {
  const text = safeText(value);
  if (!text) return undefined;
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}

const DAILY_REPORT_LABEL_STRIPPED_ITEM_FIELDS = new Set([
  "summary",
  "whyImportant",
  "action",
  "affected",
  "reason",
  "keyNumbers",
]);

export function parseDailyReportContent(rawContent: string, maxSourceId: number): DailyReportContent {
  const parsed = JSON.parse(stripCodeFence(rawContent)) as unknown;

  if (!parsed || typeof parsed !== "object") {
    throw new Error("日报模型输出不是 JSON 对象。");
  }

  const input = parsed as Record<string, unknown>;
  const sectionsInput = input.sections && typeof input.sections === "object"
    ? input.sections as Record<string, unknown>
    : {};
  const errors: string[] = [];

  const requireTopic = (item: Record<string, unknown>, path: string) => {
    const topic = safeText(item.topic);
    if (topic.length < 4) {
      errors.push(`${path}.topic 太短`);
    }
    return topic;
  };

  const requireSourceIds = (item: Record<string, unknown>, path: string) => {
    const sourceIds = normalizeIds(item.sourceIds, maxSourceId);
    if (sourceIds.length < 1) {
      errors.push(`${path}.sourceIds 至少需要 1 个合法来源`);
    }
    return sourceIds;
  };

  const sections: Record<string, DailyReportItem[]> = {};
  let totalItems = 0;

  for (const [sectionName, rawList] of Object.entries(sectionsInput)) {
    if (!Array.isArray(rawList)) continue;
    const items: DailyReportItem[] = [];
    rawList.forEach((rawItem, index) => {
      if (!rawItem || typeof rawItem !== "object") {
        errors.push(`sections.${sectionName}[${index}] 不是对象`);
        return;
      }
      const item = rawItem as Record<string, unknown>;
      const path = `sections.${sectionName}[${index}]`;
      const topic = requireTopic(item, path);
      const sourceIds = requireSourceIds(item, path);
      const normalized: DailyReportItem = {
        topic: stripDailyReportGeneratedLabel(topic),
        sourceIds,
      };
      for (const [key, value] of Object.entries(item)) {
        if (key === "topic" || key === "sourceIds") continue;
        normalized[key] = typeof value === "string" && DAILY_REPORT_LABEL_STRIPPED_ITEM_FIELDS.has(key)
          ? stripDailyReportGeneratedLabel(value)
          : value;
      }
      items.push(normalized);
    });
    sections[sectionName] = items;
    totalItems += items.length;
  }

  const openingLabel = normalizeOptionalLabel(input.openingLabel, DAILY_REPORT_OPENING_LABEL_MAX_LENGTH);
  const closingLabel = normalizeOptionalLabel(input.closingLabel, DAILY_REPORT_CLOSING_LABEL_MAX_LENGTH);
  const openingSummary = stripDailyReportGeneratedLabel(input.openingSummary);
  const closingThought = stripDailyReportGeneratedLabel(input.closingThought);

  if (typeof input.openingLabel === "string" && input.openingLabel.trim().length > DAILY_REPORT_OPENING_LABEL_MAX_LENGTH) {
    errors.push(`openingLabel 超过 ${DAILY_REPORT_OPENING_LABEL_MAX_LENGTH} 字`);
  }
  if (typeof input.closingLabel === "string" && input.closingLabel.trim().length > DAILY_REPORT_CLOSING_LABEL_MAX_LENGTH) {
    errors.push(`closingLabel 超过 ${DAILY_REPORT_CLOSING_LABEL_MAX_LENGTH} 字`);
  }
  if (openingSummary.length < 40) errors.push("openingSummary 太短");
  if (closingThought.length < 30) errors.push("closingThought 太短");
  if (totalItems < 1) errors.push("所有 section 合计至少需要 1 条 item");

  if (errors.length > 0) {
    throw new Error(`日报输出校验失败：${errors.slice(0, 8).join("；")}`);
  }

  const content: DailyReportContent = {
    openingSummary,
    sections,
    closingThought,
  };
  if (openingLabel) content.openingLabel = openingLabel;
  if (closingLabel) content.closingLabel = closingLabel;
  return content;
}
