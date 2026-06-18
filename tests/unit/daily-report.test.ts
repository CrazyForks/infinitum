import { describe, expect, it } from "vitest";

import {
  assertDailyReportDateIsNotFuture,
  formatDailyReportDateTime,
  getDailyReportDateRange,
  normalizeDailyReportDate,
} from "@/lib/daily-report/date";
import { buildDailyReportDetailMarkdown, buildDailyReportExportMarkdown } from "@/lib/daily-report/export";
import { renderDailyReportMarkdown } from "@/lib/daily-report/renderer";
import type { DailyReportCandidate, DailyReportContent, DailyReportDetailDTO } from "@/lib/daily-report/types";
import { parseDailyReportContent } from "@/lib/daily-report/validator";

const candidates: DailyReportCandidate[] = [
  {
    id: 1,
    sourceKey: "item:item-1",
    itemId: "item-1",
    clusterId: null,
    title: "OpenAI 发布新模型",
    sourceName: "Source A",
    url: "https://example.com/a",
    summary: "OpenAI 发布新模型摘要",
    qualityScore: 90,
    candidateScore: 90,
    sourceCount: 1,
    itemCount: 1,
    createdAt: "2026-04-24T01:00:00.000Z",
    publishedAt: "2026-04-24T01:00:00.000Z",
    eventType: "release",
    eventSubject: "OpenAI",
    eventAction: "发布",
    eventObject: "新模型",
    eventDate: "2026-04-24",
  },
  {
    id: 2,
    sourceKey: "item:item-2",
    itemId: "item-2",
    clusterId: null,
    title: "开发者工具更新",
    sourceName: "Source B",
    url: "https://example.com/b",
    summary: "开发者工具更新摘要",
    qualityScore: 80,
    candidateScore: 80,
    sourceCount: 1,
    itemCount: 1,
    createdAt: "2026-04-24T02:00:00.000Z",
    publishedAt: "2026-04-24T02:00:00.000Z",
    eventType: "update",
    eventSubject: "Tool",
    eventAction: "更新",
    eventObject: "CLI",
    eventDate: null,
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

  it("formats daily report timestamps in Asia/Shanghai", () => {
    expect(formatDailyReportDateTime("2026-04-24T01:30:00.000Z")).toBe("2026/04/24 09:30");
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
    const topItem = parsed.sections.今日大事[0] as Record<string, unknown>;
    expect(topItem.whyImportant).toBe("模型能力继续上探");
    const riskItem = parsed.sections.安全与风险[0] as Record<string, unknown>;
    // 通用化后，validator 保留所有用户自定义字段（包括 severity），由 prompt 约束输出
    expect(riskItem.severity).toBe("critical");
    expect(riskItem.affected).toBe("使用相关模型的普通用户和企业团队");
    expect(riskItem.action).toBe("关注官方修复说明并避免上传敏感数据");
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
            sourceIds: [1],
          },
          {
            topic: "开发者工具更新",
            action: "同栏目重复主题也会保留。",
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
    expect(markdown).toContain("> 声明：完全使用AI生成，可能存在错误，需谨慎甄别。");
    expect(markdown).toContain("## 摘要");
    expect(markdown).toContain("## 今日大事");
    expect(markdown).not.toContain("风险级别");
    expect(markdown).toContain("关注 CLI 与 IDE 工作流是否需要调整。");
    expect(markdown).toContain("**重点：**");
    expect(markdown).toContain("**来源：**");
    expect(markdown).toContain("[OpenAI 发布新模型](https://example.com/a)");
    expect(markdown).toContain("## 今日观察");
    expect(markdown).not.toContain("深挖");
  });

  it("renders multiple links for one selected clustered source number", () => {
    const markdown = renderDailyReportMarkdown(content, candidates, "2026-04-24 AI 日报", [
      {
        sourceNumber: 1,
        title: "OpenAI 发布新模型 来源 A",
        url: "https://example.com/a",
        sourceName: "Source A",
      },
      {
        sourceNumber: 1,
        title: "OpenAI 发布新模型 来源 B",
        url: "https://example.com/a-2",
        sourceName: "Source B",
      },
      {
        sourceNumber: 2,
        title: "开发者工具更新",
        url: "https://example.com/b",
        sourceName: "Source B",
      },
    ]);

    expect(markdown).toContain("[OpenAI 发布新模型 来源 A](https://example.com/a)");
    expect(markdown).toContain("[OpenAI 发布新模型 来源 B](https://example.com/a-2)");
    expect(markdown).toContain("[开发者工具更新](https://example.com/b)");
  });

  it("escapes only link-breaking markdown characters in source link titles", () => {
    const markdown = renderDailyReportMarkdown(content, candidates, "2026-04-24 AI 日报", [
      {
        sourceNumber: 1,
        title: "[相关]*特性*_汇总_ `AI` (v1)! #1 + A-B | <tag>",
        url: "https://example.com/a",
        sourceName: "Source A",
      },
      {
        sourceNumber: 2,
        title: "开发者工具更新",
        url: "https://example.com/b",
        sourceName: "Source B",
      },
    ]);

    expect(markdown).toContain(
      "[\\[相关\\]\\*特性\\*\\_汇总\\_ \\`AI\\` \\(v1\\)! #1 + A-B | <tag>](https://example.com/a)",
    );
  });
});

describe("daily report template flexibility", () => {
  it("accepts custom section names with arbitrary item fields", () => {
    const parsed = parseDailyReportContent(JSON.stringify({
      openingLabel: "今日速览",
      openingSummary: "本期聚焦模型发布、产业合作与开源工具三条主线，需要结合企业实际诉求评估对产品规划和工程实践的影响。",
      sections: {
        模型动态: [
          {
            topic: "新模型发布",
            summary: "模型能力继续上探，对工程实践与下游选型都有影响。",
            impact: "价值：成本和稳定性需要重新评估。",
            sourceIds: [1],
          },
        ],
        产业合作: [
          {
            topic: "厂商合作",
            action: "关注合作公告对集成方案的影响。",
            priority: "high",
            sourceIds: [2],
          },
        ],
      },
      closingLabel: "编辑视角",
      closingThought: "整体来看主线还是收敛在模型能力和工程工具上，后续需要持续观察实际落地情况。",
    }), 2);

    expect(parsed.openingLabel).toBe("今日速览");
    expect(parsed.closingLabel).toBe("编辑视角");
    expect(Object.keys(parsed.sections)).toEqual(["模型动态", "产业合作"]);
    const topItem = parsed.sections["模型动态"]?.[0] as Record<string, unknown>;
    expect(topItem.impact).toBe("价值：成本和稳定性需要重新评估。");
    const actionItem = parsed.sections["产业合作"]?.[0] as Record<string, unknown>;
    expect(actionItem.priority).toBe("high");
  });

  it("falls back to default opening/closing labels when none provided", () => {
    const parsed = parseDailyReportContent(JSON.stringify({
      openingSummary: "本期覆盖模型发布、产业合作与开源工具三条主线，附带工程实践与生态影响评估，值得长期跟踪其对产品决策的作用。",
      sections: {
        头条: [
          {
            topic: "头条事件",
            summary: "头条事件摘要。",
            sourceIds: [1],
          },
        ],
      },
      closingThought: "今天主线集中在产品与生态变化上，下一阶段需要持续观察开发者反馈和落地效果。",
    }), 1);

    expect(parsed.openingLabel).toBeUndefined();
    expect(parsed.closingLabel).toBeUndefined();
  });

  it("rejects opening/closing labels that exceed 20 characters", () => {
    expect(() => parseDailyReportContent(JSON.stringify({
      openingLabel: "一".repeat(21),
      openingSummary: "本期覆盖模型发布、产业合作与开源工具三条主线，附带工程实践与生态影响评估，值得长期跟踪其对产品决策的作用。",
      sections: {
        头条: [
          { topic: "头条事件", summary: "头条摘要。", sourceIds: [1] },
        ],
      },
      closingThought: "今天主线集中在产品与生态变化上，下一阶段需要持续观察开发者反馈和落地效果。",
    }), 1)).toThrow(/openingLabel/);

    expect(() => parseDailyReportContent(JSON.stringify({
      openingSummary: "本期覆盖模型发布、产业合作与开源工具三条主线，附带工程实践与生态影响评估，值得长期跟踪其对产品决策的作用。",
      sections: {
        头条: [
          { topic: "头条事件", summary: "头条摘要。", sourceIds: [1] },
        ],
      },
      closingLabel: "二".repeat(21),
      closingThought: "今天主线集中在产品与生态变化上，下一阶段需要持续观察开发者反馈和落地效果。",
    }), 1)).toThrow(/closingLabel/);
  });

  it("rejects empty sections when no items are present", () => {
    expect(() => parseDailyReportContent(JSON.stringify({
      openingSummary: "本期覆盖模型发布、产业合作与开源工具三条主线，附带工程实践与生态影响评估，值得长期跟踪其对产品决策的作用。",
      sections: {},
      closingThought: "今天主线集中在产品与生态变化上，下一阶段需要持续观察开发者反馈和落地效果。",
    }), 1)).toThrow(/section/);
  });

  it("renders custom section names with unknown item fields", () => {
    const customContent: DailyReportContent = {
      openingLabel: "今日速览",
      openingSummary: "本期覆盖模型发布、产业合作与开源工具三条主线，附带工程实践与生态影响评估。",
      sections: {
        模型动态: [
          {
            topic: "新模型发布",
            summary: "模型能力继续上探，对工程实践与下游选型都有影响。",
            impact: "成本和稳定性需要重新评估。",
            sourceIds: [1],
          },
        ],
      },
      closingLabel: "编辑视角",
      closingThought: "整体来看主线还是收敛在模型能力和工程工具上，后续需要持续观察实际落地情况。",
    };

    const markdown = renderDailyReportMarkdown(customContent, candidates, "2026-04-24 AI 日报");

    expect(markdown).toContain("## 今日速览");
    expect(markdown).toContain("## 模型动态");
    expect(markdown).toContain("### 新模型发布");
    expect(markdown).toContain("模型能力继续上探，对工程实践与下游选型都有影响。");
    expect(markdown).toContain("**impact：**");
    expect(markdown).toContain("## 编辑视角");
    expect(markdown).not.toContain("## 摘要");
    expect(markdown).not.toContain("## 今日观察");
  });

  it("falls back to default opening/closing headings when labels are absent", () => {
    const fallbackContent: DailyReportContent = {
      openingSummary: "本期覆盖模型发布、产业合作与开源工具三条主线，附带工程实践与生态影响评估。",
      sections: {
        头条: [
          { topic: "头条事件", summary: "头条摘要。", sourceIds: [1] },
        ],
      },
      closingThought: "今天主线集中在产品与生态变化上，下一阶段需要持续观察开发者反馈和落地效果。",
    };

    const markdown = renderDailyReportMarkdown(fallbackContent, candidates, "2026-04-24 AI 日报");

    expect(markdown).toContain("## 摘要");
    expect(markdown).toContain("## 头条");
    expect(markdown).toContain("## 今日观察");
  });

  it("keeps custom opening and closing labels in detail and export markdown", () => {
    const customContent: DailyReportContent = {
      openingLabel: "今日速览",
      openingSummary: "本期覆盖模型发布、产业合作与开源工具三条主线，附带工程实践与生态影响评估。",
      sections: {
        模型动态: [
          { topic: "新模型发布", summary: "模型能力继续上探。", sourceIds: [1] },
        ],
      },
      closingLabel: "编辑视角",
      closingThought: "整体来看主线还是收敛在模型能力和工程工具上，后续需要持续观察实际落地情况。",
    };
    const renderedMarkdown = renderDailyReportMarkdown(customContent, candidates, "2026-04-24 AI 日报");
    const report: DailyReportDetailDTO = {
      id: "report-1",
      date: "2026-04-24",
      timezone: "Asia/Shanghai",
      status: "published",
      title: "2026-04-24 AI 日报",
      openingSummary: customContent.openingSummary,
      sourceCount: 1,
      generatedAt: "2026-04-24T00:00:00.000Z",
      publishedAt: "2026-04-24T01:00:00.000Z",
      errorMessage: null,
      closingThought: customContent.closingThought,
      content: customContent,
      renderedMarkdown,
      sources: [],
      previous: null,
      next: null,
    };

    const detailMarkdown = buildDailyReportDetailMarkdown(report);
    const exportMarkdown = buildDailyReportExportMarkdown(report);

    expect(detailMarkdown).toContain("## 今日速览");
    expect(detailMarkdown).toContain("## 编辑视角");
    expect(detailMarkdown).not.toContain("## 摘要\n\n## 今日速览");
    expect(exportMarkdown).toContain("# 2026-04-24 AI 日报");
    expect(exportMarkdown).toContain("## 今日速览");
    expect(exportMarkdown).toContain("## 编辑视角");
  });
});
