import { DAILY_REPORT_AI_NOTICE } from "@/lib/daily-report/renderer";
import type { DailyReportDetailDTO } from "@/lib/daily-report/types";
import { DAILY_REPORT_SECTION_NAMES } from "@/lib/daily-report/types";

function buildFallbackMarkdown(report: DailyReportDetailDTO) {
  const lines: string[] = [`> ${DAILY_REPORT_AI_NOTICE}`, "", "## 摘要", "", report.content.openingSummary, ""];

  for (const sectionName of DAILY_REPORT_SECTION_NAMES) {
    const items = report.content.sections[sectionName];
    if (items.length === 0) continue;

    lines.push(`## ${sectionName}`, "");
    for (const item of items) {
      lines.push(`### ${item.topic}`);
      if ("summary" in item) {
        lines.push(item.summary);
      } else if ("affected" in item) {
        if (item.affected) lines.push(item.affected);
        if (item.action) lines.push(item.action);
      } else if ("keyNumbers" in item) {
        lines.push(`${item.reason}${item.keyNumbers ? `（${item.keyNumbers}）` : ""}`);
      } else if ("action" in item) {
        lines.push(item.action);
      } else {
        lines.push(item.reason);
      }
      if ("whyImportant" in item && item.whyImportant) {
        lines.push("", `**重点：** ${item.whyImportant}`);
      }
      lines.push("");
    }
  }

  lines.push("## 今日观察", "", report.content.closingThought);
  return lines.join("\n").replace(/\n{3,}/g, "\n\n");
}

export function buildDailyReportDetailMarkdown(report: DailyReportDetailDTO) {
  const markdown = report.renderedMarkdown.trim();
  if (!markdown) {
    return buildFallbackMarkdown(report);
  }

  const withoutTitle = markdown.replace(/^#\s+.*(?:\n|$)/, "").trimStart();
  const normalizedHeadings = withoutTitle
    .replace(/^##\s+开场摘要\s*$/m, "## 摘要")
    .replace(/^##\s+收尾观察\s*$/m, "## 今日观察")
    .replace(/^(\s*)风险级别：[^；\n]*(?:；\s*)?/gm, "$1")
    .replace(/^(\s*)(?:\*\*)?(?:摘要|开场摘要|今日观察|收尾观察|受影响|影响对象|建议|建议动作|行动建议)\s*[：:]\s*(?:\*\*)?\s*/gm, "$1")
    .replace(/^重点：\s*/gm, "**重点：** ")
    .replace(/^来源：\s*$/gm, "**来源：**");
  const withNotice = /^>\s*声明：完全使用AI生成，可能存在错误，需谨慎甄别。/m.test(normalizedHeadings)
    ? normalizedHeadings
    : `> ${DAILY_REPORT_AI_NOTICE}\n\n${normalizedHeadings}`;
  if (/^##\s+摘要/m.test(normalizedHeadings)) {
    return withNotice;
  }
  return `> ${DAILY_REPORT_AI_NOTICE}\n\n## 摘要\n\n${normalizedHeadings}`;
}

export function buildDailyReportExportMarkdown(report: DailyReportDetailDTO) {
  return `# ${report.title}\n\n${buildDailyReportDetailMarkdown(report).trim()}\n`;
}
