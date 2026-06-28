import {
  DEFAULT_DAILY_REPORT_HEADLINE_INSTRUCTION,
  DEFAULT_DAILY_REPORT_RECENT_TOPIC_RULES,
} from "@/lib/daily-report/template";

const DAILY_REPORT_HEADLINE_RUNTIME_RULE_TITLE = "日报标题字段规则";
const DAILY_REPORT_HEADLINE_RUNTIME_RULES = [
  `最终 JSON 顶层必须包含 headline 字段：${DEFAULT_DAILY_REPORT_HEADLINE_INSTRUCTION}`,
];

const DAILY_REPORT_RECENT_TOPICS_RUNTIME_RULE_TITLE = "历史主题使用规则";
const DAILY_REPORT_RECENT_TOPICS_RUNTIME_RULES = DEFAULT_DAILY_REPORT_RECENT_TOPIC_RULES;

function dailyReportPromptHasHeadlineRule(promptText: string) {
  return /\bheadline\b/.test(promptText);
}

function dailyReportPromptHasRecentTopicsPlaceholder(promptText: string) {
  return /\{\{\s*recentTopicsJson\s*\}\}/.test(promptText);
}

export function buildDailyReportRuntimeFallbackInstructionLines(input: {
  systemPrompt: string;
  promptTemplate: string;
  recentTopicsJson: string;
}) {
  const promptText = `${input.systemPrompt}\n${input.promptTemplate}`;
  const lines: string[] = [];

  if (!dailyReportPromptHasHeadlineRule(promptText)) {
    lines.push(
      DAILY_REPORT_HEADLINE_RUNTIME_RULE_TITLE + "：",
      ...DAILY_REPORT_HEADLINE_RUNTIME_RULES.map((rule, index) => `${index + 1}. ${rule}`),
      "",
    );
  }

  if (!dailyReportPromptHasRecentTopicsPlaceholder(promptText)) {
    lines.push(
      "最近 7 天已写主题 JSON：",
      input.recentTopicsJson,
      "",
      DAILY_REPORT_RECENT_TOPICS_RUNTIME_RULE_TITLE + "：",
      ...DAILY_REPORT_RECENT_TOPICS_RUNTIME_RULES.map((rule, index) => `${index + 1}. ${rule}`),
    );
  }

  return lines;
}
