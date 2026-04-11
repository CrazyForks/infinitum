import OpenAI from "openai";

import {
  DEFAULT_CLUSTER_MATCH_PROMPT,
  DEFAULT_CLUSTER_SUMMARY_PROMPT,
  DEFAULT_ITEM_ANALYSIS_PROMPT,
} from "@/config/prompts";
import type { RuntimeConfig } from "@/config/runtime";

export type AiEnrichment = {
  translatedTitle: string | null;
  summary: string;
  moderationStatus: "allowed" | "filtered" | "restored";
  moderationReason: "marketing" | "low_quality" | "duplicate_noise" | "rule_blacklist" | "other" | null;
  moderationDetail: string | null;
  qualityScore: number;
  qualityRationale: string;
  topicLabel: string | null;
  clusterHint: string | null;
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

export type AiProvider = {
  enrichContent(
    inputText: string,
    metadata: { title: string; sourceName?: string; translateTitle: boolean },
  ): Promise<AiEnrichment>;
  summarizeCluster(inputText: string, metadata: { title: string }): Promise<string>;
  matchClusterCandidate(
    inputText: string,
    metadata: { title: string; candidates: Array<{ id: string; title: string; summary: string }> },
  ): Promise<string | null>;
};

type OpenAICompatibleClient = Pick<OpenAI, "chat">;
type PromptOverrides = {
  itemAnalysisPrompt?: string;
  clusterSummaryPrompt?: string;
  clusterMatchPrompt?: string;
};

function isClientOverride(value: PromptOverrides | OpenAICompatibleClient | null | undefined): value is OpenAICompatibleClient {
  return Boolean(value && typeof value === "object" && "chat" in value);
}

function getClient(config: RuntimeConfig["modelApi"]): OpenAICompatibleClient | null {
  const apiKey = config.apiKey;

  if (!apiKey) {
    return null;
  }

  return new OpenAI({
    apiKey,
    baseURL: config.baseURL || undefined,
  });
}

function truncate(text: string, maxLength: number): string {
  return text.length <= maxLength ? text : `${text.slice(0, maxLength).trim()}...`;
}

function getFallbackEnrichment(
  inputText: string,
  metadata: { title: string; translateTitle: boolean },
): AiEnrichment {
  return {
    translatedTitle: metadata.translateTitle ? metadata.title : null,
    summary: truncate(inputText.trim(), 180),
    moderationStatus: "allowed",
    moderationReason: null,
    moderationDetail: null,
    qualityScore: 50,
    qualityRationale: "AI analysis unavailable",
    topicLabel: null,
    clusterHint: null,
  };
}

function stripCodeFence(value: string): string {
  return value.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
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
      summary?: string | null;
      moderationStatus?: string | null;
      moderationReason?: string | null;
      moderationDetail?: string | null;
      qualityScore?: number | string | null;
      qualityRationale?: string | null;
      topicLabel?: string | null;
      clusterHint?: string | null;
    };

    if (parsed.summary?.trim()) {
      return {
        ok: true,
        recovered: false,
        value: buildEnrichmentFromParsed(parsed, fallback, translateTitle),
      };
    }
  } catch {
    // Fall through to tolerant parsing below.
  }

  {
    const translatedTitleMatch = normalized.match(
      /"?translatedTitle"?\s*:\s*(?:"([^"]*)"|'([^']*)'|([^,\n}]+))/i,
    );
    const summaryMatch = normalized.match(/"?summary"?\s*:\s*(?:"([^"]*)"|'([^']*)'|([^,\n}]+))/i);

    if (!summaryMatch) {
      return {
        ok: false,
        reason: `Unable to parse model response: ${normalized.slice(0, 200)}`,
      };
    }

    const translatedCandidate = translatedTitleMatch
      ? translatedTitleMatch[1] ?? translatedTitleMatch[2] ?? translatedTitleMatch[3] ?? ""
      : "";
    const summaryCandidate = summaryMatch[1] ?? summaryMatch[2] ?? summaryMatch[3] ?? "";

    return {
      ok: true,
      recovered: true,
      value: {
        translatedTitle: translateTitle ? translatedCandidate.trim() || fallback.translatedTitle : null,
        summary: summaryCandidate.trim() || fallback.summary,
        moderationStatus: fallback.moderationStatus,
        moderationReason: fallback.moderationReason,
        moderationDetail: fallback.moderationDetail,
        qualityScore: fallback.qualityScore,
        qualityRationale: fallback.qualityRationale,
        topicLabel: fallback.topicLabel,
        clusterHint: fallback.clusterHint,
      },
    };
  }
}

function normalizeModerationStatus(value: string | null | undefined): AiEnrichment["moderationStatus"] {
  return value === "filtered" || value === "restored" ? value : "allowed";
}

function normalizeModerationReason(value: string | null | undefined): AiEnrichment["moderationReason"] {
  return value === "marketing" ||
    value === "low_quality" ||
    value === "duplicate_noise" ||
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

function buildEnrichmentFromParsed(
  parsed: {
    translatedTitle?: string | null;
    summary?: string | null;
    moderationStatus?: string | null;
    moderationReason?: string | null;
    moderationDetail?: string | null;
    qualityScore?: number | string | null;
    qualityRationale?: string | null;
    topicLabel?: string | null;
    clusterHint?: string | null;
  },
  fallback: AiEnrichment,
  translateTitle: boolean,
): AiEnrichment {
  return {
    translatedTitle: translateTitle ? parsed.translatedTitle?.trim() || fallback.translatedTitle : null,
    summary: parsed.summary?.trim() || fallback.summary,
    moderationStatus: normalizeModerationStatus(parsed.moderationStatus),
    moderationReason: normalizeModerationReason(parsed.moderationReason),
    moderationDetail: parsed.moderationDetail?.trim() || fallback.moderationDetail,
    qualityScore: normalizeScore(parsed.qualityScore, fallback.qualityScore),
    qualityRationale: parsed.qualityRationale?.trim() || fallback.qualityRationale,
    topicLabel: parsed.topicLabel?.trim() || fallback.topicLabel,
    clusterHint: parsed.clusterHint?.trim() || fallback.clusterHint,
  };
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

async function completeChat(
  client: OpenAICompatibleClient,
  model: string,
  messages: Array<{ role: "system" | "user"; content: string }>,
): Promise<string> {
  const response = await client.chat.completions.create({
    model,
    messages,
  });

  return response.choices[0]?.message?.content?.trim() || "";
}

export function createAiProvider(
  config: RuntimeConfig["modelApi"],
  promptOverridesOrClient?: PromptOverrides | OpenAICompatibleClient | null,
  clientOverrideArg?: OpenAICompatibleClient | null,
): AiProvider {
  const promptOverrides = isClientOverride(promptOverridesOrClient) ? undefined : promptOverridesOrClient;
  const client =
    clientOverrideArg ?? (isClientOverride(promptOverridesOrClient) ? promptOverridesOrClient : null) ?? getClient(config);
  const model = config.model || "gpt-4.1-mini";
  const itemAnalysisPrompt = promptOverrides?.itemAnalysisPrompt ?? DEFAULT_ITEM_ANALYSIS_PROMPT;
  const clusterSummaryPrompt = promptOverrides?.clusterSummaryPrompt ?? DEFAULT_CLUSTER_SUMMARY_PROMPT;
  const clusterMatchPrompt = promptOverrides?.clusterMatchPrompt ?? DEFAULT_CLUSTER_MATCH_PROMPT;

  return {
    async enrichContent(inputText, metadata) {
      const fallback = getFallbackEnrichment(inputText, metadata);

      if (!client) {
        return fallback;
      }

      let lastFailureReason = "Unknown invalid ai enrichment response";
      let recoveredFallback: AiEnrichment | null = null;

      for (let attempt = 0; attempt < 2; attempt += 1) {
        const output = await completeChat(client, model, [
          {
            role: "system",
            content: itemAnalysisPrompt,
          },
          {
            role: "user",
            content: `标题：${metadata.title}\n来源：${metadata.sourceName ?? "未知来源"}\n是否需要翻译标题：${
              metadata.translateTitle ? "是" : "否"
            }\n正文：${truncate(inputText, 4000)}`,
          },
        ]);

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
      if (!client) {
        return truncate(inputText.trim(), 180);
      }

      const output = await completeChat(client, model, [
        {
          role: "system",
          content: clusterSummaryPrompt,
        },
        {
          role: "user",
          content: `主题：${metadata.title}\n候选内容：${truncate(inputText, 4000)}`,
        },
      ]);

      const normalized = stripCodeFence(output);

      try {
        const parsed = JSON.parse(normalized) as { summary?: string | null };
        if (parsed.summary?.trim()) {
          return parsed.summary.trim();
        }
      } catch {
        // Fall through to plain text handling.
      }

      return normalized || truncate(inputText.trim(), 180);
    },
    async matchClusterCandidate(inputText, metadata) {
      if (!client || metadata.candidates.length === 0) {
        return null;
      }

      const output = await completeChat(client, model, [
        {
          role: "system",
          content: clusterMatchPrompt,
        },
        {
          role: "user",
          content: `当前内容标题：${metadata.title}\n当前内容线索：${truncate(inputText, 2000)}\n候选聚合组：${JSON.stringify(
            metadata.candidates,
          )}`,
        },
      ]);

      return parseClusterMatchCandidateId(
        output,
        metadata.candidates.map((candidate) => candidate.id),
      );
    },
  };
}
