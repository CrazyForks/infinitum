import {
  DEFAULT_CLOSING_LABEL,
  DEFAULT_OPENING_LABEL,
  type DailyReportCandidate,
  type DailyReportContent,
} from "@/lib/daily-report/types";
import { renderDailyReportItemBody } from "@/lib/daily-report/item-renderer";

export const DAILY_REPORT_AI_NOTICE = "声明：完全使用AI生成，可能存在错误，需谨慎甄别。";

export type DailyReportMarkdownSource = {
  sourceNumber: number;
  title: string;
  url: string;
  sourceName: string;
};

function escapeMarkdown(value: string) {
  return value.replace(/\r/g, "").trim();
}

function escapeMarkdownLinkLabel(value: string) {
  return escapeMarkdown(value).replace(/([\\`*_\[\]()])/g, "\\$1");
}

function formatSources(sourceIds: number[], sourcesByNumber: Map<number, DailyReportMarkdownSource[]>) {
  return sourceIds
    .flatMap((id) => sourcesByNumber.get(id) ?? [])
    .map((source) => `- [${escapeMarkdownLinkLabel(source.title)}](${escapeMarkdown(source.url)})（${escapeMarkdown(source.sourceName)}）`);
}

export function renderDailyReportMarkdown(
  content: DailyReportContent,
  candidates: DailyReportCandidate[],
  title: string,
  sources = candidates.map((candidate) => ({
    sourceNumber: candidate.id,
    title: candidate.title,
    url: candidate.url,
    sourceName: candidate.sourceName,
  })),
) {
  const sourcesByNumber = new Map<number, DailyReportMarkdownSource[]>();
  for (const source of sources) {
    const existing = sourcesByNumber.get(source.sourceNumber) ?? [];
    if (!existing.some((entry) => entry.url === source.url)) {
      existing.push(source);
    }
    sourcesByNumber.set(source.sourceNumber, existing);
  }
  const openingHeading = escapeMarkdown(content.openingLabel ?? DEFAULT_OPENING_LABEL);
  const closingHeading = escapeMarkdown(content.closingLabel ?? DEFAULT_CLOSING_LABEL);
  const lines: string[] = [
    `# ${escapeMarkdown(title)}`,
    "",
    `> ${DAILY_REPORT_AI_NOTICE}`,
    "",
    `## ${openingHeading}`,
    "",
    content.openingSummary,
    "",
  ];

  for (const [sectionName, items] of Object.entries(content.sections)) {
    if (items.length === 0) {
      continue;
    }

    lines.push(`## ${escapeMarkdown(sectionName)}`, "");
    for (const item of items) {
      lines.push(`### ${escapeMarkdown(item.topic)}`);
      const body = renderDailyReportItemBody(item, { formatText: escapeMarkdown });
      if (body.length > 0) {
        lines.push(...body);
      }
      const sourceLines = formatSources(item.sourceIds, sourcesByNumber);
      if (sourceLines.length > 0) {
        lines.push("", "**来源：**", ...sourceLines);
      }
      lines.push("");
    }
  }

  lines.push(`## ${closingHeading}`, "", content.closingThought, "");
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}
