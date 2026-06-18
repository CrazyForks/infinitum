import { describe, expect, it } from "vitest";

import {
  compileDailyReportTemplatePrompt,
  DEFAULT_DAILY_REPORT_TEMPLATE,
  DEFAULT_DAILY_REPORT_TEMPLATE_JSON,
  parseDailyReportTemplateJson,
} from "@/lib/daily-report/template";

describe("daily report template config", () => {
  it("compiles the default structured template into the system prompt", () => {
    const prompt = compileDailyReportTemplatePrompt(DEFAULT_DAILY_REPORT_TEMPLATE);

    expect(prompt).toContain('"blocks"');
    expect(prompt).toContain('"type":"text"');
    expect(prompt).toContain('"title":"摘要"');
    expect(prompt).toContain('"title":"趋势观察"');
    expect(prompt).not.toContain('"role"');
    expect(prompt).toContain("section block「热点事件」：输出 3-5 条");
    expect(prompt).toContain("输出 3-5 条");
    expect(prompt).toContain("section block「安全与风险」：可为空；有相关内容时输出 1-5 条");
    expect(prompt).toContain("section block「开源与工具」：可为空；有相关内容时输出 1-5 条");
    expect(prompt).toContain("section block「数据与洞察」：可为空；有相关内容时输出 1-5 条");
    expect(prompt).toContain("items 为空数组时会在渲染时自动隐藏");
    expect(prompt).toContain("每条正文约 120-260 字");
    expect(prompt).toContain("每条正文约 80-180 字");
    expect(prompt).toContain("每个 item 必须包含 title、body、sourceIds");
    expect(prompt).toContain("notes 要求：重点 必填");
    expect(prompt).toContain("不要复述摘要或逐条回顾事件");
    expect(prompt).not.toContain("可根据管理员习惯调整");
    expect(prompt).not.toContain("openingLabel");
  });

  it("uses block and note config when compiling", () => {
    const template = parseDailyReportTemplateJson(DEFAULT_DAILY_REPORT_TEMPLATE_JSON)!;
    template.blocks = [
      {
        type: "text",
        title: "今日速览",
        bodyInstruction: "总结主线。",
      },
      {
        type: "section",
        title: "产业信号",
        description: "输出 1-2 条，聚焦产业变化。",
        item: {
          bodyInstruction: "说明变化信号。",
          notes: [
            {
              label: "信号",
              required: true,
              instruction: "说明为什么重要。",
            },
          ],
        },
      },
    ];

    const prompt = compileDailyReportTemplatePrompt(template);

    expect(prompt).toContain('"title":"产业信号","items":[{"title":"...","body":"...","notes":[{"label":"信号","text":"..."}],"sourceIds":[1,2]}]');
    expect(prompt).toContain("section block「产业信号」：输出 1-2 条，聚焦产业变化。");
    expect(prompt).toContain("items 为空数组时会在渲染时自动隐藏");
    expect(prompt).toContain("信号 必填：说明为什么重要。");
  });

  it("always compiles empty sections as hidden by render default", () => {
    const template = parseDailyReportTemplateJson(DEFAULT_DAILY_REPORT_TEMPLATE_JSON)!;
    template.blocks = [
      {
        type: "section",
        title: "安全与风险",
        description: "没有风险也保留栏目。",
        item: {
          bodyInstruction: "说明风险内容。",
          notes: [],
        },
      },
    ];

    const prompt = compileDailyReportTemplatePrompt(template);

    expect(prompt).toContain('"title":"安全与风险","items"');
    expect(prompt).not.toContain("renderWhenEmpty");
    expect(prompt).toContain("items 为空数组时会在渲染时自动隐藏");
  });

  it("rejects legacy opening/sections/closing template json", () => {
    expect(() => parseDailyReportTemplateJson(JSON.stringify({
      opening: { label: "开场", instruction: "写开场。" },
      sections: [
        {
          title: "核心动态",
          description: "写核心动态。",
          fields: [
            { key: "summary", required: true, instruction: "写正文。" },
            { key: "whyImportant", label: "重点", required: true, instruction: "写重点。" },
          ],
        },
      ],
      closing: { label: "收束", instruction: "写收束。" },
      globalRules: ["只基于输入来源。"],
    }))).toThrow("blocks 数组");
  });

  it("rejects invalid block config", () => {
    const template = parseDailyReportTemplateJson(DEFAULT_DAILY_REPORT_TEMPLATE_JSON)!;
    template.blocks[0] = {
      type: "section",
      title: "坏栏目",
      description: "",
      item: {
        bodyInstruction: "",
        notes: [],
      },
    };

    expect(() => parseDailyReportTemplateJson(JSON.stringify(template))).toThrow("栏目要求");
  });
});
