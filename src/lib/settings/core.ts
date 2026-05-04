import { JSDOM } from "jsdom";
import { PromptConfigType } from "@prisma/client";

import { getRuntimeConfig } from "@/config/runtime";
import type { RuntimeConfig } from "@/config/runtime";
import { prisma } from "@/lib/db";
import type { SourceConfig } from "@/lib/feed/types";
import { getDefaultPromptConfigName, getDefaultPromptSampling, getDefaultPromptTemplate } from "@/lib/settings/ai-config";
import type {
  AdminModelApiConfig,
  AdminPromptConfig,
  PromptConfigType as PromptConfigTypeValue,
  ResolvedSourceMetadata,
} from "@/lib/settings/types";
import { normalizeKeyword, normalizeText, normalizeUrl } from "@/lib/utils/text";

export const DEFAULT_MODEL_CONFIG_NAME = "默认模型配置";

const LEGACY_DEFAULT_CLUSTER_SUMMARY_PROMPT =
  "你是聚合摘要助手。请基于给定的多条候选内容，提炼它们共同指向的同一具体事件，并输出 100 到 200 字中文摘要。只输出摘要正文，不要输出 JSON、代码块、标题、前后缀说明或项目符号。可使用有限 Markdown 行内标记突出关键信息：用 **加粗** 标注共同事件、关键进展、结果或数字，用 *斜体* 标注必要差异点或影响；不要使用链接、图片、标题、表格或列表。摘要要突出共同事件、关键进展和必要差异点；要体现这是多条报道的归纳结果，而不是复述某一篇原文；不要写成行业综述、公司介绍或主题总结，不要编造未提供的信息。";

const LEGACY_DEFAULT_CLUSTER_MERGE_PROMPT = `你是聚合合并助手。请基于给定的多个聚合组信息，判断哪些聚合组描述的是同一具体事件但被错误地分到了不同组，输出合并建议。

判断标准：
1. 事件主体（eventSubject）一致，或指向同一公司/机构/产品的不同表述
2. 关键对象（eventObject）一致，或指向同一产品/功能/版本/政策的不同表述
3. 事件动作（eventAction）一致或高度相关
4. 事件类型（eventType）一致
5. 时间窗口接近（7天内）

注意：
- 只合并描述同一具体事件的聚合组，不要因为主题相近、赛道相同、公司相同而合并
- 如果无法确定是否同一事件，保守处理，不要合并
- 每个聚合组只能出现在一个合并组中

只输出 JSON：{"mergeGroups": [["clusterId1", "clusterId2"], ["clusterId3", "clusterId4"]]}
每个子数组第一个 ID 作为保留的目标聚合组，其余合并进去。不需要合并时输出 {"mergeGroups": []}。`;

const LEGACY_EDGE_AWARE_CLUSTER_MERGE_PROMPT = `你是聚合合并助手。请基于给定的多个聚合组信息，判断哪些聚合组描述的是同一具体事件但被错误地分到了不同组，输出合并建议。

判断标准：
1. 事件主体（eventSubject）一致，或指向同一公司/机构/产品的不同表述
2. 关键对象（eventObject）一致，或指向同一产品/功能/版本/政策的不同表述
3. 事件动作（eventAction）一致或高度相关
4. 事件类型（eventType）一致
5. 时间窗口接近（7天内）

注意：
- 只合并描述同一具体事件的聚合组，不要因为主题相近、赛道相同、公司相同而合并
- 如果无法确定是否同一事件，保守处理，不要合并
- 只能从 allowedPairs 中给出的本地候选边组合合并组；没有 allowedPairs 边连接的聚合组禁止放进同一个合并组
- 每个聚合组只能出现在一个合并组中

只输出 JSON：{"mergeGroups": [["clusterId1", "clusterId2"], ["clusterId3", "clusterId4"]]}
每个子数组第一个 ID 作为保留的目标聚合组，其余合并进去。不需要合并时输出 {"mergeGroups": []}。`;

const LEGACY_DEFAULT_CLUSTER_MERGE_USER_PROMPT_TEMPLATE = `候选聚合组 JSON：{{clustersJson}}`;

export type SourceInput = SourceConfig & {
  groupId?: string | null;
};

export type SourceMetadataOptions = {
  parser?: {
    parseURL: (url: string) => Promise<{
      link?: string | null;
      title?: string | null;
      items?: Array<{
        content?: string | null;
        "content:encoded"?: string | null;
        contentSnippet?: string | null;
      }>;
    }>;
  };
};

export type ImportSourcesFromOpmlOptions = {
  parser?: SourceMetadataOptions["parser"];
  resolveMetadata?: (rssUrl: string) => Promise<ResolvedSourceMetadata>;
};

type ParsedOpmlSource = {
  name: string | null;
  rssUrl: string;
  siteUrl: string | null;
  groupName: string | null;
  enabled: boolean | null;
  aiParsingEnabled: boolean | null;
  aggregationEnabled: boolean | null;
};

function parseOptionalBoolean(value: string | null): boolean | null {
  if (value === null) {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (["true", "1", "yes", "enabled"].includes(normalized)) {
    return true;
  }
  if (["false", "0", "no", "disabled"].includes(normalized)) {
    return false;
  }

  return null;
}

export type SaveModelApiConfigInput = {
  name: string;
  baseUrl: string;
  apiKey: string;
  apiKeyMode?: "replace" | "clear" | "keep";
  modelName: string;
  ingestionItemConcurrency: number;
  isEnabled: boolean;
  isDefault: boolean;
};

export type FetchModelApiModelsInput = {
  baseUrl: string;
  apiKey?: string;
  configId?: string;
  apiKeyMode?: "replace" | "clear" | "keep";
};

export type SavePromptConfigInput = {
  name: string;
  type: PromptConfigTypeValue;
  prompt: string;
  systemPrompt?: string | null;
  temperature?: number | null;
  maxTokens?: number | null;
  topP?: number | null;
  modelApiConfigId?: string | null;
  isEnabled: boolean;
  isDefault: boolean;
};

export function toIsoString(value: Date): string {
  return value.toISOString();
}

export function buildSiteUrlFromRssUrl(rssUrl: string): string {
  const parsed = new URL(rssUrl);
  return new URL("/", parsed).toString();
}

export function getFallbackSourceName(rssUrl: string): string {
  return new URL(rssUrl).hostname;
}

function getOutlineLabel(node: Element): string | null {
  const label = normalizeText(node.getAttribute("title")) || normalizeText(node.getAttribute("text"));
  return label || null;
}

export function parseOpmlSources(opmlText: string): ParsedOpmlSource[] {
  const trimmed = opmlText.trim();

  if (!trimmed) {
    throw new Error("OPML content is empty.");
  }

  const dom = new JSDOM(trimmed, { contentType: "text/xml" });
  const parserError = dom.window.document.querySelector("parsererror");

  if (parserError) {
    throw new Error("Invalid OPML document.");
  }

  const outlines = Array.from(dom.window.document.querySelectorAll("body > outline"));
  const sources: ParsedOpmlSource[] = [];

  function walk(nodes: Element[], currentGroupName: string | null) {
    for (const node of nodes) {
      const rssUrl = normalizeUrl(node.getAttribute("xmlUrl"));
      const siteUrl = normalizeUrl(node.getAttribute("htmlUrl"));
      const name = getOutlineLabel(node);

      if (rssUrl) {
        sources.push({
          name,
          rssUrl,
          siteUrl,
          groupName: currentGroupName,
          enabled: parseOptionalBoolean(node.getAttribute("infinitum:enabled") ?? node.getAttribute("enabled")),
          aiParsingEnabled: parseOptionalBoolean(
            node.getAttribute("infinitum:aiParsingEnabled") ?? node.getAttribute("aiParsingEnabled"),
          ),
          aggregationEnabled: parseOptionalBoolean(
            node.getAttribute("infinitum:aggregationEnabled") ?? node.getAttribute("aggregationEnabled"),
          ),
        });
        continue;
      }

      const nextGroupName = name ?? currentGroupName;
      const children = Array.from(node.children).filter((child): child is Element => child.tagName === "outline");
      walk(children, nextGroupName);
    }
  }

  walk(outlines, null);

  if (sources.length === 0) {
    throw new Error("No valid RSS subscriptions found in OPML.");
  }

  return sources;
}

function maskApiKey(apiKey: string): string {
  if (!apiKey) {
    return "";
  }

  return "•".repeat(Math.min(Math.max(apiKey.length, 8), 24));
}

export function toSourceConfig(source: {
  name: string;
  rssUrl: string;
  siteUrl: string;
  enabled: boolean;
  aiParsingEnabled: boolean;
  aggregationEnabled?: boolean;
}): SourceConfig {
  return {
    name: source.name,
    rssUrl: source.rssUrl,
    siteUrl: source.siteUrl,
    enabled: source.enabled,
    aiParsingEnabled: source.aiParsingEnabled,
    aggregationEnabled: source.aggregationEnabled,
  };
}

export function serializeAdminModelApiConfig(config: {
  id: string;
  name: string;
  baseUrl: string;
  modelName: string;
  ingestionItemConcurrency: number;
  apiKey: string;
  isEnabled: boolean;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}): AdminModelApiConfig {
  return {
    id: config.id,
    name: config.name,
    baseUrl: config.baseUrl,
    modelName: config.modelName,
    ingestionItemConcurrency: config.ingestionItemConcurrency,
    apiKeyMasked: maskApiKey(config.apiKey),
    hasApiKey: Boolean(config.apiKey),
    isEnabled: config.isEnabled,
    isDefault: config.isDefault,
    createdAt: toIsoString(config.createdAt),
    updatedAt: toIsoString(config.updatedAt),
  };
}

export function serializeRuntimeModelApi(config: {
  apiKey: string;
  baseUrl: string;
  modelName: string;
}): RuntimeConfig["modelApi"] {
  return {
    apiKey: config.apiKey,
    baseURL: config.baseUrl,
    model: config.modelName,
  };
}

export function serializeAdminPromptConfig(
  config: {
    id: string;
    name: string;
    type: PromptConfigType;
    prompt: string;
    systemPrompt: string | null;
    temperature: number | null;
    maxTokens: number | null;
    topP: number | null;
    modelApiConfigId: string | null;
    isEnabled: boolean;
    isDefault: boolean;
    createdAt: Date;
    updatedAt: Date;
    modelApiConfig?: {
      name: string;
    } | null;
  },
  defaultModelConfig?: {
    id: string;
    name: string;
  } | null,
): AdminPromptConfig {
  const isUsingDefaultModel = config.modelApiConfigId === null;
  const effectiveModelConfigName = isUsingDefaultModel ? defaultModelConfig?.name : config.modelApiConfig?.name;

  return {
    id: config.id,
    name: config.name,
    type: config.type,
    prompt: config.prompt,
    systemPrompt: config.systemPrompt,
    temperature: config.temperature,
    maxTokens: config.maxTokens,
    topP: config.topP,
    modelApiConfigId: config.modelApiConfigId,
    modelApiConfigName: effectiveModelConfigName ?? null,
    isUsingDefaultModel,
    isEnabled: config.isEnabled,
    isDefault: config.isDefault,
    createdAt: toIsoString(config.createdAt),
    updatedAt: toIsoString(config.updatedAt),
  };
}

export function coerceNullableNumber(value: number | null | undefined) {
  return value == null ? null : value;
}

function validateIngestionConcurrency(value: number) {
  if (!Number.isInteger(value) || value < 1 || value > 10) {
    throw new Error("并发数必须是 1 到 10 之间的整数。");
  }
}

export function validateModelApiInput(
  input: SaveModelApiConfigInput,
  options?: {
    isUpdate?: boolean;
    currentHasApiKey?: boolean;
  },
) {
  if (!normalizeText(input.name)) {
    throw new Error("请填写配置名称。");
  }
  if (!normalizeText(input.baseUrl)) {
    throw new Error("请填写 API 地址。");
  }
  if (!normalizeText(input.modelName)) {
    throw new Error("请填写模型名称。");
  }
  validateIngestionConcurrency(input.ingestionItemConcurrency);
  if (!options?.isUpdate && !normalizeText(input.apiKey)) {
    throw new Error("请填写 API Key。");
  }
  if (options?.isUpdate && input.apiKeyMode === "replace" && !normalizeText(input.apiKey)) {
    throw new Error("替换 API Key 时不能为空。");
  }
  if (options?.isUpdate && input.apiKeyMode === "keep" && !options.currentHasApiKey && !normalizeText(input.apiKey)) {
    throw new Error("当前配置没有可保留的 API Key，请填写新的 API Key。");
  }
}

export async function validatePromptConfigInput(
  input: SavePromptConfigInput,
  currentPromptId?: string,
) {
  if (!normalizeText(input.name)) {
    throw new Error("请填写提示词配置名称。");
  }
  if (!normalizeText(input.systemPrompt)) {
    throw new Error("请填写系统提示词。");
  }
  if (!normalizeText(input.prompt)) {
    throw new Error("请填写提示词模板。");
  }
  if (input.temperature != null && (input.temperature < 0 || input.temperature > 2)) {
    throw new Error("温度必须在 0 到 2 之间。");
  }
  if (input.maxTokens != null && input.maxTokens <= 0) {
    throw new Error("最大 Tokens 必须大于 0。");
  }
  if (input.topP != null && (input.topP < 0 || input.topP > 1)) {
    throw new Error("Top P 必须在 0 到 1 之间。");
  }

  if (input.modelApiConfigId) {
    const modelConfig = await prisma.modelApiConfig.findUnique({
      where: { id: input.modelApiConfigId },
    });

    if (!modelConfig) {
      throw new Error("关联的模型配置不存在。");
    }
  }

  if (input.isDefault) {
    const existingDefault = await prisma.promptConfig.findFirst({
      where: {
        type: input.type,
        isDefault: true,
        ...(currentPromptId ? { id: { not: currentPromptId } } : {}),
      },
    });

    if (existingDefault && !input.isEnabled) {
      throw new Error("默认提示词配置不能被保存为禁用状态。");
    }
  }
}

const ALL_PROMPT_TYPES = [
  PromptConfigType.item_summary,
  PromptConfigType.item_analysis,
  PromptConfigType.cluster_summary,
  PromptConfigType.cluster_match,
  PromptConfigType.cluster_merge,
  PromptConfigType.daily_report,
  PromptConfigType.daily_report_refinement_chat,
  PromptConfigType.daily_report_refinement_generate,
] as const;

function getLegacyDefaultClusterSummaryPromptWhere() {
  return {
    type: PromptConfigType.cluster_summary,
    name: getDefaultPromptConfigName(PromptConfigType.cluster_summary),
    prompt: getDefaultPromptTemplate(PromptConfigType.cluster_summary),
    systemPrompt: LEGACY_DEFAULT_CLUSTER_SUMMARY_PROMPT,
    temperature: 0.2,
    maxTokens: 300,
    topP: null,
    modelApiConfigId: null,
    isEnabled: true,
    isDefault: true,
  };
}

function getLegacyDefaultClusterMergePromptWhere() {
  const sampling = getDefaultPromptSampling(PromptConfigType.cluster_merge);

  return {
    type: PromptConfigType.cluster_merge,
    name: getDefaultPromptConfigName(PromptConfigType.cluster_merge),
    prompt: LEGACY_DEFAULT_CLUSTER_MERGE_USER_PROMPT_TEMPLATE,
    systemPrompt: {
      in: [
        LEGACY_DEFAULT_CLUSTER_MERGE_PROMPT,
        LEGACY_EDGE_AWARE_CLUSTER_MERGE_PROMPT,
      ],
    },
    temperature: sampling.temperature,
    maxTokens: sampling.maxTokens,
    topP: sampling.topP,
    modelApiConfigId: null,
    isEnabled: true,
    isDefault: true,
  };
}

const LEGACY_DEFAULT_DAILY_REPORT_REFINEMENT_GENERATE_USER_PROMPT_TEMPLATE = `日期：{{date}}
时区：{{timezone}}
当前日报 JSON：{{currentContentJson}}
引用来源 registry JSON：{{sourceRegistryJson}}
本轮管理员指令：{{instruction}}
历史对话摘要或消息 JSON：{{messagesJson}}`;

function getUntouchedDefaultPromptConfigWhere(type: PromptConfigType, prompt: string, fileConfig: RuntimeConfig) {
  const sampling = getDefaultPromptSampling(type);

  return {
    type,
    name: getDefaultPromptConfigName(type),
    prompt,
    systemPrompt: resolveSystemPromptByType(type, fileConfig),
    temperature: sampling.temperature,
    maxTokens: sampling.maxTokens,
    topP: sampling.topP,
    modelApiConfigId: null,
    isEnabled: true,
    isDefault: true,
  };
}

function resolveSystemPromptByType(type: PromptConfigType, fileConfig: RuntimeConfig): string {
  switch (type) {
    case PromptConfigType.item_summary:
      return fileConfig.prompts.itemSummary;
    case PromptConfigType.item_analysis:
      return fileConfig.prompts.itemAnalysis;
    case PromptConfigType.cluster_summary:
      return fileConfig.prompts.clusterSummary;
    case PromptConfigType.cluster_match:
      return fileConfig.prompts.clusterMatch;
    case PromptConfigType.cluster_merge:
      return fileConfig.prompts.clusterMerge;
    case PromptConfigType.daily_report:
      return fileConfig.prompts.dailyReport;
    case PromptConfigType.daily_report_refinement_chat:
      return fileConfig.prompts.dailyReportRefinementChat;
    case PromptConfigType.daily_report_refinement_generate:
      return fileConfig.prompts.dailyReportRefinementGenerate;
  }
}

async function ensureModelAndPromptConfigsSeeded() {
  const fileConfig = getRuntimeConfig();

  const [modelConfigCount, promptConfigCount, sourceCount, blacklistCount] = await Promise.all([
    prisma.modelApiConfig.count(),
    prisma.promptConfig.count(),
    prisma.source.count(),
    prisma.blacklistKeyword.count(),
  ]);

  if (
    modelConfigCount > 0 &&
    promptConfigCount > 0 &&
    (sourceCount > 0 || fileConfig.rssSources.length === 0) &&
    (blacklistCount > 0 || fileConfig.blacklistKeywords.length === 0)
  ) {
    // Verify all expected prompt config types exist; missing ones will be backfilled
    const [
      existingTypes,
      legacyDefaultClusterSummaryPromptCount,
      legacyDefaultClusterMergePromptCount,
      legacyDefaultDailyReportRefinementGeneratePromptCount,
    ] = await Promise.all([
      prisma.promptConfig.findMany({
        where: { type: { in: ALL_PROMPT_TYPES as unknown as PromptConfigType[] } },
        select: { type: true },
      }),
      prisma.promptConfig.count({
        where: getLegacyDefaultClusterSummaryPromptWhere(),
      }),
      prisma.promptConfig.count({
        where: getLegacyDefaultClusterMergePromptWhere(),
      }),
      prisma.promptConfig.count({
        where: getUntouchedDefaultPromptConfigWhere(
          PromptConfigType.daily_report_refinement_generate,
          LEGACY_DEFAULT_DAILY_REPORT_REFINEMENT_GENERATE_USER_PROMPT_TEMPLATE,
          fileConfig,
        ),
      }),
    ]);
    if (
      legacyDefaultClusterSummaryPromptCount === 0 &&
      legacyDefaultClusterMergePromptCount === 0 &&
      legacyDefaultDailyReportRefinementGeneratePromptCount === 0 &&
      ALL_PROMPT_TYPES.every((type) => existingTypes.some((row) => row.type === type))
    ) {
      return;
    }
  }

  await prisma.$transaction(async (tx) => {
    const shouldSeedDefaultSources = sourceCount === 0 && modelConfigCount === 0 && promptConfigCount === 0;

    if (modelConfigCount === 0) {
      await tx.modelApiConfig.create({
        data: {
          name: DEFAULT_MODEL_CONFIG_NAME,
          baseUrl: fileConfig.modelApi.baseURL,
          apiKey: fileConfig.modelApi.apiKey,
          modelName: fileConfig.modelApi.model,
          ingestionItemConcurrency: fileConfig.ingestion.itemConcurrency,
          isEnabled: true,
          isDefault: true,
        },
      });
    }

    if (promptConfigCount === 0) {
      await tx.promptConfig.createMany({
        data: ALL_PROMPT_TYPES.map((type) => {
          const sampling = getDefaultPromptSampling(type);
          return {
            name: getDefaultPromptConfigName(type),
            type,
            prompt: getDefaultPromptTemplate(type),
            systemPrompt: resolveSystemPromptByType(type, fileConfig),
            temperature: sampling.temperature,
            maxTokens: sampling.maxTokens,
            topP: sampling.topP,
            modelApiConfigId: null,
            isEnabled: true,
            isDefault: true,
          };
        }),
      });
    }

    // Backfill any missing prompt config types (e.g. added in a newer version)
    const existingTypes = (
      await tx.promptConfig.findMany({
        where: { type: { in: ALL_PROMPT_TYPES as unknown as PromptConfigType[] } },
        select: { type: true },
      })
    ).map((row) => row.type);
    const missingTypes = ALL_PROMPT_TYPES.filter((type) => !existingTypes.includes(type));

    for (const type of missingTypes) {
      const sampling = getDefaultPromptSampling(type);
      await tx.promptConfig.create({
        data: {
          name: getDefaultPromptConfigName(type),
          type,
          prompt: getDefaultPromptTemplate(type),
          systemPrompt: resolveSystemPromptByType(type, fileConfig),
          temperature: sampling.temperature,
          maxTokens: sampling.maxTokens,
          topP: sampling.topP,
          modelApiConfigId: null,
          isEnabled: true,
          isDefault: true,
        },
      });
    }

    const clusterSummarySampling = getDefaultPromptSampling(PromptConfigType.cluster_summary);
    await tx.promptConfig.updateMany({
      where: getLegacyDefaultClusterSummaryPromptWhere(),
      data: {
        systemPrompt: resolveSystemPromptByType(PromptConfigType.cluster_summary, fileConfig),
        maxTokens: clusterSummarySampling.maxTokens,
        temperature: clusterSummarySampling.temperature,
        topP: clusterSummarySampling.topP,
      },
    });

    await tx.promptConfig.updateMany({
      where: getUntouchedDefaultPromptConfigWhere(
        PromptConfigType.daily_report_refinement_generate,
        LEGACY_DEFAULT_DAILY_REPORT_REFINEMENT_GENERATE_USER_PROMPT_TEMPLATE,
        fileConfig,
      ),
      data: {
        prompt: getDefaultPromptTemplate(PromptConfigType.daily_report_refinement_generate),
      },
    });

    const clusterMergeSampling = getDefaultPromptSampling(PromptConfigType.cluster_merge);
    await tx.promptConfig.updateMany({
      where: getLegacyDefaultClusterMergePromptWhere(),
      data: {
        systemPrompt: resolveSystemPromptByType(PromptConfigType.cluster_merge, fileConfig),
        prompt: getDefaultPromptTemplate(PromptConfigType.cluster_merge),
        maxTokens: clusterMergeSampling.maxTokens,
        temperature: clusterMergeSampling.temperature,
        topP: clusterMergeSampling.topP,
      },
    });

    if (shouldSeedDefaultSources && fileConfig.rssSources.length > 0) {
      await tx.source.createMany({
        data: fileConfig.rssSources.map((source) => ({
          name: source.name,
          rssUrl: source.rssUrl,
          siteUrl: source.siteUrl,
          enabled: source.enabled,
          aiParsingEnabled: source.aiParsingEnabled,
          aggregationEnabled: source.aggregationEnabled ?? true,
        })),
      });
    }

    if (blacklistCount === 0 && fileConfig.blacklistKeywords.length > 0) {
      await tx.blacklistKeyword.createMany({
        data: fileConfig.blacklistKeywords
          .map(normalizeKeyword)
          .filter(Boolean)
          .map((keyword) => ({ keyword })),
      });
    }
  });
}

export async function ensureRuntimeConfigSeeded() {
  await ensureModelAndPromptConfigsSeeded();
}

export function serializeSelectedPromptConfig(
  config: {
    name: string;
    systemPrompt: string | null;
    prompt: string;
    temperature: number | null;
    maxTokens: number | null;
    topP: number | null;
    modelApiConfig: {
      apiKey: string;
      baseUrl: string;
      modelName: string;
      isEnabled: boolean;
    } | null;
  },
) {
  return {
    name: config.name,
    systemPrompt: config.systemPrompt || "",
    promptTemplate: config.prompt,
    temperature: config.temperature,
    maxTokens: config.maxTokens,
    topP: config.topP,
    modelApi:
      config.modelApiConfig && config.modelApiConfig.isEnabled
        ? serializeRuntimeModelApi(config.modelApiConfig)
        : null,
  };
}

export function pickPromptConfigByType(
  promptConfigs: Array<{
    type: PromptConfigType;
    name: string;
    systemPrompt: string | null;
    prompt: string;
    temperature: number | null;
    maxTokens: number | null;
    topP: number | null;
    modelApiConfig: {
      apiKey: string;
      baseUrl: string;
      modelName: string;
      isEnabled: boolean;
    } | null;
  }>,
  type: PromptConfigType,
) {
  const config = promptConfigs.find((entry) => entry.type === type);

  if (!config) {
    throw new Error(`缺少启用中的默认提示词配置：${type}`);
  }

  return config;
}

export function shouldEnableAiParsing(
  items: Array<{ content?: string | null; "content:encoded"?: string | null; contentSnippet?: string | null }>,
): boolean {
  if (items.length === 0) {
    return true;
  }

  let wellFormattedCount = 0;
  const sampleSize = Math.min(items.length, 5);

  for (let index = 0; index < sampleSize; index += 1) {
    const item = items[index];
    const hasFullContent = Boolean(item?.["content:encoded"]?.trim() || item?.content?.trim());
    const contentLength = (item?.contentSnippet ?? "").length;
    const hasGoodSnippet = contentLength >= 100;

    if (hasFullContent || hasGoodSnippet) {
      wellFormattedCount += 1;
    }
  }

  return wellFormattedCount / sampleSize < 0.6;
}
