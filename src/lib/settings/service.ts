import { JSDOM } from "jsdom";
import { PromptConfigType } from "@prisma/client";

import { getRuntimeConfig } from "@/config/runtime";
import type { RuntimeConfig } from "@/config/runtime";
import { prisma } from "@/lib/db";
import type { SourceConfig } from "@/lib/feed/types";
import { createRssParser } from "@/lib/ingestion/parser";
import type { RssParserLike } from "@/lib/ingestion/types";
import { getDefaultPromptConfigName, getDefaultPromptSampling, getDefaultPromptTemplate } from "@/lib/settings/ai-config";
import type {
  AdminModelApiConfig,
  AdminPromptConfig,
  AdminSettingsSnapshot,
  OpmlImportSummary,
  PromptConfigType as PromptConfigTypeValue,
  ResolvedSourceMetadata,
} from "@/lib/settings/types";
import { ensureDefaultIngestionSchedule, toTaskScheduleSnapshot } from "@/lib/tasks/service";

const DEFAULT_MODEL_CONFIG_NAME = "默认模型配置";

type SourceInput = SourceConfig & {
  groupId?: string | null;
};

type SourceMetadataOptions = {
  parser?: RssParserLike;
};

type ImportSourcesFromOpmlOptions = {
  parser?: RssParserLike;
  resolveMetadata?: (rssUrl: string) => Promise<ResolvedSourceMetadata>;
};

type ParsedOpmlSource = {
  name: string | null;
  rssUrl: string;
  siteUrl: string | null;
  groupName: string | null;
};

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

function normalizeKeyword(keyword: string) {
  return keyword.trim();
}

function normalizeText(value: string | null | undefined) {
  return value?.trim() || "";
}

function toIsoString(value: Date): string {
  return value.toISOString();
}

function tryParseUrl(value: string | null | undefined): URL | null {
  if (!value) {
    return null;
  }

  try {
    return new URL(value.trim());
  } catch {
    return null;
  }
}

function normalizeUrl(value: string | null | undefined): string | null {
  return tryParseUrl(value)?.toString() ?? null;
}

function buildSiteUrlFromRssUrl(rssUrl: string): string {
  const parsed = new URL(rssUrl);
  return new URL("/", parsed).toString();
}

function getFallbackSourceName(rssUrl: string): string {
  return new URL(rssUrl).hostname;
}

function getOutlineLabel(node: Element): string | null {
  const label = normalizeText(node.getAttribute("title")) || normalizeText(node.getAttribute("text"));
  return label || null;
}

function parseOpmlSources(opmlText: string): ParsedOpmlSource[] {
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

function toSourceConfig(source: {
  name: string;
  rssUrl: string;
  siteUrl: string;
  enabled: boolean;
  fetchFullTextWhenMissing: boolean;
}): SourceConfig {
  return {
    name: source.name,
    rssUrl: source.rssUrl,
    siteUrl: source.siteUrl,
    enabled: source.enabled,
    fetchFullTextWhenMissing: source.fetchFullTextWhenMissing,
  };
}

function serializeAdminModelApiConfig(config: {
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

function serializeRuntimeModelApi(config: {
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

function serializeAdminPromptConfig(config: {
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
}): AdminPromptConfig {
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
    modelApiConfigName: config.modelApiConfig?.name ?? null,
    isEnabled: config.isEnabled,
    isDefault: config.isDefault,
    createdAt: toIsoString(config.createdAt),
    updatedAt: toIsoString(config.updatedAt),
  };
}

function coerceNullableNumber(value: number | null | undefined) {
  return value == null ? null : value;
}

function validateIngestionConcurrency(value: number) {
  if (!Number.isInteger(value) || value < 1 || value > 10) {
    throw new Error("并发数必须是 1 到 10 之间的整数。");
  }
}

function validateModelApiInput(
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
  if (
    options?.isUpdate &&
    input.apiKeyMode === "replace" &&
    !normalizeText(input.apiKey)
  ) {
    throw new Error("替换 API Key 时不能为空。");
  }
  if (
    options?.isUpdate &&
    input.apiKeyMode === "keep" &&
    !options.currentHasApiKey &&
    !normalizeText(input.apiKey)
  ) {
    throw new Error("当前配置没有可保留的 API Key，请填写新的 API Key。");
  }
}

async function validatePromptConfigInput(
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

async function ensureModelAndPromptConfigsSeeded(
) {
  const fileConfig = getRuntimeConfig();

  const [modelConfigCount, promptConfigCount, sourceCount, blacklistCount] =
    await Promise.all([
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
    const shouldSeedDefaultSources =
      sourceCount === 0 &&
      modelConfigCount === 0 &&
      promptConfigCount === 0;

    let defaultGeneralModel =
      modelConfigCount === 0
        ? null
        : await tx.modelApiConfig.findFirst({
            where: {
              isDefault: true,
            },
            orderBy: { createdAt: "asc" },
          });

    if (modelConfigCount === 0) {
      defaultGeneralModel = await tx.modelApiConfig.create({
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
              type === PromptConfigType.item_analysis
                ? fileConfig.prompts.itemAnalysis
                : type === PromptConfigType.cluster_summary
                  ? fileConfig.prompts.clusterSummary
                  : fileConfig.prompts.clusterMatch,
            temperature: sampling.temperature,
            maxTokens: sampling.maxTokens,
            topP: sampling.topP,
            modelApiConfigId: defaultGeneralModel?.id ?? null,
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
          fetchFullTextWhenMissing: source.fetchFullTextWhenMissing,
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

function serializeSelectedPromptConfig(
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

function pickPromptConfigByType(
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

export async function getIngestionRuntimeConfig(): Promise<RuntimeConfig> {
  await ensureRuntimeConfigSeeded();

  const [sources, blacklist, defaultModelConfig, promptConfigs, taskSchedule] = await Promise.all([
    prisma.source.findMany({
      where: { enabled: true },
      orderBy: { name: "asc" },
    }),
    prisma.blacklistKeyword.findMany({
      orderBy: { keyword: "asc" },
    }),
    prisma.modelApiConfig.findFirst({
      where: {
        isEnabled: true,
        isDefault: true,
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.promptConfig.findMany({
      where: {
        isEnabled: true,
        isDefault: true,
      },
      include: {
        modelApiConfig: true,
      },
      orderBy: [{ createdAt: "asc" }],
    }),
    ensureDefaultIngestionSchedule(),
  ]);

  if (!defaultModelConfig) {
    throw new Error("缺少启用中的默认模型配置。");
  }

  const itemAnalysisConfig = pickPromptConfigByType(promptConfigs, PromptConfigType.item_analysis);
  const clusterSummaryConfig = pickPromptConfigByType(promptConfigs, PromptConfigType.cluster_summary);
  const clusterMatchConfig = pickPromptConfigByType(promptConfigs, PromptConfigType.cluster_match);

  return {
    rssSources: sources.map(toSourceConfig),
    blacklistKeywords: blacklist.map((entry) => entry.keyword),
    ingestion: {
      itemConcurrency: defaultModelConfig.ingestionItemConcurrency,
      sourceConcurrency: taskSchedule.sourceConcurrency,
      fullTextFetchThreshold: taskSchedule.fullTextFetchThreshold,
    },
    modelApi: serializeRuntimeModelApi(defaultModelConfig),
    prompts: {
      itemAnalysis: itemAnalysisConfig.systemPrompt || itemAnalysisConfig.prompt,
      clusterSummary: clusterSummaryConfig.systemPrompt || clusterSummaryConfig.prompt,
      clusterMatch: clusterMatchConfig.systemPrompt || clusterMatchConfig.prompt,
    },
    selectedPromptConfigs: {
      itemAnalysis: serializeSelectedPromptConfig(itemAnalysisConfig),
      clusterSummary: serializeSelectedPromptConfig(clusterSummaryConfig),
      clusterMatch: serializeSelectedPromptConfig(clusterMatchConfig),
    },
  };
}

export async function getAdminSettings(): Promise<AdminSettingsSnapshot> {
  await ensureRuntimeConfigSeeded();

  const [modelApiConfigs, promptConfigs, blacklist, groups, sources, taskSchedule] = await Promise.all([
    prisma.modelApiConfig.findMany({
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    }),
    prisma.promptConfig.findMany({
      include: {
        modelApiConfig: {
          select: {
            name: true,
          },
        },
      },
      orderBy: [{ type: "asc" }, { isDefault: "desc" }, { createdAt: "desc" }],
    }),
    prisma.blacklistKeyword.findMany({
      orderBy: { keyword: "asc" },
    }),
    prisma.sourceGroup.findMany({
      orderBy: { name: "asc" },
    }),
    prisma.source.findMany({
      include: { group: true },
      orderBy: [{ name: "asc" }],
    }),
    ensureDefaultIngestionSchedule(),
  ]);

  return {
    modelApiConfigs: modelApiConfigs.map(serializeAdminModelApiConfig),
    promptConfigs: promptConfigs.map(serializeAdminPromptConfig),
    blacklistKeywords: blacklist.map((entry) => entry.keyword),
    taskSchedule: toTaskScheduleSnapshot(taskSchedule),
    groups: groups.map((group) => ({
      id: group.id,
      name: group.name,
    })),
    sources: sources.map((source) => ({
      id: source.id,
      name: source.name,
      rssUrl: source.rssUrl,
      siteUrl: source.siteUrl,
      enabled: source.enabled,
      fetchFullTextWhenMissing: source.fetchFullTextWhenMissing,
      groupId: source.groupId,
      groupName: source.group?.name ?? null,
    })),
  };
}

export async function resolveSourceMetadata(
  rssUrl: string,
  options?: SourceMetadataOptions,
): Promise<ResolvedSourceMetadata> {
  const normalizedRssUrl = normalizeUrl(rssUrl);

  if (!normalizedRssUrl) {
    throw new Error("Invalid RSS URL.");
  }

  const parser = options?.parser ?? createRssParser();

  let parsedFeed;

  try {
    parsedFeed = await parser.parseURL(normalizedRssUrl);
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : "Failed to resolve RSS metadata.");
  }

  const siteUrl = normalizeUrl(parsedFeed.link) ?? buildSiteUrlFromRssUrl(normalizedRssUrl);
  const name = normalizeText(parsedFeed.title) || getFallbackSourceName(normalizedRssUrl);

  return {
    name,
    rssUrl: normalizedRssUrl,
    siteUrl,
  };
}

export async function importSourcesFromOpml(
  opmlText: string,
  options?: ImportSourcesFromOpmlOptions,
): Promise<OpmlImportSummary> {
  const parsedSources = parseOpmlSources(opmlText);
  const parser = options?.parser ?? createRssParser();
  const resolveMetadata =
    options?.resolveMetadata ??
    ((rssUrl: string) =>
      resolveSourceMetadata(rssUrl, {
        parser,
      }));
  const existingGroups = await prisma.sourceGroup.findMany();
  const groupIdByName = new Map(existingGroups.map((group) => [group.name, group.id]));
  let createdCount = 0;
  let updatedCount = 0;
  const failures: OpmlImportSummary["failures"] = [];

  for (const source of parsedSources) {
    try {
      const metadata = await resolveMetadata(source.rssUrl);
      const groupName = source.groupName ? normalizeText(source.groupName) : "";
      let groupId: string | null = null;

      if (groupName) {
        const existingGroupId = groupIdByName.get(groupName);

        if (existingGroupId) {
          groupId = existingGroupId;
        } else {
          const group = await prisma.sourceGroup.create({
            data: {
              name: groupName,
            },
          });
          groupIdByName.set(groupName, group.id);
          groupId = group.id;
        }
      }

      const existingSource = await prisma.source.findUnique({
        where: { rssUrl: source.rssUrl },
      });
      const name = source.name || metadata.name;
      const siteUrl = source.siteUrl || metadata.siteUrl;

      await prisma.source.upsert({
        where: { rssUrl: source.rssUrl },
        update: {
          name,
          siteUrl,
          groupId,
          enabled: true,
          fetchFullTextWhenMissing: true,
        },
        create: {
          name,
          rssUrl: source.rssUrl,
          siteUrl,
          groupId,
          enabled: true,
          fetchFullTextWhenMissing: true,
        },
      });

      if (existingSource) {
        updatedCount += 1;
      } else {
        createdCount += 1;
      }
    } catch (error) {
      failures.push({
        rssUrl: source.rssUrl,
        message: error instanceof Error ? error.message : "Unknown OPML import error.",
      });
    }
  }

  return {
    totalCount: parsedSources.length,
    createdCount,
    updatedCount,
    failedCount: failures.length,
    failures,
  };
}

export async function listModelApiConfigs() {
  await ensureRuntimeConfigSeeded();

  const configs = await prisma.modelApiConfig.findMany({
    orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
  });

  return configs.map(serializeAdminModelApiConfig);
}

export async function getModelApiConfig(id: string) {
  await ensureRuntimeConfigSeeded();

  const config = await prisma.modelApiConfig.findUnique({
    where: { id },
  });

  if (!config) {
    throw new Error("模型配置不存在。");
  }

  return {
    ...serializeAdminModelApiConfig(config),
    apiKeyRaw: config.apiKey,
  };
}

export async function createModelApiConfig(input: SaveModelApiConfigInput) {
  await ensureRuntimeConfigSeeded();
  validateModelApiInput(input);

  return prisma.$transaction(async (tx) => {
    if (input.isDefault) {
      await tx.modelApiConfig.updateMany({
        where: {
          isDefault: true,
        },
        data: {
          isDefault: false,
        },
      });
    }

    const config = await tx.modelApiConfig.create({
      data: {
        name: normalizeText(input.name),
        baseUrl: normalizeText(input.baseUrl),
        apiKey: input.apiKey.trim(),
        modelName: normalizeText(input.modelName),
        ingestionItemConcurrency: input.ingestionItemConcurrency,
        isEnabled: input.isEnabled,
        isDefault: input.isDefault,
      },
    });

    return serializeAdminModelApiConfig(config);
  });
}

export async function updateModelApiConfig(id: string, input: SaveModelApiConfigInput) {
  await ensureRuntimeConfigSeeded();

  const current = await prisma.modelApiConfig.findUnique({
    where: { id },
  });

  if (!current) {
    throw new Error("模型配置不存在。");
  }

  validateModelApiInput(input, {
    isUpdate: true,
    currentHasApiKey: Boolean(current.apiKey),
  });

  const nextApiKey =
    input.apiKeyMode === "clear"
      ? ""
      : input.apiKeyMode === "keep"
        ? current.apiKey
        : input.apiKey.trim();

  return prisma.$transaction(async (tx) => {
    if (input.isDefault) {
      await tx.modelApiConfig.updateMany({
        where: {
          id: { not: id },
          isDefault: true,
        },
        data: {
          isDefault: false,
        },
      });
    }

    const config = await tx.modelApiConfig.update({
      where: { id },
      data: {
        name: normalizeText(input.name),
        baseUrl: normalizeText(input.baseUrl),
        apiKey: nextApiKey,
        modelName: normalizeText(input.modelName),
        ingestionItemConcurrency: input.ingestionItemConcurrency,
        isEnabled: input.isEnabled,
        isDefault: input.isDefault,
      },
    });

    return serializeAdminModelApiConfig(config);
  });
}

export async function deleteModelApiConfig(id: string) {
  await ensureRuntimeConfigSeeded();

  const config = await prisma.modelApiConfig.findUnique({
    where: { id },
  });

  if (!config) {
    throw new Error("模型配置不存在。");
  }

  if (config.isDefault) {
    throw new Error("默认模型配置不能删除。");
  }

  await prisma.modelApiConfig.delete({
    where: { id },
  });
}

export async function fetchModelApiModels(input: FetchModelApiModelsInput) {
  await ensureRuntimeConfigSeeded();

  const baseUrl = normalizeText(input.baseUrl);
  let apiKey = normalizeText(input.apiKey);

  if (!apiKey && input.configId && input.apiKeyMode !== "clear") {
    const existingConfig = await prisma.modelApiConfig.findUnique({
      where: { id: input.configId },
    });
    apiKey = existingConfig?.apiKey ?? "";
  }

  if (!baseUrl || !apiKey) {
    throw new Error("请先填写 API 地址与密钥。");
  }

  const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/models`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
  });

  const rawResponse = await response.text();

  if (!response.ok) {
    return {
      success: false,
      message: `获取模型失败: ${response.status}`,
      models: [] as string[],
      rawResponse,
    };
  }

  let payload: { data?: Array<{ id?: string | null }> } | null = null;

  try {
    payload = JSON.parse(rawResponse) as { data?: Array<{ id?: string | null }> };
  } catch {
    return {
      success: false,
      message: "模型列表响应不是合法 JSON。",
      models: [] as string[],
      rawResponse,
    };
  }

  const models = (payload.data ?? [])
    .map((item) => normalizeText(item.id))
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right));

  return {
    success: true,
    models,
    rawResponse,
  };
}

export async function testModelApiConfig(
  id: string,
  payload?: {
    prompt?: string;
    maxTokens?: number;
  },
) {
  await ensureRuntimeConfigSeeded();

  const config = await prisma.modelApiConfig.findUnique({
    where: { id },
  });

  if (!config) {
    throw new Error("模型配置不存在。");
  }

  const prompt = normalizeText(payload?.prompt) || "请回复：OK";
  const maxTokens = payload?.maxTokens && payload.maxTokens > 0 ? payload.maxTokens : 200;

  if (!config.apiKey) {
    return {
      success: false,
      message: "当前模型配置没有 API Key。",
      content: "",
      rawResponse: "",
      statusCode: 400,
    };
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${config.apiKey}`,
    "Content-Type": "application/json",
  };
  const normalizedBaseUrl = config.baseUrl.replace(/\/+$/, "");
  const url = `${normalizedBaseUrl}/chat/completions`;
  const requestBody: Record<string, unknown> = {
    model: config.modelName,
    messages: [{ role: "user", content: prompt }],
    max_tokens: maxTokens,
    temperature: 0.2,
  };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(requestBody),
    });
    const rawResponse = await response.text();

    if (!response.ok) {
      return {
        success: false,
        message: `调用失败: ${response.status}`,
        content: rawResponse,
        rawResponse,
        statusCode: response.status,
      };
    }

    let content = rawResponse;

    try {
      const data = JSON.parse(rawResponse) as {
        choices?: Array<{ message?: { content?: string | null } }>;
      };
      content = data.choices?.[0]?.message?.content?.trim() || "";
    } catch {
      // Keep raw text fallback.
    }

    return {
      success: true,
      message: "调用成功",
      content,
      rawResponse,
      statusCode: response.status,
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "调用失败",
      content: "",
      rawResponse: "",
      statusCode: 500,
    };
  }
}

export async function listPromptConfigs() {
  await ensureRuntimeConfigSeeded();

  const configs = await prisma.promptConfig.findMany({
    include: {
      modelApiConfig: {
        select: {
          name: true,
        },
      },
    },
    orderBy: [{ type: "asc" }, { isDefault: "desc" }, { createdAt: "desc" }],
  });

  return configs.map(serializeAdminPromptConfig);
}

export async function getPromptConfig(id: string) {
  await ensureRuntimeConfigSeeded();

  const config = await prisma.promptConfig.findUnique({
    where: { id },
    include: {
      modelApiConfig: {
        select: {
          name: true,
        },
      },
    },
  });

  if (!config) {
    throw new Error("提示词配置不存在。");
  }

  return serializeAdminPromptConfig(config);
}

export async function createPromptConfig(input: SavePromptConfigInput) {
  await ensureRuntimeConfigSeeded();
  await validatePromptConfigInput(input);

  return prisma.$transaction(async (tx) => {
    if (input.isDefault) {
      await tx.promptConfig.updateMany({
        where: {
          type: input.type,
          isDefault: true,
        },
        data: {
          isDefault: false,
        },
      });
    }

    const config = await tx.promptConfig.create({
      data: {
        name: normalizeText(input.name),
        type: input.type,
        prompt: input.prompt.trim(),
        systemPrompt: input.systemPrompt?.trim() || null,
        temperature: coerceNullableNumber(input.temperature),
        maxTokens: coerceNullableNumber(input.maxTokens),
        topP: coerceNullableNumber(input.topP),
        modelApiConfigId: input.modelApiConfigId || null,
        isEnabled: input.isEnabled,
        isDefault: input.isDefault,
      },
      include: {
        modelApiConfig: {
          select: {
            name: true,
          },
        },
      },
    });

    return serializeAdminPromptConfig(config);
  });
}

export async function updatePromptConfig(id: string, input: SavePromptConfigInput) {
  await ensureRuntimeConfigSeeded();

  const current = await prisma.promptConfig.findUnique({
    where: { id },
  });

  if (!current) {
    throw new Error("提示词配置不存在。");
  }

  await validatePromptConfigInput(input, id);

  return prisma.$transaction(async (tx) => {
    if (input.isDefault) {
      await tx.promptConfig.updateMany({
        where: {
          id: { not: id },
          type: input.type,
          isDefault: true,
        },
        data: {
          isDefault: false,
        },
      });
    }

    const config = await tx.promptConfig.update({
      where: { id },
      data: {
        name: normalizeText(input.name),
        type: input.type,
        prompt: input.prompt.trim(),
        systemPrompt: input.systemPrompt?.trim() || null,
        temperature: coerceNullableNumber(input.temperature),
        maxTokens: coerceNullableNumber(input.maxTokens),
        topP: coerceNullableNumber(input.topP),
        modelApiConfigId: input.modelApiConfigId || null,
        isEnabled: input.isEnabled,
        isDefault: input.isDefault,
      },
      include: {
        modelApiConfig: {
          select: {
            name: true,
          },
        },
      },
    });

    return serializeAdminPromptConfig(config);
  });
}

export async function deletePromptConfig(id: string) {
  await ensureRuntimeConfigSeeded();

  const config = await prisma.promptConfig.findUnique({
    where: { id },
  });

  if (!config) {
    throw new Error("提示词配置不存在。");
  }

  if (config.isDefault) {
    throw new Error("默认提示词配置不能删除。");
  }

  await prisma.promptConfig.delete({
    where: { id },
  });
}

export async function replaceBlacklistKeywords(keywords: string[]) {
  const normalized = [...new Set(keywords.map(normalizeKeyword).filter(Boolean))];

  await prisma.$transaction([
    prisma.blacklistKeyword.deleteMany(),
    ...(normalized.length > 0
      ? [
          prisma.blacklistKeyword.createMany({
            data: normalized.map((keyword) => ({ keyword })),
          }),
        ]
      : []),
  ]);
}

export async function createSourceGroup(name: string) {
  return prisma.sourceGroup.create({
    data: {
      name: name.trim(),
    },
  });
}

export async function renameSourceGroup(id: string, name: string) {
  return prisma.sourceGroup.update({
    where: { id },
    data: {
      name: name.trim(),
    },
  });
}

export async function deleteSourceGroup(id: string) {
  const assignedSourceCount = await prisma.source.count({
    where: { groupId: id },
  });

  if (assignedSourceCount > 0) {
    throw new Error("Please move sources out of this group before deleting it.");
  }

  await prisma.sourceGroup.delete({
    where: { id },
  });
}

export async function createSource(input: SourceInput) {
  return prisma.source.create({
    data: {
      name: input.name,
      rssUrl: input.rssUrl,
      siteUrl: input.siteUrl,
      enabled: input.enabled,
      fetchFullTextWhenMissing: input.fetchFullTextWhenMissing,
      groupId: input.groupId ?? null,
    },
  });
}

export async function updateSource(id: string, input: SourceInput) {
  return prisma.source.update({
    where: { id },
    data: {
      name: input.name,
      rssUrl: input.rssUrl,
      siteUrl: input.siteUrl,
      enabled: input.enabled,
      fetchFullTextWhenMissing: input.fetchFullTextWhenMissing,
      groupId: input.groupId ?? null,
    },
  });
}

export async function deleteSource(id: string) {
  await prisma.source.delete({
    where: { id },
  });
}
