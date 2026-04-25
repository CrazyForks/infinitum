import { describe, expect, it } from "vitest";

import { assertDailyReportDateIsNotFuture, getDailyReportDateRange, normalizeDailyReportDate } from "@/lib/daily-report/date";
import { renderDailyReportMarkdown } from "@/lib/daily-report/renderer";
import type { DailyReportCandidate, DailyReportContent } from "@/lib/daily-report/types";
import { parseDailyReportContent } from "@/lib/daily-report/validator";

const candidates: DailyReportCandidate[] = [
  {
    id: 1,
    itemId: "item-1",
    clusterId: null,
    title: "OpenAI 发布新模型",
    sourceName: "Source A",
    url: "https://example.com/a",
    summary: "OpenAI 发布新模型摘要",
    qualityScore: 90,
    createdAt: "2026-04-24T01:00:00.000Z",
    publishedAt: "2026-04-24T01:00:00.000Z",
    eventType: "release",
    eventSubject: "OpenAI",
    eventAction: "发布",
    eventObject: "新模型",
  },
  {
    id: 2,
    itemId: "item-2",
    clusterId: null,
    title: "开发者工具更新",
    sourceName: "Source B",
    url: "https://example.com/b",
    summary: "开发者工具更新摘要",
    qualityScore: 80,
    createdAt: "2026-04-24T02:00:00.000Z",
    publishedAt: "2026-04-24T02:00:00.000Z",
    eventType: "update",
    eventSubject: "Tool",
    eventAction: "更新",
    eventObject: "CLI",
  },
];

const content: DailyReportContent = {
  openingSummary: "今天 AI 生态的重点变化集中在模型发布、开发者工具更新与工程实践调整，值得关注其对产品迭代和开发流程的影响。",
  sections: {
    今日大事: [
      {
        topic: "OpenAI 发布新模型",
        summary: "OpenAI 发布新模型，带来更强的推理和工具调用能力，短期内会影响开发者选型和产品功能设计。",
        whyImportant: "模型能力继续上探",
        sourceIds: [1, 2],
      },
    ],
    变更与实践: [
      {
        topic: "开发者工具更新",
        action: "关注 CLI 与 IDE 工作流是否需要调整。",
        urgency: "medium",
        sourceIds: [2],
      },
    ],
    安全与风险: [
      {
        topic: "AI 安全事件",
        affected: "使用相关模型的普通用户和企业团队",
        action: "关注官方修复说明并避免上传敏感数据",
        sourceIds: [1],
      },
    ],
    开源与工具: [],
    数据与洞察: [],
  },
  closingThought: "整体来看，今天的主线仍是模型能力与工程工具继续耦合，后续需要观察实际开发效率是否随之改善。",
};

describe("daily report utilities", () => {
  it("uses Asia/Shanghai single-day createdAt boundaries", () => {
    const range = getDailyReportDateRange("2026-04-24");

    expect(range.start.toISOString()).toBe("2026-04-23T16:00:00.000Z");
    expect(range.end.toISOString()).toBe("2026-04-24T16:00:00.000Z");
  });

  it("rejects invalid and future daily report dates", () => {
    expect(() => normalizeDailyReportDate("2026-02-30")).toThrow("日报日期不存在");
    expect(() => assertDailyReportDateIsNotFuture(
      "2026-04-26",
      new Date("2026-04-25T10:00:00.000Z"),
    )).toThrow("不能生成未来日期");
    expect(assertDailyReportDateIsNotFuture(
      "2026-04-25",
      new Date("2026-04-25T10:00:00.000Z"),
    )).toBe("2026-04-25");
  });

  it("validates structured model output and rejects invalid source ids", () => {
    const parsed = parseDailyReportContent(JSON.stringify({
      ...content,
      title: "模型返回的标题会被忽略",
    }), 2);

    expect(parsed).not.toHaveProperty("title");
    expect(() => parseDailyReportContent(JSON.stringify({
      ...content,
      sections: {
        ...content.sections,
        今日大事: [{ ...content.sections.今日大事[0], sourceIds: [99] }],
      },
    }), 2)).toThrow(/sourceIds/);
  });

  it("strips generated field labels and ignores risk levels", () => {
    const parsed = parseDailyReportContent(JSON.stringify({
      openingSummary: "摘要：今天 AI 生态的重点变化集中在模型发布、开发者工具更新与工程实践调整，值得关注其对产品迭代和开发流程的影响。",
      sections: {
        ...content.sections,
        今日大事: [{
          ...content.sections.今日大事[0],
          whyImportant: "重点：模型能力继续上探",
        }],
        安全与风险: [{
          topic: "AI 安全事件",
          severity: "critical",
          affected: "受影响：使用相关模型的普通用户和企业团队",
          action: "建议：关注官方修复说明并避免上传敏感数据",
          sourceIds: [1],
        }],
      },
      closingThought: "今日观察：整体来看，今天的主线仍是模型能力与工程工具继续耦合，后续需要观察实际开发效率是否随之改善。",
    }), 2);

    expect(parsed.openingSummary).not.toMatch(/^摘要：/);
    expect(parsed.closingThought).not.toMatch(/^今日观察：/);
    expect(parsed.sections.今日大事[0]?.whyImportant).toBe("模型能力继续上探");
    expect(parsed.sections.安全与风险[0]).not.toHaveProperty("severity");
    expect(parsed.sections.安全与风险[0]?.affected).toBe("使用相关模型的普通用户和企业团队");
    expect(parsed.sections.安全与风险[0]?.action).toBe("关注官方修复说明并避免上传敏感数据");
  });

  it("allows duplicate topics across sections", () => {
    const parsed = parseDailyReportContent(JSON.stringify({
      ...content,
      sections: {
        ...content.sections,
        变更与实践: [
          content.sections.变更与实践[0],
          {
            topic: "OpenAI 发布新模型",
            action: "重复主题也会保留。",
            urgency: "medium",
            sourceIds: [1],
          },
          {
            topic: "开发者工具更新",
            action: "同栏目重复主题也会保留。",
            urgency: "medium",
            sourceIds: [2],
          },
        ],
      },
    }), 2);

    expect(parsed.sections.今日大事).toHaveLength(1);
    expect(parsed.sections.变更与实践).toHaveLength(3);
    expect(parsed.sections.变更与实践[0]?.topic).toBe("开发者工具更新");
    expect(parsed.sections.变更与实践[1]?.topic).toBe("OpenAI 发布新模型");
    expect(parsed.sections.变更与实践[2]?.topic).toBe("开发者工具更新");
  });

  it("renders Markdown with inline sources and no deep-dive section", () => {
    const markdown = renderDailyReportMarkdown(content, candidates, "2026-04-24 AI 日报");

    expect(markdown).toContain("# 2026-04-24 AI 日报");
    expect(markdown).toContain("> 完全使用AI生成，可能存在错误，需谨慎甄别。");
    expect(markdown).toContain("## 摘要");
    expect(markdown).toContain("## 今日大事");
    expect(markdown).not.toContain("风险级别");
    expect(markdown).toContain("**重点：**");
    expect(markdown).toContain("**来源：**");
    expect(markdown).toContain("[OpenAI 发布新模型](https://example.com/a)");
    expect(markdown).toContain("## 今日观察");
    expect(markdown).not.toContain("深挖");
  });
});
