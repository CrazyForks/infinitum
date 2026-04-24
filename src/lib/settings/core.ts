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
}): SourceConfig {
  return {
    name: source.name,
    rssUrl: source.rssUrl,
    siteUrl: source.siteUrl,
    enabled: source.enabled,
    aiParsingEnabled: source.aiParsingEnabled,
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
    return;
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
        data: [
          PromptConfigType.item_summary,
          PromptConfigType.item_analysis,
          PromptConfigType.cluster_summary,
          PromptConfigType.cluster_match,
        ].map((type) => {
          const sampling = getDefaultPromptSampling(type);

          return {
            name: getDefaultPromptConfigName(type),
            type,
            prompt: getDefaultPromptTemplate(type),
            systemPrompt:
              type === PromptConfigType.item_summary
                ? fileConfig.prompts.itemSummary
                : type === PromptConfigType.item_analysis
                  ? fileConfig.prompts.itemAnalysis
                  : type === PromptConfigType.cluster_summary
                    ? fileConfig.prompts.clusterSummary
                    : fileConfig.prompts.clusterMatch,
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

    if (shouldSeedDefaultSources && fileConfig.rssSources.length > 0) {
      await tx.source.createMany({
        data: fileConfig.rssSources.map((source) => ({
          name: source.name,
          rssUrl: source.rssUrl,
          siteUrl: source.siteUrl,
          enabled: source.enabled,
          aiParsingEnabled: source.aiParsingEnabled,
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
