import { beforeEach, describe, expect, it } from "vitest";

import {
  DEFAULT_CLUSTER_SUMMARY_PROMPT,
  DEFAULT_DAILY_REPORT_REFINEMENT_GENERATE_USER_PROMPT_TEMPLATE,
} from "@/config/prompts";
import { prisma } from "@/lib/db";
import * as settingsService from "@/lib/settings/service";
import {
  createModelApiConfig,
  createPromptConfig,
  deleteModelApiConfig,
  deletePromptConfig,
  deleteSource,
  deleteSourceGroup,
  ensureRuntimeConfigSeeded,
  getAdminSettings,
  getIngestionRuntimeConfig,
} from "@/lib/settings/service";

const LEGACY_DEFAULT_CLUSTER_SUMMARY_PROMPT =
  "你是聚合摘要助手。请基于给定的多条候选内容，提炼它们共同指向的同一具体事件，并输出 100 到 200 字中文摘要。只输出摘要正文，不要输出 JSON、代码块、标题、前后缀说明或项目符号。可使用有限 Markdown 行内标记突出关键信息：用 **加粗** 标注共同事件、关键进展、结果或数字，用 *斜体* 标注必要差异点或影响；不要使用链接、图片、标题、表格或列表。摘要要突出共同事件、关键进展和必要差异点；要体现这是多条报道的归纳结果，而不是复述某一篇原文；不要写成行业综述、公司介绍或主题总结，不要编造未提供的信息。";

const LEGACY_DEFAULT_DAILY_REPORT_REFINEMENT_GENERATE_USER_PROMPT_TEMPLATE = `日期：{{date}}
时区：{{timezone}}
当前日报 JSON：{{currentContentJson}}
引用来源 registry JSON：{{sourceRegistryJson}}
本轮管理员指令：{{instruction}}
历史对话摘要或消息 JSON：{{messagesJson}}`;

describe("admin settings service", () => {
  beforeEach(async () => {
    await prisma.item.deleteMany();
    await prisma.fetchRun.deleteMany();
    await prisma.taskSchedule.deleteMany();
    await prisma.promptConfig.deleteMany();
    await prisma.modelApiConfig.deleteMany();
    await prisma.source.deleteMany();
    await prisma.sourceGroup.deleteMany();
    await prisma.blacklistKeyword.deleteMany();
  });

  it("seeds code defaults into model and prompt tables when the database is empty", async () => {
    const runtimeConfig = await getIngestionRuntimeConfig();
    const settings = await getAdminSettings();

    expect(runtimeConfig.rssSources.length).toBeGreaterThan(0);
    expect(runtimeConfig.blacklistKeywords).toEqual([]);
    expect(runtimeConfig.ingestion.itemConcurrency).toBe(3);
    expect(runtimeConfig.ingestion.sourceConcurrency).toBe(2);
    expect(runtimeConfig.ingestion.fullTextFetchThreshold).toBe(80);
    expect(runtimeConfig.modelApi.apiKey).toBe("");
    expect(runtimeConfig.modelApi.baseURL).toBe("");
    expect(runtimeConfig.modelApi.model).toBe("gpt-4.1-mini");
    expect(runtimeConfig.prompts.itemSummary.length).toBeGreaterThan(0);
    expect(runtimeConfig.selectedPromptConfigs?.itemSummary.promptTemplate).toContain("{{sourceName}}");
    expect(runtimeConfig.prompts.itemAnalysis.length).toBeGreaterThan(0);
    expect(runtimeConfig.selectedPromptConfigs?.itemAnalysis.promptTemplate).toContain("{{title}}");

    expect(settings.modelApiConfigs).toHaveLength(1);
    expect(settings.modelApiConfigs[0]?.baseUrl).toBe("");
    expect(settings.modelApiConfigs[0]?.apiKeyMasked).toBe("");
    expect(settings.modelApiConfigs[0]?.ingestionItemConcurrency).toBe(3);
    expect(settings.promptConfigs).toHaveLength(8);
    expect(settings.promptConfigs.find((config) => config.type === "daily_report")?.systemPrompt).toContain("AI 新闻日报");
    expect(settings.promptConfigs.find((config) => config.type === "daily_report_refinement_chat")?.name).toBe(
      "默认日报微调对话提示词",
    );
    expect(settings.promptConfigs.find((config) => config.type === "daily_report_refinement_chat")?.systemPrompt).toContain(
      "持续对话",
    );
    expect(settings.promptConfigs.find((config) => config.type === "daily_report_refinement_generate")?.name).toBe(
      "默认日报微调生成提示词",
    );
    expect(settings.promptConfigs.find((config) => config.type === "daily_report_refinement_generate")?.systemPrompt).toContain(
      "既有日报草稿",
    );
    expect(settings.taskSchedule.key).toBe("ingestion_default");
    expect(settings.taskSchedule.enabled).toBe(false);
    expect(settings.taskSchedule.cronExpression).toBe("0 * * * *");
    expect(settings.taskSchedule.sourceConcurrency).toBe(2);
    expect(settings.taskSchedule.fullTextFetchThreshold).toBe(80);
    expect(settings.promptConfigs.find((config) => config.type === "item_summary")?.systemPrompt).toContain(
      "单条新闻摘要助手",
    );
    expect(settings.promptConfigs.find((config) => config.type === "item_summary")).toMatchObject({
      temperature: 0.2,
      maxTokens: 300,
      topP: null,
    });
    expect(settings.promptConfigs.find((config) => config.type === "item_analysis")?.systemPrompt).toContain(
      "固定输出格式",
    );
    expect(settings.promptConfigs.find((config) => config.type === "item_analysis")).toMatchObject({
      temperature: 0.2,
      maxTokens: 1000,
      topP: null,
    });
    expect(settings.promptConfigs.find((config) => config.type === "cluster_summary")).toMatchObject({
      temperature: 0.2,
      maxTokens: 450,
      topP: null,
    });
    expect(settings.promptConfigs.find((config) => config.type === "cluster_match")).toMatchObject({
      temperature: 0,
      maxTokens: 80,
      topP: null,
    });
  });

  it("upgrades the untouched legacy default cluster summary prompt", async () => {
    await getIngestionRuntimeConfig();
    await prisma.promptConfig.updateMany({
      where: {
        type: "cluster_summary",
        isDefault: true,
      },
      data: {
        systemPrompt: LEGACY_DEFAULT_CLUSTER_SUMMARY_PROMPT,
        maxTokens: 300,
      },
    });

    await ensureRuntimeConfigSeeded();

    const runtimeConfig = await getIngestionRuntimeConfig();
    const clusterSummaryConfig = runtimeConfig.selectedPromptConfigs?.clusterSummary;

    expect(clusterSummaryConfig?.systemPrompt).toBe(DEFAULT_CLUSTER_SUMMARY_PROMPT);
    expect(clusterSummaryConfig?.maxTokens).toBe(450);
  });

  it("does not overwrite a customized cluster summary prompt", async () => {
    await getIngestionRuntimeConfig();
    await prisma.promptConfig.updateMany({
      where: {
        type: "cluster_summary",
        isDefault: true,
      },
      data: {
        systemPrompt: "自定义聚合摘要提示词",
        maxTokens: 300,
      },
    });

    await ensureRuntimeConfigSeeded();

    const runtimeConfig = await getIngestionRuntimeConfig();
    const clusterSummaryConfig = runtimeConfig.selectedPromptConfigs?.clusterSummary;

    expect(clusterSummaryConfig?.systemPrompt).toBe("自定义聚合摘要提示词");
    expect(clusterSummaryConfig?.maxTokens).toBe(300);
  });

  it("upgrades the untouched legacy default daily report refinement generate template", async () => {
    await getIngestionRuntimeConfig();
    await prisma.promptConfig.updateMany({
      where: {
        type: "daily_report_refinement_generate",
        isDefault: true,
      },
      data: {
        prompt: LEGACY_DEFAULT_DAILY_REPORT_REFINEMENT_GENERATE_USER_PROMPT_TEMPLATE,
      },
    });

    await ensureRuntimeConfigSeeded();

    const runtimeConfig = await getIngestionRuntimeConfig();
    const promptTemplate = runtimeConfig.selectedPromptConfigs?.dailyReportRefinementGenerate.promptTemplate ?? "";

    expect(promptTemplate).toBe(DEFAULT_DAILY_REPORT_REFINEMENT_GENERATE_USER_PROMPT_TEMPLATE);
    expect(promptTemplate.indexOf("历史对话摘要或消息 JSON")).toBeLessThan(promptTemplate.indexOf("本轮管理员指令"));
  });

  it("uses enabled default configs to build the runtime mapping", async () => {
    const modelConfig = await createModelApiConfig({
      name: "默认模型配置",
      baseUrl: "https://example.com/v1",
      apiKey: "sk-live",
      modelName: "gpt-live",
      ingestionItemConcurrency: 6,
      isEnabled: true,
      isDefault: true,
    });

    await createPromptConfig({
      name: "默认条目摘要提示词",
      type: "item_summary",
      systemPrompt: "条目摘要系统提示词",
      prompt: "标题：{{title}}\n来源：{{sourceName}}\n正文：{{inputText}}",
      temperature: 0.2,
      maxTokens: 300,
      topP: null,
      modelApiConfigId: null,
      isEnabled: true,
      isDefault: true,
    });
    await createPromptConfig({
      name: "默认内容分析提示词",
      type: "item_analysis",
      systemPrompt: "分析系统提示词",
      prompt: "标题：{{title}}\n正文：{{inputText}}",
      temperature: 0.2,
      maxTokens: 1000,
      topP: null,
      modelApiConfigId: modelConfig.id,
      isEnabled: true,
      isDefault: true,
    });
    await createPromptConfig({
      name: "默认聚合摘要提示词",
      type: "cluster_summary",
      systemPrompt: "聚合系统提示词",
      prompt: "主题：{{title}}\n候选内容：{{inputText}}",
      temperature: 0.2,
      maxTokens: 300,
      topP: null,
      modelApiConfigId: null,
      isEnabled: true,
      isDefault: true,
    });
    await createPromptConfig({
      name: "默认归组判定提示词",
      type: "cluster_match",
      systemPrompt: "归组系统提示词",
      prompt: "当前内容标题：{{title}}\n候选聚合组：{{candidatesJson}}",
      temperature: 0,
      maxTokens: 80,
      topP: null,
      modelApiConfigId: null,
      isEnabled: true,
      isDefault: true,
    });

    const runtimeConfig = await getIngestionRuntimeConfig();

    expect(runtimeConfig.ingestion.itemConcurrency).toBe(6);
    expect(runtimeConfig.ingestion.sourceConcurrency).toBe(2);
    expect(runtimeConfig.ingestion.fullTextFetchThreshold).toBe(80);
    expect(runtimeConfig.modelApi.model).toBe("gpt-live");
    expect(runtimeConfig.selectedPromptConfigs?.itemSummary.systemPrompt).toBe("条目摘要系统提示词");
    expect(runtimeConfig.selectedPromptConfigs?.itemSummary.maxTokens).toBe(300);
    expect(runtimeConfig.selectedPromptConfigs?.itemAnalysis.systemPrompt).toBe("分析系统提示词");
    expect(runtimeConfig.selectedPromptConfigs?.itemAnalysis.modelApi?.model).toBe("gpt-live");
    expect(runtimeConfig.selectedPromptConfigs?.itemAnalysis.maxTokens).toBe(1000);
    expect(runtimeConfig.selectedPromptConfigs?.clusterSummary.maxTokens).toBe(300);
    expect(runtimeConfig.selectedPromptConfigs?.clusterMatch.maxTokens).toBe(80);
    expect(runtimeConfig.selectedPromptConfigs?.dailyReportRefinementChat.systemPrompt).toContain("持续对话");
    expect(runtimeConfig.selectedPromptConfigs?.dailyReportRefinementGenerate.systemPrompt).toContain("既有日报草稿");
  });

  it("prevents deleting the default model config", async () => {
    const modelConfig = await createModelApiConfig({
      name: "默认模型配置",
      baseUrl: "https://example.com/v1",
      apiKey: "sk-live",
      modelName: "gpt-live",
      ingestionItemConcurrency: 6,
      isEnabled: true,
      isDefault: true,
    });

    await expect(deleteModelApiConfig(modelConfig.id)).rejects.toThrow("默认模型配置不能删除。");
  });

  it("prevents deleting the default prompt config", async () => {
    const modelConfig = await createModelApiConfig({
      name: "默认模型配置",
      baseUrl: "https://example.com/v1",
      apiKey: "sk-live",
      modelName: "gpt-live",
      ingestionItemConcurrency: 6,
      isEnabled: true,
      isDefault: true,
    });

    const promptConfig = await createPromptConfig({
      name: "默认内容分析提示词",
      type: "item_analysis",
      systemPrompt: "分析系统提示词",
      prompt: "标题：{{title}}\n正文：{{inputText}}",
      temperature: 0.2,
      maxTokens: 1000,
      topP: null,
      modelApiConfigId: modelConfig.id,
      isEnabled: true,
      isDefault: true,
    });

    await expect(deletePromptConfig(promptConfig.id)).rejects.toThrow("默认提示词配置不能删除。");
  });

  it("blocks deleting a group that still owns sources", async () => {
    const group = await prisma.sourceGroup.create({
      data: {
        name: "Core Sources",
      },
    });

    await prisma.source.create({
      data: {
        name: "Grouped Feed",
        rssUrl: "https://grouped.example.com/feed.xml",
        siteUrl: "https://grouped.example.com",
        enabled: true,
        aiParsingEnabled: true,
        groupId: group.id,
      },
    });

    await expect(deleteSourceGroup(group.id)).rejects.toThrow(
      "Please move sources out of this group before deleting it.",
    );
  });

  it("includes each source latest item ingestion time in admin settings", async () => {
    const source = await prisma.source.create({
      data: {
        name: "Tracked Feed",
        rssUrl: "https://tracked.example.com/feed.xml",
        siteUrl: "https://tracked.example.com",
        enabled: true,
        aiParsingEnabled: true,
      },
    });

    await prisma.item.createMany({
      data: [
        {
          sourceId: source.id,
          originalUrl: "https://tracked.example.com/old",
          canonicalUrl: "https://tracked.example.com/old",
          urlHash: "tracked-old",
          dedupeSignature: "tracked|old",
          originalTitle: "Old item",
          publishedAt: new Date("2026-04-19T08:00:00.000Z"),
          createdAt: new Date("2026-04-19T08:01:00.000Z"),
        },
        {
          sourceId: source.id,
          originalUrl: "https://tracked.example.com/new",
          canonicalUrl: "https://tracked.example.com/new",
          urlHash: "tracked-new",
          dedupeSignature: "tracked|new",
          originalTitle: "New item",
          publishedAt: new Date("2026-04-20T08:00:00.000Z"),
          createdAt: new Date("2026-04-20T08:01:00.000Z"),
        },
      ],
    });

    const settings = await getAdminSettings();

    expect(settings.sources.find((entry) => entry.id === source.id)?.lastItemCreatedAt).toBe(
      "2026-04-20T08:01:00.000Z",
    );
  });

  it("imports OPML sources into matching groups", async () => {
    const importSourcesFromOpml = (
      settingsService as typeof settingsService & {
        importSourcesFromOpml?: (opmlText: string, options?: unknown) => Promise<unknown>;
      }
    ).importSourcesFromOpml;

    expect(importSourcesFromOpml).toBeTypeOf("function");

    await importSourcesFromOpml!(
      `<?xml version="1.0" encoding="UTF-8"?>
      <opml version="2.0" xmlns:infinitum="https://infinitum.app/opml">
        <body>
          <outline text="AI">
            <outline
              text="Import Feed One"
              title="Import Feed One"
              type="rss"
              xmlUrl="https://feeds.example.com/one.xml"
              htmlUrl="https://feeds.example.com/one"
            />
          </outline>
          <outline text="Infra">
            <outline
              text="Import Feed Two"
              title="Import Feed Two"
              type="rss"
              xmlUrl="https://feeds.example.com/two.xml"
              htmlUrl="https://feeds.example.com/two"
              infinitum:enabled="false"
              infinitum:aiParsingEnabled="false"
            />
          </outline>
        </body>
      </opml>`,
      {
        resolveMetadata: async () => ({
          name: "Resolved Feed",
          rssUrl: "https://feeds.example.com/fallback.xml",
          siteUrl: "https://feeds.example.com",
        }),
      },
    );

    const groups = await prisma.sourceGroup.findMany({
      orderBy: { name: "asc" },
    });
    const sources = await prisma.source.findMany({
      include: { group: true },
      orderBy: { rssUrl: "asc" },
    });

    expect(groups.map((group) => group.name)).toEqual(["AI", "Infra"]);
    expect(sources).toHaveLength(2);
    expect(sources[0]).toMatchObject({
      rssUrl: "https://feeds.example.com/one.xml",
      name: "Import Feed One",
      siteUrl: "https://feeds.example.com/one",
      group: {
        name: "AI",
      },
    });
    expect(sources[1]).toMatchObject({
      rssUrl: "https://feeds.example.com/two.xml",
      name: "Import Feed Two",
      siteUrl: "https://feeds.example.com/two",
      enabled: false,
      aiParsingEnabled: false,
      group: {
        name: "Infra",
      },
    });
  });

  it("does not reseed default sources after admins delete all sources", async () => {
    const initialSettings = await getAdminSettings();

    expect(initialSettings.sources.length).toBeGreaterThan(0);

    for (const source of initialSettings.sources) {
      await deleteSource(source.id);
    }

    const sourcesAfterDeletion = await prisma.source.findMany();
    expect(sourcesAfterDeletion).toHaveLength(0);

    const settingsAfterDeletion = await getAdminSettings();

    expect(settingsAfterDeletion.sources).toHaveLength(0);
  });
});
