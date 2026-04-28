import OpenAI from "openai";

import {
  MODEL_API_CIRCUIT_BREAKER_FAILURE_THRESHOLD,
  MODEL_API_CIRCUIT_BREAKER_OPEN_MS,
  MODEL_API_CIRCUIT_BREAKER_WINDOW_MS,
} from "@/config/constants";
import {
  DEFAULT_CLUSTER_MATCH_PROMPT,
  DEFAULT_CLUSTER_MATCH_USER_PROMPT_TEMPLATE,
  DEFAULT_CLUSTER_MERGE_PROMPT,
  DEFAULT_CLUSTER_MERGE_USER_PROMPT_TEMPLATE,
  DEFAULT_CLUSTER_SUMMARY_PROMPT,
  DEFAULT_CLUSTER_SUMMARY_USER_PROMPT_TEMPLATE,
  DEFAULT_DAILY_REPORT_PROMPT,
  DEFAULT_DAILY_REPORT_USER_PROMPT_TEMPLATE,
  DEFAULT_ITEM_ANALYSIS_PROMPT,
  DEFAULT_ITEM_ANALYSIS_USER_PROMPT_TEMPLATE,
  DEFAULT_ITEM_SUMMARY_PROMPT,
  DEFAULT_ITEM_SUMMARY_USER_PROMPT_TEMPLATE,
} from "@/config/prompts";
import type { RuntimeConfig } from "@/config/runtime";
import { normalizeOptionalText } from "@/lib/utils/text";

export type AiEventSignature = {
  eventType:
    | "release"
    | "launch"
    | "update"
    | "funding"
    | "acquisition"
    | "partnership"
    | "policy"
    | "research"
    | "security"
    | "other"
    | null;
  eventSubject: string | null;
  eventAction: string | null;
  eventObject: string | null;
  eventDate: string | null;
};

export type AiEnrichment = {
  translatedTitle: string | null;
  moderationStatus: "allowed" | "filtered" | "restored";
  moderationReason: "marketing" | "low_quality" | "duplicate_noise" | "rule_filter" | "rule_blacklist" | "other" | null;
  moderationDetail: string | null;
  qualityScore: number;
  qualityRationale: string;
  eventSignature: AiEventSignature;
};

type ParsedEnrichmentResult =
  | {
      ok: true;
      recovered: boolean;
      value: AiEnrichment;
    }
  | {
      ok: false;
      reason: string;
    };

export type MergeGroup = string[];

export type AiProvider = {
  summarizeItem(inputText: string, metadata: { title: string; sourceName?: string }): Promise<string>;
  enrichContent(
    inputText: string,
    metadata: { title: string; sourceName?: string; translateTitle: boolean },
  ): Promise<AiEnrichment>;
  summarizeCluster(inputText: string, metadata: { title: string }): Promise<string>;
  matchClusterCandidate(
    inputText: string,
    metadata: { title: string; candidates: Array<{ id: string; title: string; summary: string }> },
  ): Promise<string | null>;
  mergeClusters(clustersJson: string): Promise<MergeGroup[]>;
  generateDailyReport(
    input: { date: string; timezone: string; articles: unknown[] },
  ): Promise<string | null>;
  repairDailyReportJson(rawContent: string): Promise<string | null>;
};

type OpenAICompatibleClient = {
  chat: {
    completions: {
      create: (payload: Record<string, unknown>) => Promise<{
        choices?: Array<{
          message?: {
            content?: string | null;
          };
        }>;
      }>;
    };
  };
};

type PromptRuntimeConfig = {
  systemPrompt: string;
  promptTemplate: string;
  temperature?: number | null;
  maxTokens?: number | null;
  topP?: number | null;
  modelApi?: RuntimeConfig["modelApi"] | null;
};

type PromptOverrides = {
  itemSummary?: PromptRuntimeConfig;
  itemAnalysis?: PromptRuntimeConfig;
  clusterSummary?: PromptRuntimeConfig;
  clusterMatch?: PromptRuntimeConfig;
  clusterMerge?: PromptRuntimeConfig;
  dailyReport?: PromptRuntimeConfig;
};

type CompletionResponseFormat = {
  type: "json_object";
};

type ModelApiCircuitState = {
  failures: number[];
  openUntil: number;
};

const modelApiCircuitStates = new Map<string, ModelApiCircuitState>();

function getClient(config: RuntimeConfig["modelApi"]): OpenAICompatibleClient | null {
  const apiKey = config.apiKey;

  if (!apiKey) {
    return null;
  }

  // The official SDK uses overloaded method signatures that are wider than our
  // lightweight compatibility interface, so we narrow it at the boundary.
  return new OpenAI({
    apiKey,
    baseURL: config.baseURL || undefined,
  }) as unknown as OpenAICompatibleClient;
}

function getModelApiCircuitKey(config: RuntimeConfig["modelApi"]) {
  return [config.apiKey, config.baseURL, config.model].join("|");
}

function isSameModelApiConfig(left: RuntimeConfig["modelApi"], right: RuntimeConfig["modelApi"]) {
  return left.apiKey === right.apiKey && left.baseURL === right.baseURL && left.model === right.model;
}

function getCircuitState(config: RuntimeConfig["modelApi"]) {
  const key = getModelApiCircuitKey(config);
  const existing = modelApiCircuitStates.get(key);

  if (existing) {
    return existing;
  }

  const next = { failures: [], openUntil: 0 };
  modelApiCircuitStates.set(key, next);
  return next;
}

function isCircuitOpen(config: RuntimeConfig["modelApi"], now = Date.now()) {
  return getCircuitState(config).openUntil > now;
}

function recordModelApiSuccess(config: RuntimeConfig["modelApi"]) {
  const state = getCircuitState(config);
  state.failures = [];
  state.openUntil = 0;
}

function recordModelApiFailure(config: RuntimeConfig["modelApi"], now = Date.now()) {
  const state = getCircuitState(config);
  const windowStart = now - MODEL_API_CIRCUIT_BREAKER_WINDOW_MS;
  state.failures = [...state.failures.filter((timestamp) => timestamp >= windowStart), now];

  if (state.failures.length >= MODEL_API_CIRCUIT_BREAKER_FAILURE_THRESHOLD) {
    state.openUntil = now + MODEL_API_CIRCUIT_BREAKER_OPEN_MS;
  }

  return state.openUntil > now;
}

function getClientForConfig(
  config: RuntimeConfig["modelApi"],
  cache: Map<string, OpenAICompatibleClient | null>,
): OpenAICompatibleClient | null {
  const cacheKey = [
    config.apiKey,
    config.baseURL,
    config.model,
  ].join("|");

  if (cache.has(cacheKey)) {
    return cache.get(cacheKey) ?? null;
  }

  const client = getClient(config);
  cache.set(cacheKey, client);
  return client;
}

function renderPromptTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key: string) => values[key] ?? "");
}

function getFallbackEnrichment(
  metadata: { title: string; translateTitle: boolean },
): AiEnrichment {
  return {
    translatedTitle: metadata.translateTitle ? metadata.title : null,
    moderationStatus: "allowed",
    moderationReason: null,
    moderationDetail: null,
    qualityScore: 50,
    qualityRationale: "AI analysis unavailable",
    eventSignature: {
      eventType: null,
      eventSubject: null,
      eventAction: null,
      eventObject: null,
      eventDate: null,
    },
  };
}

function getFallbackSummary(inputText: string): string {
  return inputText.trim();
}

function stripCodeFence(value: string): string {
  return value.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
}

function parseSummaryOutput(rawContent: string, fallback: string): string {
  const normalized = stripCodeFence(rawContent);
  return normalized || fallback;
}

function parseJsonLikeEnrichment(
  rawContent: string,
  fallback: AiEnrichment,
  translateTitle: boolean,
): ParsedEnrichmentResult {
  const normalized = stripCodeFence(rawContent);

  try {
    const parsed = JSON.parse(normalized) as {
      translatedTitle?: string | null;
      moderationStatus?: string | null;
      moderationReason?: string | null;
      moderationDetail?: string | null;
      qualityScore?: number | string | null;
      qualityRationale?: string | null;
      eventType?: string | null;
      eventSubject?: string | null;
      eventAction?: string | null;
      eventObject?: string | null;
      eventDate?: string | null;
      eventSignature?: {
        eventType?: string | null;
        eventSubject?: string | null;
        eventAction?: string | null;
        eventObject?: string | null;
        eventDate?: string | null;
      } | null;
    };

    return {
      ok: true,
      recovered: false,
      value: buildEnrichmentFromParsed(parsed, fallback, translateTitle),
    };
  } catch {
    // Fall through to tolerant parsing below.
  }

  const translatedTitleMatch = normalized.match(
    /"?translatedTitle"?\s*:\s*(?:"([^"]*)"|'([^']*)'|([^,\n}]+))/i,
  );
  const hasStructuredField =
    translatedTitleMatch ||
    /"?moderationStatus"?\s*:/i.test(normalized) ||
    /"?qualityScore"?\s*:/i.test(normalized) ||
    /"?eventType"?\s*:/i.test(normalized) ||
    /"?eventSignature"?\s*:/i.test(normalized);

  if (!hasStructuredField) {
    return {
      ok: false,
      reason: `Unable to parse model response: ${normalized.slice(0, 200)}`,
    };
  }

  const translatedCandidate = translatedTitleMatch
    ? translatedTitleMatch[1] ?? translatedTitleMatch[2] ?? translatedTitleMatch[3] ?? ""
    : "";

  return {
    ok: true,
    recovered: true,
    value: {
      translatedTitle: translateTitle ? translatedCandidate.trim() || fallback.translatedTitle : null,
      moderationStatus: fallback.moderationStatus,
      moderationReason: fallback.moderationReason,
      moderationDetail: fallback.moderationDetail,
      qualityScore: fallback.qualityScore,
      qualityRationale: fallback.qualityRationale,
      eventSignature: fallback.eventSignature,
    },
  };
}

function normalizeModerationStatus(value: string | null | undefined): AiEnrichment["moderationStatus"] {
  return value === "filtered" || value === "restored" ? value : "allowed";
}

function normalizeModerationReason(value: string | null | undefined): AiEnrichment["moderationReason"] {
  return value === "marketing" ||
    value === "low_quality" ||
    value === "duplicate_noise" ||
    value === "rule_filter" ||
    value === "rule_blacklist" ||
    value === "other"
    ? value
    : null;
}

function normalizeScore(value: number | string | null | undefined, fallback: number): number {
  const numeric = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;

  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  return Math.max(0, Math.min(100, Math.round(numeric)));
}

function normalizeEventType(value: string | null | undefined): AiEventSignature["eventType"] {
  return value === "release" ||
    value === "launch" ||
    value === "update" ||
    value === "funding" ||
    value === "acquisition" ||
    value === "partnership" ||
    value === "policy" ||
    value === "research" ||
    value === "security" ||
    value === "other"
    ? value
    : null;
}

function normalizeEventDate(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null;
}

function buildEventSignatureFromParsed(
  parsed: {
    eventType?: string | null;
    eventSubject?: string | null;
    eventAction?: string | null;
    eventObject?: string | null;
    eventDate?: string | null;
    eventSignature?: {
      eventType?: string | null;
      eventSubject?: string | null;
      eventAction?: string | null;
      eventObject?: string | null;
      eventDate?: string | null;
    } | null;
  },
  fallback: AiEventSignature,
): AiEventSignature {
  const parsedSignature = parsed.eventSignature ?? {};

  return {
    eventType: normalizeEventType(parsed.eventType ?? parsedSignature.eventType) ?? fallback.eventType,
    eventSubject: normalizeOptionalText(parsed.eventSubject ?? parsedSignature.eventSubject, fallback.eventSubject),
    eventAction: normalizeOptionalText(parsed.eventAction ?? parsedSignature.eventAction, fallback.eventAction),
    eventObject: normalizeOptionalText(parsed.eventObject ?? parsedSignature.eventObject, fallback.eventObject),
    eventDate: normalizeEventDate(parsed.eventDate ?? parsedSignature.eventDate) ?? fallback.eventDate,
  };
}

function buildEnrichmentFromParsed(
  parsed: {
    translatedTitle?: string | null;
    moderationStatus?: string | null;
    moderationReason?: string | null;
    moderationDetail?: string | null;
    qualityScore?: number | string | null;
    qualityRationale?: string | null;
    eventType?: string | null;
    eventSubject?: string | null;
    eventAction?: string | null;
    eventObject?: string | null;
    eventDate?: string | null;
    eventSignature?: {
      eventType?: string | null;
      eventSubject?: string | null;
      eventAction?: string | null;
      eventObject?: string | null;
      eventDate?: string | null;
    } | null;
  },
  fallback: AiEnrichment,
  translateTitle: boolean,
): AiEnrichment {
  return {
    translatedTitle: translateTitle ? parsed.translatedTitle?.trim() || fallback.translatedTitle : null,
    moderationStatus: normalizeModerationStatus(parsed.moderationStatus),
    moderationReason: normalizeModerationReason(parsed.moderationReason),
    moderationDetail: parsed.moderationDetail?.trim() || fallback.moderationDetail,
    qualityScore: normalizeScore(parsed.qualityScore, fallback.qualityScore),
    qualityRationale: parsed.qualityRationale?.trim() || fallback.qualityRationale,
    eventSignature: buildEventSignatureFromParsed(parsed, fallback.eventSignature),
  };
}

function parseMergeGroups(rawContent: string, validClusterIds: string[]): string[][] {
  const normalized = stripCodeFence(rawContent);
  const validSet = new Set(validClusterIds);

  try {
    const parsed = JSON.parse(normalized) as { mergeGroups?: unknown };
    if (!Array.isArray(parsed.mergeGroups)) {
      return [];
    }

    const groups: string[][] = [];
    const seenIds = new Set<string>();

    for (const group of parsed.mergeGroups) {
      if (!Array.isArray(group) || group.length < 2) {
        continue;
      }
      const validGroup: string[] = [];
      for (const id of group) {
        if (typeof id === "string" && validSet.has(id) && !seenIds.has(id)) {
          validGroup.push(id);
          seenIds.add(id);
        }
      }
      if (validGroup.length >= 2) {
        groups.push(validGroup);
      }
    }

    return groups;
  } catch {
    return [];
  }
}

function parseClusterMatchCandidateId(rawContent: string, candidateIds: string[]): string | null {
  const normalized = stripCodeFence(rawContent);

  try {
    const parsed = JSON.parse(normalized) as { clusterId?: string | null };
    const clusterId = parsed.clusterId?.trim() || "";

    if (clusterId && candidateIds.includes(clusterId)) {
      return clusterId;
    }
  } catch {
    // Fall through to tolerant parsing below.
  }

  const clusterIdMatch = normalized.match(/"?clusterId"?\s*:\s*(?:"([^"]*)"|'([^']*)'|([^,\n}]+))/i);
  const clusterId = (clusterIdMatch?.[1] ?? clusterIdMatch?.[2] ?? clusterIdMatch?.[3] ?? "").trim();

  return clusterId && candidateIds.includes(clusterId) ? clusterId : null;
}

function resolvePromptConfig(
  defaultSystemPrompt: string,
  defaultPromptTemplate: string,
  runtimeOverride: PromptRuntimeConfig | undefined,
): PromptRuntimeConfig {
  if (runtimeOverride) {
    return {
      systemPrompt: runtimeOverride.systemPrompt || defaultSystemPrompt,
      promptTemplate: runtimeOverride.promptTemplate || defaultPromptTemplate,
      temperature: runtimeOverride.temperature,
      maxTokens: runtimeOverride.maxTokens,
      topP: runtimeOverride.topP,
      modelApi: runtimeOverride.modelApi,
    };
  }

  return {
    systemPrompt: defaultSystemPrompt,
    promptTemplate: defaultPromptTemplate,
  };
}

async function completeText(
  client: OpenAICompatibleClient,
  config: RuntimeConfig["modelApi"],
  promptConfig: PromptRuntimeConfig,
  userContent: string,
  options?: {
    responseFormat?: CompletionResponseFormat;
  },
): Promise<string> {
  const response = await client.chat.completions.create({
    model: config.model,
    messages: [
      {
        role: "system",
        content: promptConfig.systemPrompt,
      },
      {
        role: "user",
        content: userContent,
      },
    ],
    max_tokens: promptConfig.maxTokens ?? undefined,
    temperature: promptConfig.temperature ?? undefined,
    top_p: promptConfig.topP ?? undefined,
    response_format: options?.responseFormat,
  });

  return response.choices?.[0]?.message?.content?.trim() || "";
}

export function createAiProvider(
  config: RuntimeConfig["modelApi"],
  promptOverrides?: PromptOverrides | null,
  clientOverrideArg?: OpenAICompatibleClient | null,
): AiProvider {
  const globalClient = clientOverrideArg ?? getClient(config);
  const clientCache = new Map<string, OpenAICompatibleClient | null>();
  const itemSummaryConfig = resolvePromptConfig(
    DEFAULT_ITEM_SUMMARY_PROMPT,
    DEFAULT_ITEM_SUMMARY_USER_PROMPT_TEMPLATE,
    promptOverrides?.itemSummary,
  );
  const itemAnalysisConfig = resolvePromptConfig(
    DEFAULT_ITEM_ANALYSIS_PROMPT,
    DEFAULT_ITEM_ANALYSIS_USER_PROMPT_TEMPLATE,
    promptOverrides?.itemAnalysis,
  );
  const clusterSummaryConfig = resolvePromptConfig(
    DEFAULT_CLUSTER_SUMMARY_PROMPT,
    DEFAULT_CLUSTER_SUMMARY_USER_PROMPT_TEMPLATE,
    promptOverrides?.clusterSummary,
  );
  const clusterMatchConfig = resolvePromptConfig(
    DEFAULT_CLUSTER_MATCH_PROMPT,
    DEFAULT_CLUSTER_MATCH_USER_PROMPT_TEMPLATE,
    promptOverrides?.clusterMatch,
  );
  const clusterMergeConfig = resolvePromptConfig(
    DEFAULT_CLUSTER_MERGE_PROMPT,
    DEFAULT_CLUSTER_MERGE_USER_PROMPT_TEMPLATE,
    promptOverrides?.clusterMerge,
  );
  const dailyReportConfig = resolvePromptConfig(
    DEFAULT_DAILY_REPORT_PROMPT,
    DEFAULT_DAILY_REPORT_USER_PROMPT_TEMPLATE,
    promptOverrides?.dailyReport,
  );

  const getExecutionConfig = (promptConfig: PromptRuntimeConfig) => promptConfig.modelApi ?? config;
  const getExecutionClient = (promptConfig: PromptRuntimeConfig) => {
    const executionConfig = getExecutionConfig(promptConfig);
    if (clientOverrideArg) {
      return globalClient;
    }
    if (
      isSameModelApiConfig(executionConfig, config)
    ) {
      return globalClient;
    }
    return getClientForConfig(executionConfig, clientCache);
  };
  const getClientForExecutionConfig = (executionConfig: RuntimeConfig["modelApi"]) => {
    if (clientOverrideArg || isSameModelApiConfig(executionConfig, config)) {
      return globalClient;
    }

    return getClientForConfig(executionConfig, clientCache);
  };
  const completeTextWithCircuitBreaker = async (
    promptConfig: PromptRuntimeConfig,
    userContent: string,
    options?: {
      responseFormat?: CompletionResponseFormat;
    },
  ) => {
    const executionConfig = getExecutionConfig(promptConfig);
    const isDefaultModel = isSameModelApiConfig(executionConfig, config);
    const selectedConfig = !isDefaultModel && isCircuitOpen(executionConfig) ? config : executionConfig;
    const selectedClient = getClientForExecutionConfig(selectedConfig);

    if (!selectedClient) {
      return null;
    }

    try {
      const output = await completeText(selectedClient, selectedConfig, promptConfig, userContent, options);

      if (!isDefaultModel && isSameModelApiConfig(selectedConfig, executionConfig)) {
        recordModelApiSuccess(executionConfig);
      }

      return output;
    } catch (error) {
      if (isDefaultModel || !isSameModelApiConfig(selectedConfig, executionConfig)) {
        throw error;
      }

      const opened = recordModelApiFailure(executionConfig);
      if (!opened) {
        throw error;
      }

      const defaultClient = getClientForExecutionConfig(config);
      if (!defaultClient) {
        throw error;
      }

      return completeText(defaultClient, config, promptConfig, userContent, options);
    }
  };

  return {
    async summarizeItem(inputText, metadata) {
      const fallback = getFallbackSummary(inputText);
      const output = await completeTextWithCircuitBreaker(
        itemSummaryConfig,
        renderPromptTemplate(itemSummaryConfig.promptTemplate, {
          title: metadata.title,
          sourceName: metadata.sourceName ?? "未知来源",
          inputText,
        }),
      );

      if (output == null) {
        return fallback;
      }

      return parseSummaryOutput(output, fallback);
    },
    async enrichContent(inputText, metadata) {
      const fallback = getFallbackEnrichment(metadata);
      const executionClient = getExecutionClient(itemAnalysisConfig);

      let lastFailureReason = "Unknown invalid ai enrichment response";
      let recoveredFallback: AiEnrichment | null = null;
      const userContent = renderPromptTemplate(itemAnalysisConfig.promptTemplate, {
        title: metadata.title,
        sourceName: metadata.sourceName ?? "未知来源",
        translateTitle: metadata.translateTitle ? "是" : "否",
        inputText,
      });

      if (!executionClient) {
        return fallback;
      }

      for (let attempt = 0; attempt < 2; attempt += 1) {
        const output = await completeTextWithCircuitBreaker(
          itemAnalysisConfig,
          userContent,
          {
            responseFormat: { type: "json_object" },
          },
        );

        if (output == null) {
          return fallback;
        }

        const parsed = parseJsonLikeEnrichment(output, fallback, metadata.translateTitle);

        if (parsed.ok) {
          if (!parsed.recovered) {
            return parsed.value;
          }

          recoveredFallback = parsed.value;
          lastFailureReason = `Recovered malformed model response: ${output.slice(0, 200)}`;
          continue;
        }

        lastFailureReason = parsed.reason;
      }

      if (recoveredFallback) {
        return recoveredFallback;
      }

      throw new Error(`Invalid AI enrichment response after retry. ${lastFailureReason}`);
    },
    async summarizeCluster(inputText, metadata) {
      const fallback = getFallbackSummary(inputText);
      const output = await completeTextWithCircuitBreaker(
        clusterSummaryConfig,
        renderPromptTemplate(clusterSummaryConfig.promptTemplate, {
          title: metadata.title,
          inputText,
        }),
      );

      if (output == null) {
        return fallback;
      }

      return parseSummaryOutput(output, fallback);
    },
    async matchClusterCandidate(inputText, metadata) {
      if (metadata.candidates.length === 0) {
        return null;
      }

      const output = await completeTextWithCircuitBreaker(
        clusterMatchConfig,
        renderPromptTemplate(clusterMatchConfig.promptTemplate, {
          title: metadata.title,
          inputText,
          candidatesJson: JSON.stringify(metadata.candidates),
        }),
        {
          responseFormat: { type: "json_object" },
        },
      );

      if (output == null) {
        return null;
      }

      return parseClusterMatchCandidateId(
        output,
        metadata.candidates.map((candidate) => candidate.id),
      );
    },
    async mergeClusters(clustersJson) {
      const parsed = JSON.parse(clustersJson) as Array<{ id: string }>;
      const validIds = parsed.map((c) => c.id);
      const output = await completeTextWithCircuitBreaker(
        clusterMergeConfig,
        renderPromptTemplate(clusterMergeConfig.promptTemplate, {
          clustersJson,
        }),
        {
          responseFormat: { type: "json_object" },
        },
      );

      if (output == null) {
        return [];
      }

      return parseMergeGroups(output, validIds);
    },
    async generateDailyReport(input) {
      return completeTextWithCircuitBreaker(
        dailyReportConfig,
        renderPromptTemplate(dailyReportConfig.promptTemplate, {
          date: input.date,
          timezone: input.timezone,
          articlesJson: JSON.stringify(input.articles),
        }),
        {
          responseFormat: { type: "json_object" },
        },
      );
    },
    async repairDailyReportJson(rawContent) {
      return completeTextWithCircuitBreaker(
        {
          ...dailyReportConfig,
          systemPrompt: "你是 JSON 修复器。请把用户提供的内容修复为合法 JSON 对象，只输出修复后的 JSON，不要输出 Markdown、代码块或解释。不要补充新事实，不要改写字段含义。",
          temperature: 0,
          maxTokens: dailyReportConfig.maxTokens ?? 4096,
        },
        `待修复内容：\n${rawContent}`,
        {
          responseFormat: { type: "json_object" },
        },
      );
    },
  };
}
