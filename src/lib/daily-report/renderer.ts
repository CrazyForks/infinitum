import {
  DAILY_REPORT_SECTION_NAMES,
  type DailyReportCandidate,
  type DailyReportContent,
} from "@/lib/daily-report/types";

export const DAILY_REPORT_AI_NOTICE = "声明：完全使用AI生成，可能存在错误，需谨慎甄别。";

function escapeMarkdown(value: string) {
  return value.replace(/\r/g, "").trim();
}

function formatSources(sourceIds: number[], candidatesById: Map<number, DailyReportCandidate>) {
  return sourceIds
    .map((id) => candidatesById.get(id))
    .filter((candidate): candidate is DailyReportCandidate => Boolean(candidate))
    .map((candidate) => `- [${escapeMarkdown(candidate.title)}](${escapeMarkdown(candidate.url)})（${escapeMarkdown(candidate.sourceName)}）`);
}

export function renderDailyReportMarkdown(
  content: DailyReportContent,
  candidates: DailyReportCandidate[],
  title: string,
) {
  const candidatesById = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const lines: string[] = [
    `# ${escapeMarkdown(title)}`,
    "",
    `> ${DAILY_REPORT_AI_NOTICE}`,
    "",
    "## 摘要",
    "",
    content.openingSummary,
    "",
  ];

  for (const sectionName of DAILY_REPORT_SECTION_NAMES) {
    const items = content.sections[sectionName];
    if (items.length === 0) {
      continue;
    }

    lines.push(`## ${sectionName}`, "");
    for (const item of items) {
      lines.push(`### ${escapeMarkdown(item.topic)}`);
      if ("summary" in item) {
        lines.push(escapeMarkdown(item.summary));
      } else if ("affected" in item) {
        if (item.affected) lines.push(escapeMarkdown(item.affected));
        if (item.action) lines.push(escapeMarkdown(item.action));
      } else if ("keyNumbers" in item) {
        lines.push(`${escapeMarkdown(item.reason)}${item.keyNumbers ? `（${escapeMarkdown(item.keyNumbers)}）` : ""}`);
      } else if ("action" in item) {
        lines.push(escapeMarkdown(item.action));
      } else {
        lines.push(escapeMarkdown(item.reason));
      }
      if ("whyImportant" in item && item.whyImportant) {
        lines.push("", `**重点：** ${escapeMarkdown(item.whyImportant)}`);
      }
      const sourceLines = formatSources(item.sourceIds, candidatesById);
      if (sourceLines.length > 0) {
        lines.push("", "**来源：**", ...sourceLines);
      }
      lines.push("");
    }
  }

  lines.push("## 今日观察", "", content.closingThought, "");
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}
