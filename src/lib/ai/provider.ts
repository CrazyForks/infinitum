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
  DEFAULT_DAILY_REPORT_REFINEMENT_CHAT_PROMPT,
  DEFAULT_DAILY_REPORT_REFINEMENT_CHAT_USER_PROMPT_TEMPLATE,
  DEFAULT_DAILY_REPORT_REFINEMENT_GENERATE_PROMPT,
  DEFAULT_DAILY_REPORT_REFINEMENT_GENERATE_USER_PROMPT_TEMPLATE,
  DEFAULT_DAILY_REPORT_USER_PROMPT_TEMPLATE,
  DEFAULT_ITEM_AGGREGATION_ANALYSIS_PROMPT,
  DEFAULT_ITEM_AGGREGATION_USER_PROMPT_TEMPLATE,
  DEFAULT_ITEM_ANALYSIS_PROMPT,
  DEFAULT_ITEM_ANALYSIS_USER_PROMPT_TEMPLATE,
  DEFAULT_ITEM_SUMMARY_PROMPT,
  DEFAULT_ITEM_SUMMARY_USER_PROMPT_TEMPLATE,
} from "@/config/prompts";
import type { RuntimeConfig } from "@/config/runtime";
import { shouldRegenerateChineseSummary } from "@/lib/ai/summary-language";
import type { DailyReportContent, DailyReportSourceRegistryEntry } from "@/lib/daily-report/types";
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

export type ItemSummaryResult = {
  summary: string;
  isAggregation: boolean;
};

export type ParsedEventSignature = {
  eventType: string | null;
  eventSubject: string | null;
  eventAction: string | null;
  eventObject: string | null;
  eventDate: string | null;
};

export type ParsedEvent = ParsedEventSignature & {
  title: string | null;
  oneLiner: string;
  qualityScore: number;
  sourceUrl: string | null;
};

export type ParsedAggregation = {
  mainEvent: ParsedEventSignature | null;
  events: ParsedEvent[];
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
  summarizeItem(inputText: string, metadata: { title: string; sourceName?: string }): Promise<ItemSummaryResult>;
  parseAggregation(inputText: string, metadata: { title: string; sourceName?: string }): Promise<ParsedAggregation>;
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
  streamDailyReportRefinement(input: {
    date: string;
    timezone: string;
    currentContent: DailyReportContent;
    sourceRegistry: DailyReportSourceRegistryEntry[];
    instruction: string;
    messages: Array<{ role: string; content: string }>;
  }): AsyncIterable<string>;
  streamDailyReportRefinementChat(input: {
    date: string;
    timezone: string;
    currentContent: DailyReportContent;
    sourceRegistry: DailyReportSourceRegistryEntry[];
    instruction: string;
    messages: Array<{ role: string; content: string }>;
  }): AsyncIterable<string>;
  repairDailyReportJson(rawContent: string): Promise<string | null>;
};

type CompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
};

type CompletionStreamChunk = {
  choices?: Array<{
    delta?: {
      content?: string | null;
    };
  }>;
};

type OpenAICompatibleClient = {
  chat: {
    completions: {
      create: (payload: Record<string, unknown>) => Promise<CompletionResponse> | AsyncIterable<CompletionStreamChunk>;
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
  itemAggregation?: PromptRuntimeConfig;
  clusterSummary?: PromptRuntimeConfig;
  clusterMatch?: PromptRuntimeConfig;
  clusterMerge?: PromptRuntimeConfig;
  dailyReport?: PromptRuntimeConfig;
  dailyReportRefinementChat?: PromptRuntimeConfig;
  dailyReportRefinementGenerate?: PromptRuntimeConfig;
};

export type AiProviderOptions = {
  aggregationSplitMaxEvents?: number;
};

type CompletionResponseFormat = {
  type: "json_object";
};

const DEFAULT_PARSED_AGGREGATION_MAX_EVENTS = 20;

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
    defaultHeaders: config.customHeaders,
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

function renderPromptTemplate(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key: string) => String(values[key] ?? ""));
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

function getFallbackSummary(inputText: string): ItemSummaryResult {
  return { summary: inputText.trim(), isAggregation: false };
}

function getFallbackAggregation(): ParsedAggregation {
  return { mainEvent: null, events: [] };
}

function stripCodeFence(value: string): string {
  return value.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
}

function parseSummaryAndClassification(rawContent: string, fallback: ItemSummaryResult): ItemSummaryResult {
  const normalized = stripCodeFence(rawContent);

  if (!normalized) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(normalized) as { summary?: string; isAggregation?: boolean };
    const summary = typeof parsed.summary === "string" ? parsed.summary.trim() : "";
    const isAggregation = parsed.isAggregation === true;

    if (summary) {
      return { summary, isAggregation };
    }
  } catch {
    // Fall through to tolerant parsing below.
  }

  const recoveredSummary = recoverSummaryFromJsonLikeOutput(normalized);
  if (recoveredSummary) {
    return { summary: recoveredSummary, isAggregation: fallback.isAggregation };
  }

  // Tolerant fallback: treat the whole output as the summary, mark non-aggregation.
  return { summary: normalized, isAggregation: fallback.isAggregation };
}

function recoverSummaryFromJsonLikeOutput(value: string): string {
  const match = value.match(/^\s*\{\s*"summary"\s*:\s*"([\s\S]*)/);
  if (!match?.[1]) {
    return "";
  }

  const rawSummary = match[1];
  const closingQuoteIndex = rawSummary.search(/"[\s,}]*("isAggregation"|})/);
  const candidate = closingQuoteIndex >= 0 ? rawSummary.slice(0, closingQuoteIndex) : rawSummary;

  try {
    return JSON.parse(`"${candidate.replace(/\\?$/, "")}"`).trim();
  } catch {
    return candidate
      .replace(/\\"/g, "\"")
      .replace(/\\\\/g, "\\")
      .replace(/\\n/g, "\n")
      .trim();
  }
}

function parseSummaryOutput(rawContent: string, fallback: string): string {
  const normalized = stripCodeFence(rawContent);
  return normalized || fallback;
}

function normalizeAggregationSplitMaxEvents(value: number | null | undefined) {
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : DEFAULT_PARSED_AGGREGATION_MAX_EVENTS;
}

function parseAggregationOutput(
  rawContent: string,
  fallback: ParsedAggregation,
  maxEvents = DEFAULT_PARSED_AGGREGATION_MAX_EVENTS,
): ParsedAggregation {
  const normalized = stripCodeFence(rawContent);

  if (!normalized) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(normalized) as {
      mainEvent?: Partial<ParsedEventSignature> | null;
      events?: Array<Partial<ParsedEvent>>;
    };

    const events = Array.isArray(parsed.events)
      ? parsed.events
          .map((event) => normalizeParsedEvent(event))
          .filter((event): event is ParsedEvent => event !== null)
          .slice(0, maxEvents)
      : [];

    const mainEvent = normalizeParsedEventSignature(parsed.mainEvent);

    return { mainEvent, events };
  } catch (error) {
    throw new Error(
      `聚合拆分模型返回了无法解析的 JSON：${error instanceof Error ? error.message : "Unknown parse error"}`,
    );
  }
}

function normalizeParsedEventSignature(
  raw: Partial<ParsedEventSignature> | null | undefined,
): ParsedEventSignature | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  return {
    eventType: normalizeEventType(raw.eventType ?? null),
    eventSubject: typeof raw.eventSubject === "string" ? raw.eventSubject.trim() || null : null,
    eventAction: typeof raw.eventAction === "string" ? raw.eventAction.trim() || null : null,
    eventObject: typeof raw.eventObject === "string" ? raw.eventObject.trim() || null : null,
    eventDate: normalizeEventDate(raw.eventDate ?? null),
  };
}

function normalizeParsedEvent(raw: Partial<ParsedEvent>): ParsedEvent | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const signature = normalizeParsedEventSignature(raw);
  const title = typeof raw.title === "string" ? raw.title.trim().slice(0, 120) || null : null;
  const oneLiner = typeof raw.oneLiner === "string" ? raw.oneLiner.trim() : "";

  if (!oneLiner) {
    return null;
  }

  if (!signature) {
    return {
      eventType: null,
      eventSubject: null,
      eventAction: null,
      eventObject: null,
      eventDate: null,
      title,
      oneLiner,
      qualityScore: normalizeScore(raw.qualityScore, 50),
      sourceUrl: normalizeSourceUrl(raw.sourceUrl ?? null),
    };
  }

  return {
    eventType: signature.eventType,
    eventSubject: signature.eventSubject,
    eventAction: signature.eventAction,
    eventObject: signature.eventObject,
    eventDate: signature.eventDate,
    title,
    oneLiner,
    qualityScore: normalizeScore(raw.qualityScore, 50),
    sourceUrl: normalizeSourceUrl(raw.sourceUrl ?? null),
  };
}

function buildChineseSummaryRetryPrompt(userContent: string) {
  return `${userContent}

重要：上一次输出不是中文摘要。请重新生成，必须使用中文，且只输出中文摘要正文。`;
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

function normalizeSourceUrl(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
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

type ClusterMergeInputMetadata = {
  validIds: string[];
  allowedPairKeys: Set<string>;
  itemCounts: Map<string, number>;
};

function buildClusterMergePairKey(leftId: string, rightId: string) {
  return [leftId, rightId].sort().join("\u0000");
}

function parseMergeGroups(rawContent: string, metadata: ClusterMergeInputMetadata): string[][] {
  const normalized = stripCodeFence(rawContent);
  const validSet = new Set(metadata.validIds);

  try {
    const parsed = JSON.parse(normalized) as { approvedPairs?: unknown; pairs?: unknown; mergeGroups?: unknown };
    const approvedPairs = parseApprovedClusterMergePairs(parsed, metadata);

    if (Array.isArray(parsed.approvedPairs) || Array.isArray(parsed.pairs)) {
      return buildClusterMergeGroupsFromApprovedPairs(approvedPairs, metadata);
    }

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

function parseApprovedClusterMergePairs(
  parsed: { approvedPairs?: unknown; pairs?: unknown },
  metadata: ClusterMergeInputMetadata,
) {
  const validSet = new Set(metadata.validIds);
  const rawPairs = Array.isArray(parsed.approvedPairs)
    ? parsed.approvedPairs
    : Array.isArray(parsed.pairs)
      ? parsed.pairs
      : [];
  const pairs: Array<[string, string]> = [];
  const seenPairKeys = new Set<string>();

  for (const rawPair of rawPairs) {
    const pair = normalizeApprovedClusterMergePair(rawPair, Array.isArray(parsed.approvedPairs));

    if (!pair) {
      continue;
    }

    const [leftId, rightId] = pair;
    const pairKey = buildClusterMergePairKey(leftId, rightId);

    if (
      leftId === rightId ||
      !validSet.has(leftId) ||
      !validSet.has(rightId) ||
      !metadata.allowedPairKeys.has(pairKey) ||
      seenPairKeys.has(pairKey)
    ) {
      continue;
    }

    seenPairKeys.add(pairKey);
    pairs.push([leftId, rightId]);
  }

  return pairs;
}

function normalizeApprovedClusterMergePair(rawPair: unknown, implicitlyApproved: boolean): [string, string] | null {
  if (Array.isArray(rawPair) && typeof rawPair[0] === "string" && typeof rawPair[1] === "string") {
    return [rawPair[0], rawPair[1]];
  }

  if (!rawPair || typeof rawPair !== "object") {
    return null;
  }

  const pair = rawPair as Record<string, unknown>;
  if (!implicitlyApproved && pair.approved !== true) {
    return null;
  }

  const leftId = pair.leftId ?? pair.leftClusterId ?? pair.sourceId ?? getClusterIdFromUnknown(pair.left);
  const rightId = pair.rightId ?? pair.rightClusterId ?? pair.targetId ?? getClusterIdFromUnknown(pair.right);

  return typeof leftId === "string" && typeof rightId === "string" ? [leftId, rightId] : null;
}

function getClusterIdFromUnknown(value: unknown) {
  return value && typeof value === "object" && "id" in value && typeof value.id === "string" ? value.id : null;
}

function buildClusterMergeGroupsFromApprovedPairs(
  approvedPairs: Array<[string, string]>,
  metadata: ClusterMergeInputMetadata,
) {
  const adjacency = new Map<string, Set<string>>();

  for (const [leftId, rightId] of approvedPairs) {
    if (!adjacency.has(leftId)) {
      adjacency.set(leftId, new Set());
    }
    if (!adjacency.has(rightId)) {
      adjacency.set(rightId, new Set());
    }
    adjacency.get(leftId)!.add(rightId);
    adjacency.get(rightId)!.add(leftId);
  }

  const visited = new Set<string>();
  const groups: string[][] = [];

  for (const clusterId of adjacency.keys()) {
    if (visited.has(clusterId)) {
      continue;
    }

    const component: string[] = [];
    const stack = [clusterId];
    visited.add(clusterId);

    while (stack.length > 0) {
      const currentId = stack.pop()!;
      component.push(currentId);

      for (const nextId of adjacency.get(currentId) ?? []) {
        if (!visited.has(nextId)) {
          visited.add(nextId);
          stack.push(nextId);
        }
      }
    }

    if (component.length < 2) {
      continue;
    }

    const targetId = [...component].sort((leftId, rightId) => {
      const itemCountDiff = (metadata.itemCounts.get(rightId) ?? 0) - (metadata.itemCounts.get(leftId) ?? 0);
      return itemCountDiff || leftId.localeCompare(rightId);
    })[0]!;
    const directSources = [...(adjacency.get(targetId) ?? [])].sort((leftId, rightId) => {
      const itemCountDiff = (metadata.itemCounts.get(rightId) ?? 0) - (metadata.itemCounts.get(leftId) ?? 0);
      return itemCountDiff || leftId.localeCompare(rightId);
    });

    if (directSources.length > 0) {
      groups.push([targetId, ...directSources]);
    }
  }

  return groups;
}

function parseClusterMergeInputMetadata(clustersJson: string): ClusterMergeInputMetadata {
  const parsed = JSON.parse(clustersJson) as unknown;
  const validIds = new Set<string>();
  const allowedPairKeys = new Set<string>();
  const itemCounts = new Map<string, number>();

  const addCluster = (entry: unknown) => {
    if (!entry || typeof entry !== "object" || !("id" in entry) || typeof entry.id !== "string") {
      return null;
    }

    validIds.add(entry.id);
    if ("itemCount" in entry && typeof entry.itemCount === "number") {
      itemCounts.set(entry.id, entry.itemCount);
    }

    return entry.id;
  };

  const addPair = (leftId: unknown, rightId: unknown) => {
    if (typeof leftId === "string" && typeof rightId === "string" && leftId !== rightId) {
      validIds.add(leftId);
      validIds.add(rightId);
      allowedPairKeys.add(buildClusterMergePairKey(leftId, rightId));
    }
  };

  if (Array.isArray(parsed)) {
    for (const entry of parsed) {
      addCluster(entry);
    }
    return { validIds: [...validIds], allowedPairKeys, itemCounts };
  }

  if (parsed && typeof parsed === "object") {
    if ("clusters" in parsed && Array.isArray(parsed.clusters)) {
      for (const entry of parsed.clusters) {
        addCluster(entry);
      }
    }

    if ("allowedPairs" in parsed && Array.isArray(parsed.allowedPairs)) {
      for (const pair of parsed.allowedPairs) {
        if (pair && typeof pair === "object") {
          addPair("leftId" in pair ? pair.leftId : null, "rightId" in pair ? pair.rightId : null);
        }
      }
    }

    if ("pairs" in parsed && Array.isArray(parsed.pairs)) {
      for (const pair of parsed.pairs) {
        if (!pair || typeof pair !== "object") {
          continue;
        }

        const leftId = "left" in pair ? addCluster(pair.left) : null;
        const rightId = "right" in pair ? addCluster(pair.right) : null;
        addPair(leftId, rightId);
      }
    }
  }

  return { validIds: [...validIds], allowedPairKeys, itemCounts };
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
  }) as CompletionResponse;

  return response.choices?.[0]?.message?.content?.trim() || "";
}

async function* streamText(
  client: OpenAICompatibleClient,
  config: RuntimeConfig["modelApi"],
  promptConfig: PromptRuntimeConfig,
  userContent: string,
  options?: {
    responseFormat?: CompletionResponseFormat;
  },
): AsyncIterable<string> {
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
    stream: true,
  }) as AsyncIterable<CompletionStreamChunk>;

  for await (const chunk of response) {
    const text = chunk.choices?.[0]?.delta?.content;
    if (text) {
      yield text;
    }
  }
}

export function createAiProvider(
  config: RuntimeConfig["modelApi"],
  promptOverrides?: PromptOverrides | null,
  clientOverrideArg?: OpenAICompatibleClient | null,
  options?: AiProviderOptions,
): AiProvider {
  const globalClient = clientOverrideArg ?? getClient(config);
  const aggregationSplitMaxEvents = normalizeAggregationSplitMaxEvents(options?.aggregationSplitMaxEvents);
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
  const resolvedItemAggregationConfig = resolvePromptConfig(
    DEFAULT_ITEM_AGGREGATION_ANALYSIS_PROMPT,
    DEFAULT_ITEM_AGGREGATION_USER_PROMPT_TEMPLATE,
    promptOverrides?.itemAggregation,
  );
  const itemAggregationConfig = promptOverrides?.itemAggregation
    ? resolvedItemAggregationConfig
    : {
        ...resolvedItemAggregationConfig,
        temperature: 0,
        maxTokens: 8000,
      };
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
  const dailyReportRefinementGenerateConfig = resolvePromptConfig(
    DEFAULT_DAILY_REPORT_REFINEMENT_GENERATE_PROMPT,
    DEFAULT_DAILY_REPORT_REFINEMENT_GENERATE_USER_PROMPT_TEMPLATE,
    promptOverrides?.dailyReportRefinementGenerate,
  );
  const dailyReportRefinementChatConfig = resolvePromptConfig(
    DEFAULT_DAILY_REPORT_REFINEMENT_CHAT_PROMPT,
    DEFAULT_DAILY_REPORT_REFINEMENT_CHAT_USER_PROMPT_TEMPLATE,
    promptOverrides?.dailyReportRefinementChat,
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
      console.error("[AI Provider] completeText failed:", error);
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
      const userContent = renderPromptTemplate(itemSummaryConfig.promptTemplate, {
        title: metadata.title,
        sourceName: metadata.sourceName ?? "未知来源",
        inputText,
      });
      const output = await completeTextWithCircuitBreaker(
        itemSummaryConfig,
        userContent,
        {
          responseFormat: { type: "json_object" },
        },
      );

      if (output == null) {
        return fallback;
      }

      const result = parseSummaryAndClassification(output, fallback);

      if (!shouldRegenerateChineseSummary(result.summary)) {
        return result;
      }

      const retryOutput = await completeTextWithCircuitBreaker(
        itemSummaryConfig,
        buildChineseSummaryRetryPrompt(userContent),
        {
          responseFormat: { type: "json_object" },
        },
      );

      if (retryOutput == null) {
        return result;
      }

      return parseSummaryAndClassification(retryOutput, result);
    },
    async parseAggregation(inputText, metadata) {
      const fallback = getFallbackAggregation();
      const userContent = renderPromptTemplate(itemAggregationConfig.promptTemplate, {
        title: metadata.title,
        sourceName: metadata.sourceName ?? "未知来源",
        maxEvents: aggregationSplitMaxEvents,
        inputText,
      });
      const output = await completeTextWithCircuitBreaker(
        itemAggregationConfig,
        userContent,
        {
          responseFormat: { type: "json_object" },
        },
      );

      if (output == null) {
        return fallback;
      }

      return parseAggregationOutput(output, fallback, aggregationSplitMaxEvents);
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
      const fallback = inputText.trim();
      const userContent = renderPromptTemplate(clusterSummaryConfig.promptTemplate, {
        title: metadata.title,
        inputText,
      });
      const output = await completeTextWithCircuitBreaker(
        clusterSummaryConfig,
        userContent,
      );

      if (output == null) {
        return fallback;
      }

      const summary = parseSummaryOutput(output, fallback);

      if (!shouldRegenerateChineseSummary(summary)) {
        return summary;
      }

      const retryOutput = await completeTextWithCircuitBreaker(
        clusterSummaryConfig,
        buildChineseSummaryRetryPrompt(userContent),
      );

      if (retryOutput == null) {
        return summary;
      }

      return parseSummaryOutput(retryOutput, summary);
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
      const metadata = parseClusterMergeInputMetadata(clustersJson);
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

      return parseMergeGroups(output, metadata);
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
    async *streamDailyReportRefinement(input) {
      const executionConfig = getExecutionConfig(dailyReportRefinementGenerateConfig);
      const selectedClient = getClientForExecutionConfig(executionConfig);

      if (!selectedClient) {
        throw new Error("Model API is not configured.");
      }

      yield* streamText(
        selectedClient,
        executionConfig,
        dailyReportRefinementGenerateConfig,
        renderPromptTemplate(dailyReportRefinementGenerateConfig.promptTemplate, {
          date: input.date,
          timezone: input.timezone,
          currentContentJson: JSON.stringify(input.currentContent),
          sourceRegistryJson: JSON.stringify(input.sourceRegistry),
          instruction: input.instruction,
          messagesJson: JSON.stringify(input.messages),
        }),
        {
          responseFormat: { type: "json_object" },
        },
      );
    },
    async *streamDailyReportRefinementChat(input) {
      const executionConfig = getExecutionConfig(dailyReportRefinementChatConfig);
      const selectedClient = getClientForExecutionConfig(executionConfig);

      if (!selectedClient) {
        throw new Error("Model API is not configured.");
      }

      yield* streamText(
        selectedClient,
        executionConfig,
        dailyReportRefinementChatConfig,
        renderPromptTemplate(dailyReportRefinementChatConfig.promptTemplate, {
          date: input.date,
          timezone: input.timezone,
          currentContentJson: JSON.stringify(input.currentContent),
          sourceRegistryJson: JSON.stringify(input.sourceRegistry),
          instruction: input.instruction,
          messagesJson: JSON.stringify(input.messages),
        }),
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
