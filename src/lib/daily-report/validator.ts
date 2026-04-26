import {
  DAILY_REPORT_SECTION_NAMES,
  type DailyReportContent,
  type DailyReportSectionName,
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

  const normalizeList = (name: DailyReportSectionName) => {
    const value = sectionsInput[name];
    return Array.isArray(value) ? value.filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === "object")) : [];
  };

  const content: DailyReportContent = {
    openingSummary: stripDailyReportGeneratedLabel(input.openingSummary),
    closingThought: stripDailyReportGeneratedLabel(input.closingThought),
    sections: {
      今日大事: normalizeList("今日大事").slice(0, 5).map((item, index) => ({
        topic: stripDailyReportGeneratedLabel(requireTopic(item, `sections.今日大事[${index}]`)),
        summary: stripDailyReportGeneratedLabel(item.summary),
        whyImportant: stripDailyReportGeneratedLabel(item.whyImportant).slice(0, 30),
        sourceIds: requireSourceIds(item, `sections.今日大事[${index}]`),
      })),
      变更与实践: normalizeList("变更与实践").slice(0, 5).map((item, index) => ({
        topic: stripDailyReportGeneratedLabel(requireTopic(item, `sections.变更与实践[${index}]`)),
        action: stripDailyReportGeneratedLabel(item.action),
        sourceIds: requireSourceIds(item, `sections.变更与实践[${index}]`),
      })),
      安全与风险: normalizeList("安全与风险").slice(0, 5).map((item, index) => ({
        topic: stripDailyReportGeneratedLabel(requireTopic(item, `sections.安全与风险[${index}]`)),
        affected: stripDailyReportGeneratedLabel(item.affected),
        action: stripDailyReportGeneratedLabel(item.action),
        sourceIds: requireSourceIds(item, `sections.安全与风险[${index}]`),
      })),
      开源与工具: normalizeList("开源与工具").slice(0, 5).map((item, index) => ({
        topic: stripDailyReportGeneratedLabel(requireTopic(item, `sections.开源与工具[${index}]`)),
        reason: stripDailyReportGeneratedLabel(item.reason),
        sourceIds: requireSourceIds(item, `sections.开源与工具[${index}]`),
      })),
      数据与洞察: normalizeList("数据与洞察").slice(0, 5).map((item, index) => ({
        topic: stripDailyReportGeneratedLabel(requireTopic(item, `sections.数据与洞察[${index}]`)),
        keyNumbers: stripDailyReportGeneratedLabel(item.keyNumbers),
        reason: stripDailyReportGeneratedLabel(item.reason),
        sourceIds: requireSourceIds(item, `sections.数据与洞察[${index}]`),
      })),
    },
  };

  if (content.openingSummary.length < 40) errors.push("openingSummary 太短");
  if (content.closingThought.length < 30) errors.push("closingThought 太短");
  if (content.sections.今日大事.length < 1) errors.push("今日大事至少需要 1 条");
  if (content.sections.变更与实践.length < 1) errors.push("变更与实践至少需要 1 条");

  for (const name of DAILY_REPORT_SECTION_NAMES) {
    for (const [index, item] of content.sections[name].entries()) {
      if (!item.topic) {
        errors.push(`${name}[${index}] topic 不能为空`);
      }
    }
  }

  if (errors.length > 0) {
    throw new Error(`日报输出校验失败：${errors.slice(0, 8).join("；")}`);
  }

  return content;
}
