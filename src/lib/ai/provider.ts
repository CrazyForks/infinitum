import OpenAI from "openai";

import type { RuntimeConfig } from "@/config/runtime";

export type AiEnrichment = {
  translatedTitle: string | null;
  summary: string;
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
};

type OpenAICompatibleClient = Pick<OpenAI, "chat">;

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
    };

    if (parsed.summary?.trim()) {
      return {
        ok: true,
        recovered: false,
        value: {
          translatedTitle: translateTitle ? parsed.translatedTitle?.trim() || fallback.translatedTitle : null,
          summary: parsed.summary.trim(),
        },
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
      },
    };
  }
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
  clientOverride?: OpenAICompatibleClient | null,
): AiProvider {
  const client = clientOverride ?? getClient(config);
  const model = config.model || "gpt-4.1-mini";

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
            content:
              '你是新闻处理助手。请严格输出 JSON，格式为 {"translatedTitle":"...","summary":"..."}。summary 必须是 1 到 2 句中文摘要，不要使用项目符号；如果无需翻译标题，则 translatedTitle 返回空字符串。',
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
  };
}
