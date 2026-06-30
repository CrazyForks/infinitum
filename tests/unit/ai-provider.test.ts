import { describe, expect, it, vi } from "vitest";

import { createAiProvider } from "@/lib/ai/provider";
import { normalizeModelResponseText } from "@/lib/ai/response-format";
import {
  DEFAULT_DAILY_REPORT_PROMPT,
  DEFAULT_DAILY_REPORT_USER_PROMPT_TEMPLATE,
} from "@/config/prompts";

describe("ai provider", () => {
  it("strips leading think blocks and code fences from model responses", () => {
    expect(
      normalizeModelResponseText([
        "<think>",
        "The user is asking me to reply with \"OK\".",
        "</think>",
        "```json",
        "{\"summary\":\"这是摘要\",\"isAggregation\":false}",
        "```",
      ].join("\n")),
    ).toBe(`{"summary":"这是摘要","isAggregation":false}`);
  });

  it("turns approved merge pairs into conservative target-direct merge groups", async () => {
    const create = vi.fn().mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              approvedPairs: [
                ["cluster-a", "cluster-b"],
                ["cluster-b", "cluster-c"],
              ],
            }),
          },
        },
      ],
    });
    const provider = createAiProvider(
      {
        apiKey: "sk-test",
        baseURL: "https://example.com/v1",
        model: "test-model",
      },
      undefined,
      {
        chat: {
          completions: {
            create,
          },
        },
      },
    );

    const groups = await provider.mergeClusters(JSON.stringify({
      pairs: [
        {
          left: { id: "cluster-a", title: "A", summary: "A", itemCount: 10 },
          right: { id: "cluster-b", title: "B", summary: "B", itemCount: 5 },
          score: 95,
        },
        {
          left: { id: "cluster-b", title: "B", summary: "B", itemCount: 5 },
          right: { id: "cluster-c", title: "C", summary: "C", itemCount: 1 },
          score: 95,
        },
      ],
    }));

    expect(groups).toEqual([["cluster-a", "cluster-b"]]);
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0]?.[0]?.messages?.[0]?.content).toContain("候选聚合 Pair");
    expect(create.mock.calls[0]?.[0]?.messages?.[0]?.content).toContain("score 是本地规则");
    expect(create.mock.calls[0]?.[0]?.messages?.[1]?.content).toContain("\"pairs\"");
  });

  it("ignores approved merge pairs that were not present in the local pair input", async () => {
    const create = vi.fn().mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              approvedPairs: [
                ["cluster-a", "cluster-b"],
                ["cluster-a", "cluster-c"],
              ],
            }),
          },
        },
      ],
    });
    const provider = createAiProvider(
      {
        apiKey: "sk-test",
        baseURL: "https://example.com/v1",
        model: "test-model",
      },
      undefined,
      {
        chat: {
          completions: {
            create,
          },
        },
      },
    );

    const groups = await provider.mergeClusters(JSON.stringify({
      pairs: [
        {
          left: { id: "cluster-a", title: "A", summary: "A", itemCount: 3 },
          right: { id: "cluster-b", title: "B", summary: "B", itemCount: 2 },
          score: 95,
        },
      ],
    }));

    expect(groups).toEqual([["cluster-a", "cluster-b"]]);
  });

  it("honors explicit empty approved merge pairs over legacy merge groups", async () => {
    const create = vi.fn().mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              approvedPairs: [],
              mergeGroups: [["cluster-a", "cluster-b"]],
            }),
          },
        },
      ],
    });
    const provider = createAiProvider(
      {
        apiKey: "sk-test",
        baseURL: "https://example.com/v1",
        model: "test-model",
      },
      undefined,
      {
        chat: {
          completions: {
            create,
          },
        },
      },
    );

    const groups = await provider.mergeClusters(JSON.stringify({
      pairs: [
        {
          left: { id: "cluster-a", title: "A", summary: "A", itemCount: 3 },
          right: { id: "cluster-b", title: "B", summary: "B", itemCount: 2 },
          score: 95,
        },
      ],
    }));

    expect(groups).toEqual([]);
  });

  it("retries cluster merge once when the first response is invalid json", async () => {
    const create = vi
      .fn()
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: "{\"approvedPairs\":[[\"cluster-a\",\"cluster-b\"]",
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: JSON.stringify({
                approvedPairs: [["cluster-a", "cluster-b"]],
              }),
            },
          },
        ],
      });
    const provider = createAiProvider(
      {
        apiKey: "sk-test",
        baseURL: "https://example.com/v1",
        model: "test-model",
      },
      undefined,
      {
        chat: {
          completions: {
            create,
          },
        },
      },
    );

    const groups = await provider.mergeClusters(JSON.stringify({
      pairs: [
        {
          left: { id: "cluster-a", title: "A", summary: "A", itemCount: 3 },
          right: { id: "cluster-b", title: "B", summary: "B", itemCount: 2 },
          score: 95,
        },
      ],
    }));

    expect(groups).toEqual([["cluster-a", "cluster-b"]]);
    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[1]?.[0]?.messages?.[1]?.content).toContain("上一次输出不是合法 JSON");
  });

  it("uses chat completions and returns the full analysis payload", async () => {
    const create = vi.fn().mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              translatedTitle: "中文标题",
              moderationStatus: "allowed",
              moderationReason: null,
              moderationDetail: "高信息密度内容",
              qualityScore: 88,
              qualityRationale: "信息完整且有明确事实",
              eventType: "launch",
              eventSubject: "OpenAI",
              eventAction: "发布",
              eventObject: "agent toolkit",
              eventDate: "2026-04-10",
              tags: ["OpenAI", "AI Agent", "新闻", "OpenAI"],
            }),
          },
        },
      ],
    });

    const provider = createAiProvider(
      {
        apiKey: "sk-test",
        baseURL: "https://example.com/v1",
        model: "test-model",
      },
      undefined,
      {
        chat: {
          completions: {
            create,
          },
        },
      },
    );

    const enriched = await provider.enrichContent("A long body for summarization", {
      title: "Original title",
      sourceName: "Example Feed",
      translateTitle: true,
    });

    expect(enriched).toEqual({
      translatedTitle: "中文标题",
      moderationStatus: "allowed",
      moderationReason: null,
      moderationDetail: "高信息密度内容",
      qualityScore: 88,
      qualityRationale: "信息完整且有明确事实",
      eventSignature: {
        eventType: "launch",
        eventSubject: "OpenAI",
        eventAction: "发布",
        eventObject: "agent toolkit",
        eventDate: "2026-04-10",
      },
      tags: ["OpenAI", "AI Agent"],
    });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("strips leading think blocks before parsing JSON summary responses", async () => {
    const create = vi.fn().mockResolvedValue({
      choices: [
        {
          message: {
            content: `<think>
The user is asking me to reply with "OK" in Chinese context. Simple request.
</think>
${JSON.stringify({
  summary: "这是摘要",
  isAggregation: false,
})}`,
          },
        },
      ],
    });

    const provider = createAiProvider(
      {
        apiKey: "sk-test",
        baseURL: "https://example.com/v1",
        model: "test-model",
      },
      undefined,
      {
        chat: {
          completions: {
            create,
          },
        },
      },
    );

    const summary = await provider.summarizeItem("Input body", {
      title: "Original title",
      sourceName: "Example Feed",
    });

    expect(summary).toEqual({
      summary: "这是摘要",
      isAggregation: false,
    });
  });

  it("uses a detailed default item analysis prompt when no override is provided", async () => {
    const create = vi.fn().mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              translatedTitle: "中文标题",
              moderationStatus: "allowed",
              moderationReason: null,
              moderationDetail: "解释",
              qualityScore: 88,
              qualityRationale: "评分理由",
              eventType: "launch",
              eventSubject: "主体",
              eventAction: "发布",
              eventObject: "对象",
              eventDate: null,
            }),
          },
        },
      ],
    });

    const provider = createAiProvider(
      {
        apiKey: "sk-test",
        baseURL: "https://example.com/v1",
        model: "test-model",
      },
      undefined,
      {
        chat: {
          completions: {
            create,
          },
        },
      },
    );

    await provider.enrichContent("Body text", {
      title: "Original title",
      sourceName: "Example Feed",
      translateTitle: true,
    });

    const systemPrompt = create.mock.calls[0]?.[0]?.messages?.[0]?.content as string;
    expect(systemPrompt).toContain("固定输出格式");
    expect(systemPrompt).toContain("translatedTitle");
    expect(systemPrompt).toContain("moderationDetail");
    expect(systemPrompt).toContain("qualityRationale");
    expect(systemPrompt).toContain("eventType");
    expect(systemPrompt).toContain("eventSubject");
    expect(systemPrompt).toContain("tags");
    expect(systemPrompt).toContain("只基于输入标题、来源和摘要判断");
    expect(systemPrompt).toContain('"moderationStatus":"allowed|filtered"');
    expect(systemPrompt).not.toContain("restored");
    expect(create.mock.calls[0]?.[0]?.response_format).toEqual({ type: "json_object" });
  });

  it("passes the full body text to item summarization without truncation", async () => {
    const create = vi.fn().mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({summary: "中文摘要", isAggregation: false}),
          },
        },
      ],
    });

    const provider = createAiProvider(
      {
        apiKey: "sk-test",
        baseURL: "https://example.com/v1",
        model: "test-model",
      },
      undefined,
      {
        chat: {
          completions: {
            create,
          },
        },
      },
    );

    const longBody = "正文片段".repeat(1200);

    await provider.summarizeItem(longBody, {
      title: "Original title",
      sourceName: "Example Feed",
    });

    const userPrompt = create.mock.calls[0]?.[0]?.messages?.[1]?.content as string;
    expect(userPrompt).toContain(longBody);
  });

  it("falls back to the original title and truncated plain text when no api key is configured", async () => {
    const provider = createAiProvider({
      apiKey: "",
      baseURL: "",
      model: "test-model",
    });

    const enriched = await provider.enrichContent(
      "This is a long body that should still be returned as a trimmed fallback summary when no model api key is present.",
      {
        title: "Original title",
        sourceName: "Example Feed",
        translateTitle: true,
      },
    );

    expect(enriched.translatedTitle).toBe("Original title");
    expect(enriched.moderationStatus).toBe("allowed");
    expect(enriched.qualityScore).toBe(50);
    expect(enriched.qualityRationale).toBe("AI analysis unavailable");
    expect(enriched.eventSignature).toEqual({
      eventType: null,
      eventSubject: null,
      eventAction: null,
      eventObject: null,
      eventDate: null,
    });
    expect(enriched.tags).toEqual([]);
  });

  it("rejects item summarization when no api key is configured", async () => {
    const provider = createAiProvider({
      apiKey: "",
      baseURL: "",
      model: "test-model",
    });
    const body = "Fallback summary body. ".repeat(30).trim();

    await expect(provider.summarizeItem(body, {
      title: "Original title",
      sourceName: "Example Feed",
    })).rejects.toThrow(/model client is not configured/i);
  });

  it("rejects empty item summary responses instead of returning source text", async () => {
    const create = vi.fn().mockResolvedValue({
      choices: [
        {
          message: {
            content: "",
          },
        },
      ],
    });
    const provider = createAiProvider(
      {
        apiKey: "sk-test",
        baseURL: "https://example.com/v1",
        model: "test-model",
      },
      undefined,
      {
        chat: {
          completions: {
            create,
          },
        },
      },
    );
    const body = "Empty model response fallback body. ".repeat(30).trim();

    await expect(provider.summarizeItem(body, {
      title: "Original title",
      sourceName: "Example Feed",
    })).rejects.toThrow(/empty response/i);
  });

  it("rejects long non-json item summary responses instead of storing source-like text", async () => {
    const sourceText = "Full article paragraph. ".repeat(80).trim();
    const create = vi.fn().mockResolvedValue({
      choices: [
        {
          message: {
            content: sourceText,
          },
        },
      ],
    });
    const provider = createAiProvider(
      {
        apiKey: "sk-test",
        baseURL: "https://example.com/v1",
        model: "test-model",
      },
      undefined,
      {
        chat: {
          completions: {
            create,
          },
        },
      },
    );

    await expect(provider.summarizeItem(sourceText, {
      title: "Original title",
      sourceName: "Example Feed",
    })).rejects.toThrow(/Invalid item summary JSON/i);
  });

  it("uses reasoning_content when JSON-mode providers leave message content empty", async () => {
    const create = vi.fn().mockResolvedValue({
      choices: [
        {
          message: {
            content: "",
            reasoning_content: JSON.stringify({
              summary: "LongCat JSON mode summary",
              isAggregation: false,
            }),
          },
        },
      ],
    });
    const provider = createAiProvider(
      {
        apiKey: "sk-test",
        baseURL: "https://example.com/v1",
        model: "test-model",
      },
      undefined,
      {
        chat: {
          completions: {
            create,
          },
        },
      },
    );

    const summary = await provider.summarizeItem("Full article body that must not be stored as the summary.", {
      title: "Original title",
      sourceName: "Example Feed",
    });

    expect(summary).toEqual({summary: "LongCat JSON mode summary", isAggregation: false});
  });

  it("recovers item summary text from truncated json output", async () => {
    const create = vi.fn().mockResolvedValue({
      choices: [
        {
          message: {
            content: "{\"summary\":\"今日科技行业多条重要动态：**苹果 Siri AI 提示词文件曝光**，何小鹏亲自直管机器人业务；**影石 Luna Ultra 云台相机发布**，3999 元起；**大疆 Pocket4P 价格曝光**，预计",
          },
        },
      ],
    });
    const provider = createAiProvider(
      {
        apiKey: "sk-test",
        baseURL: "https://example.com/v1",
        model: "test-model",
      },
      undefined,
      {
        chat: {
          completions: {
            create,
          },
        },
      },
    );

    const summary = await provider.summarizeItem("Long body text", {
      title: "早报",
      sourceName: "爱范儿",
    });

    expect(summary).toEqual({
      summary: "今日科技行业多条重要动态：**苹果 Siri AI 提示词文件曝光**，何小鹏亲自直管机器人业务；**影石 Luna Ultra 云台相机发布**，3999 元起；**大疆 Pocket4P 价格曝光**，预计",
      isAggregation: false,
    });
  });

  it("retries item summaries once when the first response is invalid json", async () => {
    const create = vi
      .fn()
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: "{\"bad\":",
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: JSON.stringify({summary: "修复后的中文摘要", isAggregation: false}),
            },
          },
        ],
      });
    const provider = createAiProvider(
      {
        apiKey: "sk-test",
        baseURL: "https://example.com/v1",
        model: "test-model",
      },
      undefined,
      {
        chat: {
          completions: {
            create,
          },
        },
      },
    );

    const summary = await provider.summarizeItem("Long body text", {
      title: "早报",
      sourceName: "爱范儿",
    });

    expect(summary).toEqual({summary: "修复后的中文摘要", isAggregation: false});
    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[1]?.[0]?.messages?.[1]?.content).toContain("上一次输出不是合法 JSON");
  });

  it("retries item summaries with an explicit Chinese-only instruction when the first output is English", async () => {
    const create = vi
      .fn()
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: JSON.stringify({
                summary: "SAS explains AI is just a tool for enterprise customers.",
                isAggregation: false,
              }),
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: JSON.stringify({
                summary: "SAS 强调 AI 只是服务企业客户的工具。",
                isAggregation: false,
              }),
            },
          },
        ],
      });
    const provider = createAiProvider(
      {
        apiKey: "sk-test",
        baseURL: "https://example.com/v1",
        model: "test-model",
      },
      undefined,
      {
        chat: {
          completions: {
            create,
          },
        },
      },
    );

    const summary = await provider.summarizeItem("Long body text", {
      title: "SAS sells AI to the Fortune 500",
      sourceName: "The New Stack",
    });

    expect(summary).toEqual({summary: "SAS 强调 AI 只是服务企业客户的工具。", isAggregation: false});
    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[1]?.[0]?.messages?.[1]?.content).toContain("上一次输出不是中文摘要");
  });

  it("retries once when the provider returns invalid json before succeeding", async () => {
    const create = vi
      .fn()
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: '{"translatedTitle:\'\',summary":"坏格式"}',
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: JSON.stringify({
                translatedTitle: "",
              }),
            },
          },
        ],
      });

    const provider = createAiProvider(
      {
        apiKey: "sk-test",
        baseURL: "https://example.com/v1",
        model: "test-model",
      },
      undefined,
      {
        chat: {
          completions: {
            create,
          },
        },
      },
    );

    const enriched = await provider.enrichContent("Body text", {
      title: "Original title",
      sourceName: "Example Feed",
      translateTitle: false,
    });

    expect(enriched.translatedTitle).toBeNull();
    expect(enriched.moderationStatus).toBe("allowed");
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("parses common json-like responses that are not strict json", async () => {
    const create = vi.fn().mockResolvedValue({
      choices: [
        {
          message: {
            content: `{"translatedTitle:'',summary":"可容错解析的摘要"}`,
          },
        },
      ],
    });

    const provider = createAiProvider(
      {
        apiKey: "sk-test",
        baseURL: "https://example.com/v1",
        model: "test-model",
      },
      undefined,
      {
        chat: {
          completions: {
            create,
          },
        },
      },
    );

    const enriched = await provider.enrichContent("Body text", {
      title: "Original title",
      sourceName: "Example Feed",
      translateTitle: false,
    });

    expect(enriched).toEqual({
      translatedTitle: null,
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
      tags: [],
    });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("uses the item summary prompt for pre-analysis summarization", async () => {
    const create = vi.fn().mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({summary: "条目摘要结果", isAggregation: false}),
          },
        },
      ],
    });

    const provider = createAiProvider(
      {
        apiKey: "sk-test",
        baseURL: "https://example.com/v1",
        model: "test-model",
      },
      undefined,
      {
        chat: {
          completions: {
            create,
          },
        },
      },
    );

    const summary = await provider.summarizeItem("A long body for summarization", {
      title: "Original title",
      sourceName: "Example Feed",
    });

    expect(summary).toEqual({summary: "条目摘要结果", isAggregation: false});
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0]?.[0]?.messages?.[0]?.content).toContain("单条新闻内容助手");
    expect(create.mock.calls[0]?.[0]?.messages?.[0]?.content).toContain("isAggregation");
    expect(create.mock.calls[0]?.[0]?.response_format).toEqual({type: "json_object"});
  });

  it("circuit-breaks failing non-default model api configs and falls back to the default model", async () => {
    const create = vi.fn().mockImplementation(async (payload: { model?: string }) => {
      if (payload.model === "custom-model") {
        throw new Error("Custom model upstream failed");
      }

      return {
        choices: [
          {
            message: {
              content: JSON.stringify({summary: "默认模型摘要", isAggregation: false}),
            },
          },
        ],
      };
    });
    const provider = createAiProvider(
      {
        apiKey: "sk-default",
        baseURL: "https://default.example.com/v1",
        model: "default-model",
      },
      {
        itemSummary: {
          systemPrompt: "摘要提示词",
          promptTemplate: "标题：{{title}}\n正文：{{inputText}}",
          modelApi: {
            apiKey: "sk-custom",
            baseURL: "https://custom.example.com/v1",
            model: "custom-model",
          },
        },
      },
      {
        chat: {
          completions: {
            create,
          },
        },
      },
    );

    await expect(provider.summarizeItem("正文 1", { title: "标题 1" })).rejects.toThrow(/upstream failed/i);
    await expect(provider.summarizeItem("正文 2", { title: "标题 2" })).rejects.toThrow(/upstream failed/i);
    await expect(provider.summarizeItem("正文 3", { title: "标题 3" })).resolves.toEqual({summary: "默认模型摘要", isAggregation: false});
    await expect(provider.summarizeItem("正文 4", { title: "标题 4" })).resolves.toEqual({summary: "默认模型摘要", isAggregation: false});

    expect(create.mock.calls.map((call) => call[0]?.model)).toEqual([
      "custom-model",
      "custom-model",
      "custom-model",
      "default-model",
      "default-model",
    ]);
  });

  it("throws a descriptive error after repeated invalid responses", async () => {
    const create = vi.fn().mockResolvedValue({
      choices: [
        {
          message: {
            content: "not-json",
          },
        },
      ],
    });

    const provider = createAiProvider(
      {
        apiKey: "sk-test",
        baseURL: "https://example.com/v1",
        model: "test-model",
      },
      undefined,
      {
        chat: {
          completions: {
            create,
          },
        },
      },
    );

    await expect(
      provider.enrichContent("Body text", {
        title: "Original title",
        sourceName: "Example Feed",
        translateTitle: true,
      }),
    ).rejects.toThrow(/invalid ai enrichment response/i);
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("uses the cluster summary prompt for aggregated summaries", async () => {
    const create = vi.fn().mockResolvedValue({
      choices: [
        {
          message: {
            content: "聚合摘要结果",
          },
        },
      ],
    });

    const provider = createAiProvider(
      {
        apiKey: "sk-test",
        baseURL: "https://example.com/v1",
        model: "test-model",
      },
      {
        itemAnalysis: {
          systemPrompt: "内容分析提示词",
          promptTemplate: "标题：{{title}}\n正文：{{inputText}}",
        },
        clusterSummary: {
          systemPrompt: "聚合摘要专用提示词",
          promptTemplate: "主题：{{title}}\n候选内容：{{inputText}}",
        },
      },
      {
        chat: {
          completions: {
            create,
          },
        },
      },
    );

    const summary = await provider.summarizeCluster("事件 A：摘要一\n事件 B：摘要二", {
      title: "OpenAI Agent",
    });

    expect(summary).toBe("聚合摘要结果");
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0]?.[0]?.messages?.[0]?.content).toContain("聚合摘要专用提示词");
  });

  it("selects a candidate cluster even when the cluster hints are phrased differently", async () => {
    const create = vi.fn().mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              clusterId: "cluster-1",
            }),
          },
        },
      ],
    });

    const provider = createAiProvider(
      {
        apiKey: "sk-test",
        baseURL: "https://example.com/v1",
        model: "test-model",
      },
      {
        itemAnalysis: {
          systemPrompt: "内容分析提示词",
          promptTemplate: "标题：{{title}}\n正文：{{inputText}}",
        },
        clusterSummary: {
          systemPrompt: "聚合摘要专用提示词",
          promptTemplate: "主题：{{title}}\n候选内容：{{inputText}}",
        },
        clusterMatch: {
          systemPrompt: "归组判定专用提示词",
          promptTemplate: "当前内容标题：{{title}}\n候选聚合组：{{candidatesJson}}",
        },
      },
      {
        chat: {
          completions: {
            create,
          },
        },
      },
    );

    const matchedClusterId = await provider.matchClusterCandidate("OpenAI developer toolkit for agents", {
      title: "Another report on OpenAI's agent toolkit",
      candidates: [
        {
          id: "cluster-1",
          title: "OpenAI Agent 发布",
          summary: "围绕 OpenAI 新 agent 工具的首发报道",
        },
      ],
    });

    expect(matchedClusterId).toBe("cluster-1");
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0]?.[0]?.messages?.[0]?.content).toContain("归组判定专用提示词");
  });

  it("uses a strict event-only cluster match prompt by default", async () => {
    const create = vi.fn().mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              clusterId: null,
            }),
          },
        },
      ],
    });

    const provider = createAiProvider(
      {
        apiKey: "sk-test",
        baseURL: "https://example.com/v1",
        model: "test-model",
      },
      undefined,
      {
        chat: {
          completions: {
            create,
          },
        },
      },
    );

    await provider.matchClusterCandidate("企业AI工具主题下的另一篇文章", {
      title: "Another AI tools story",
      candidates: [
        {
          id: "cluster-1",
          title: "企业AI工具",
          summary: "某个 AI 工具行业主题聚合",
        },
      ],
    });

    const systemPrompt = create.mock.calls[0]?.[0]?.messages?.[0]?.content as string;
    expect(systemPrompt).toContain("同一具体事件");
    expect(systemPrompt).toContain("如果只是主题接近");
    expect(systemPrompt).toContain("当前内容缺少明确事件线索时");
    expect(create.mock.calls[0]?.[0]?.response_format).toEqual({ type: "json_object" });
  });

  it("retries cluster matching once when the first response is invalid json", async () => {
    const create = vi
      .fn()
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: "{\"cluster\":",
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: JSON.stringify({clusterId: "cluster-1"}),
            },
          },
        ],
      });
    const provider = createAiProvider(
      {
        apiKey: "sk-test",
        baseURL: "https://example.com/v1",
        model: "test-model",
      },
      undefined,
      {
        chat: {
          completions: {
            create,
          },
        },
      },
    );

    const matchedClusterId = await provider.matchClusterCandidate("OpenAI developer toolkit for agents", {
      title: "Another report on OpenAI's agent toolkit",
      candidates: [
        {
          id: "cluster-1",
          title: "OpenAI Agent 发布",
          summary: "围绕 OpenAI 新 agent 工具的首发报道",
        },
      ],
    });

    expect(matchedClusterId).toBe("cluster-1");
    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[1]?.[0]?.messages?.[1]?.content).toContain("上一次输出不是合法 JSON");
  });

  it("uses item aggregation prompt overrides when parsing aggregated content", async () => {
    const create = vi.fn().mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              mainEvent: null,
              events: [
                {
                  eventType: "release",
                  eventSubject: "OpenAI",
                  eventAction: "发布",
                  eventObject: "Agent SDK",
                  eventDate: null,
                  title: "OpenAI 推出 Agent SDK",
                  oneLiner: "OpenAI 发布 Agent SDK。",
                  qualityScore: 88,
                  tags: ["OpenAI", "Agent SDK", "新闻", "openai"],
                },
              ],
            }),
          },
        },
      ],
    });

    const provider = createAiProvider(
      {
        apiKey: "sk-test",
        baseURL: "https://example.com/v1",
        model: "test-model",
      },
      {
        itemAggregation: {
          systemPrompt: "聚合拆分专用系统提示词",
          promptTemplate: "拆分标题：{{title}}\n拆分来源：{{sourceName}}\n拆分正文：{{inputText}}",
          temperature: 0,
          maxTokens: 1600,
        },
      },
      {
        chat: {
          completions: {
            create,
          },
        },
      },
    );

    const parsed = await provider.parseAggregation("事件一。事件二。", {
      title: "聚合简讯",
      sourceName: "测试源",
    });

    expect(parsed.events).toHaveLength(1);
    expect(parsed.events[0]?.title).toBe("OpenAI 推出 Agent SDK");
    expect(parsed.events[0]?.tags).toEqual(["OpenAI", "Agent SDK"]);
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0]?.[0]?.messages?.[0]?.content).toBe("聚合拆分专用系统提示词");
    expect(create.mock.calls[0]?.[0]?.messages?.[1]?.content).toBe(
      "拆分标题：聚合简讯\n拆分来源：测试源\n拆分正文：事件一。事件二。",
    );
    expect(create.mock.calls[0]?.[0]?.temperature).toBe(0);
    expect(create.mock.calls[0]?.[0]?.max_tokens).toBe(1600);
    expect(create.mock.calls[0]?.[0]?.response_format).toEqual({ type: "json_object" });
  });

  it("uses the configured aggregation split max events in prompts and parser limits", async () => {
    const create = vi.fn().mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              mainEvent: null,
              events: [1, 2, 3].map((index) => ({
                eventType: "release",
                eventSubject: `主体 ${index}`,
                eventAction: "发布",
                eventObject: `对象 ${index}`,
                eventDate: null,
                title: `事件标题 ${index}`,
                oneLiner: `事件摘要 ${index}`,
                qualityScore: 80 + index,
              })),
            }),
          },
        },
      ],
    });

    const provider = createAiProvider(
      {
        apiKey: "sk-test",
        baseURL: "https://example.com/v1",
        model: "test-model",
      },
      {
        itemAggregation: {
          systemPrompt: "聚合拆分系统提示词",
          promptTemplate: "最多 {{maxEvents}} 条\n标题：{{title}}\n正文：{{inputText}}",
        },
      },
      {
        chat: {
          completions: {
            create,
          },
        },
      },
      {
        aggregationSplitMaxEvents: 2,
      },
    );

    const parsed = await provider.parseAggregation("事件一。事件二。事件三。", {
      title: "聚合简讯",
      sourceName: "测试源",
    });

    expect(parsed.events.map((event) => event.title)).toEqual(["事件标题 1", "事件标题 2"]);
    expect(create.mock.calls[0]?.[0]?.messages?.[1]?.content).toContain("最多 2 条");
  });

  it("uses the higher default token budget for aggregation parsing", async () => {
    const create = vi.fn().mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              mainEvent: null,
              events: [],
            }),
          },
        },
      ],
    });

    const provider = createAiProvider(
      {
        apiKey: "sk-test",
        baseURL: "https://example.com/v1",
        model: "test-model",
      },
      undefined,
      {
        chat: {
          completions: {
            create,
          },
        },
      },
    );

    await provider.parseAggregation("事件一。事件二。", {
      title: "聚合简讯",
      sourceName: "测试源",
    });

    expect(create.mock.calls[0]?.[0]?.max_tokens).toBe(8000);
  });

  it("caps aggregation parsing results at twenty events", async () => {
    const create = vi.fn().mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              mainEvent: null,
              events: Array.from({ length: 25 }, (_, index) => ({
                eventType: "launch",
                eventSubject: `Subject ${index}`,
                eventAction: "发布",
                eventObject: `Object ${index}`,
                eventDate: null,
                oneLiner: `Subject ${index} 发布 Object ${index}`,
                qualityScore: 80,
              })),
            }),
          },
        },
      ],
    });

    const provider = createAiProvider(
      {
        apiKey: "sk-test",
        baseURL: "https://example.com/v1",
        model: "test-model",
      },
      undefined,
      {
        chat: {
          completions: {
            create,
          },
        },
      },
    );

    const parsed = await provider.parseAggregation("很多事件", {
      title: "聚合简讯",
      sourceName: "测试源",
    });

    expect(parsed.events).toHaveLength(20);
    expect(parsed.events.at(-1)?.eventSubject).toBe("Subject 19");
  });

  it("retries aggregation parsing once after a transient model timeout", async () => {
    const create = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error("504 Gateway Timeout"), { status: 504 }))
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: JSON.stringify({
                mainEvent: null,
                events: [
                  {
                    eventType: "launch",
                    eventSubject: "OpenAI",
                    eventAction: "发布",
                    eventObject: "Toolkit",
                    eventDate: null,
                    oneLiner: "OpenAI 发布 Toolkit",
                    qualityScore: 92,
                  },
                ],
              }),
            },
          },
        ],
      });

    const provider = createAiProvider(
      {
        apiKey: "sk-test",
        baseURL: "https://example.com/v1",
        model: "test-model",
      },
      undefined,
      {
        chat: {
          completions: {
            create,
          },
        },
      },
    );

    const parsed = await provider.parseAggregation("事件一。事件二。", {
      title: "聚合简讯",
      sourceName: "测试源",
    });

    expect(create).toHaveBeenCalledTimes(2);
    expect(parsed.events).toHaveLength(1);
    expect(parsed.events[0]?.eventSubject).toBe("OpenAI");
  });

  it("retries aggregation parsing once when the first response is invalid json", async () => {
    const create = vi
      .fn()
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: "{\"mainEvent\":null,\"events\":[{\"eventType\":\"launch\",\"eventSubject\":\"OpenAI\"",
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: JSON.stringify({
                mainEvent: null,
                events: [
                  {
                    eventType: "launch",
                    eventSubject: "OpenAI",
                    eventAction: "发布",
                    eventObject: "Toolkit",
                    eventDate: null,
                    oneLiner: "OpenAI 发布 Toolkit",
                    qualityScore: 92,
                  },
                ],
              }),
            },
          },
        ],
      });

    const provider = createAiProvider(
      {
        apiKey: "sk-test",
        baseURL: "https://example.com/v1",
        model: "test-model",
      },
      undefined,
      {
        chat: {
          completions: {
            create,
          },
        },
      },
    );

    const parsed = await provider.parseAggregation("事件一。事件二。", {
      title: "聚合简讯",
      sourceName: "测试源",
    });

    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[1]?.[0]?.messages?.[1]?.content).toContain("上一次输出不是合法 JSON");
    expect(parsed.events).toHaveLength(1);
    expect(parsed.events[0]?.eventSubject).toBe("OpenAI");
  });

  it("rejects invalid aggregation JSON instead of treating it as non-aggregation", async () => {
    const create = vi.fn().mockResolvedValue({
      choices: [
        {
          message: {
            content: '{"mainEvent":null,"events":[{"eventType":"release","eventSubject":"OpenAI"',
          },
        },
      ],
    });

    const provider = createAiProvider(
      {
        apiKey: "sk-test",
        baseURL: "https://example.com/v1",
        model: "test-model",
      },
      undefined,
      {
        chat: {
          completions: {
            create,
          },
        },
      },
    );

    await expect(
      provider.parseAggregation("事件一。事件二。", {
        title: "聚合简讯",
        sourceName: "测试源",
      }),
    ).rejects.toThrow("聚合拆分模型返回了无法解析的 JSON");
  });

  it("appends recent daily report topics when custom daily prompt lacks the placeholder", async () => {
    const create = vi.fn().mockResolvedValue({
      choices: [
        {
          message: {
            content: "{}",
          },
        },
      ],
    });
    const provider = createAiProvider(
      {
        apiKey: "sk-test",
        baseURL: "https://example.com/v1",
        model: "test-model",
      },
      {
        dailyReport: {
          systemPrompt: "生成日报。",
          promptTemplate: "日期：{{date}}\n候选内容 JSON：{{articlesJson}}",
        },
      },
      {
        chat: {
          completions: {
            create,
          },
        },
      },
    );

    await provider.generateDailyReport({
      date: "2026-04-24",
      timezone: "Asia/Shanghai",
      articles: [{ id: 1, title: "今日候选" }],
      recentTopics: [{ date: "2026-04-23", title: "昨日已写主题" }],
    });

    const userContent = create.mock.calls[0]?.[0]?.messages?.[1]?.content;
    expect(userContent).toContain("候选内容 JSON");
    expect(userContent).toContain("日报标题字段规则");
    expect(userContent).toContain("顶层必须包含 headline 字段");
    expect(userContent).toContain("MM-DD日报 | ");
    expect(userContent).toContain("最近 7 天已写主题 JSON");
    expect(userContent).toContain("昨日已写主题");
    expect(userContent).toContain("历史主题使用规则");
  });

  it("does not append daily report fallback rules when the prompt config is current", async () => {
    const create = vi.fn().mockResolvedValue({
      choices: [
        {
          message: {
            content: "{}",
          },
        },
      ],
    });
    const provider = createAiProvider(
      {
        apiKey: "sk-test",
        baseURL: "https://example.com/v1",
        model: "test-model",
      },
      {
        dailyReport: {
          systemPrompt: DEFAULT_DAILY_REPORT_PROMPT,
          promptTemplate: DEFAULT_DAILY_REPORT_USER_PROMPT_TEMPLATE,
        },
      },
      {
        chat: {
          completions: {
            create,
          },
        },
      },
    );

    await provider.generateDailyReport({
      date: "2026-04-24",
      timezone: "Asia/Shanghai",
      articles: [{ id: 1, title: "今日候选" }],
      recentTopics: [{ date: "2026-04-23", title: "昨日已写主题" }],
    });

    const userContent = create.mock.calls[0]?.[0]?.messages?.[1]?.content;
    expect(userContent).toContain("最近 7 天已写主题 JSON");
    expect(userContent).toContain("昨日已写主题");
    expect(userContent).not.toContain("日报标题字段规则");
    expect(userContent).not.toContain("历史主题使用规则");
  });
});
