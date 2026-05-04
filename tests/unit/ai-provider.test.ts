import { describe, expect, it, vi } from "vitest";

import { createAiProvider } from "@/lib/ai/provider";

describe("ai provider", () => {
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

  it("streams daily report refinement with current content and source registry context", async () => {
    async function* streamChunks() {
      yield { choices: [{ delta: { content: "{\"openingSummary\":" } }] };
      yield { choices: [{ delta: { content: "\"微调摘要\"}" } }] };
    }

    const create = vi.fn().mockReturnValue(streamChunks());
    const provider = createAiProvider(
      {
        apiKey: "sk-test",
        baseURL: "https://example.com/v1",
        model: "test-model",
      },
      {
        dailyReportRefinementGenerate: {
          systemPrompt: "日报微调生成配置提示词",
          promptTemplate: "当前日报 JSON：{{currentContentJson}}\n来源：{{sourceRegistryJson}}\n指令：{{instruction}}\n历史：{{messagesJson}}",
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

    let output = "";
    for await (const delta of provider.streamDailyReportRefinement({
      date: "2026-04-24",
      timezone: "Asia/Shanghai",
      currentContent: {
        openingSummary: "当前摘要内容足够长，用于作为微调起点，确保模型不是重新生成整篇日报。",
        sections: {
          今日大事: [{
            topic: "OpenAI 发布新模型",
            summary: "当前条目摘要",
            whyImportant: "模型能力提升",
            sourceIds: [1],
          }],
          变更与实践: [{
            topic: "开发者工具更新",
            action: "当前行动建议",
            sourceIds: [1],
          }],
          安全与风险: [],
          开源与工具: [],
          数据与洞察: [],
        },
        closingThought: "当前观察内容足够长，用于作为微调起点。",
      },
      sourceRegistry: [{
        sourceNumber: 1,
        sourceKey: "item:item-1",
        itemId: "item-1",
        clusterId: null,
        sourceName: "Example",
        title: "OpenAI 发布新模型",
        url: "https://example.com/a",
        summary: "来源摘要",
        publishedAt: "2026-04-24T01:00:00.000Z",
        qualityScore: 90,
        eventType: "release",
        eventSubject: "OpenAI",
        eventAction: "发布",
        eventObject: "新模型",
        eventDate: "2026-04-24",
      }],
      instruction: "压缩摘要",
      messages: [],
    })) {
      output += delta;
    }

    expect(output).toBe("{\"openingSummary\":\"微调摘要\"}");
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0]?.[0]?.stream).toBe(true);
    expect(create.mock.calls[0]?.[0]?.response_format).toEqual({ type: "json_object" });
    expect(create.mock.calls[0]?.[0]?.messages?.[0]?.content).toContain("日报微调生成配置提示词");
    expect(create.mock.calls[0]?.[0]?.messages?.[1]?.content).toContain("当前日报 JSON");
    expect(create.mock.calls[0]?.[0]?.messages?.[1]?.content).toContain("sourceNumber");
    expect(create.mock.calls[0]?.[0]?.messages?.[1]?.content).toContain("压缩摘要");
  });

  it("streams daily report refinement chat without json response format", async () => {
    async function* streamChunks() {
      yield { choices: [{ delta: { content: "可以先确认结构，" } }] };
      yield { choices: [{ delta: { content: "再生成候选稿。" } }] };
    }

    const create = vi.fn().mockReturnValue(streamChunks());
    const provider = createAiProvider(
      {
        apiKey: "sk-test",
        baseURL: "https://example.com/v1",
        model: "test-model",
      },
      {
        dailyReportRefinementChat: {
          systemPrompt: "日报微调对话配置提示词",
          promptTemplate: "当前 session 可用来源：{{sourceRegistryJson}}\n当前日报：{{currentContentJson}}\n历史：{{messagesJson}}\n本轮消息：{{instruction}}",
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

    let output = "";
    for await (const delta of provider.streamDailyReportRefinementChat({
      date: "2026-04-24",
      timezone: "Asia/Shanghai",
      currentContent: {
        openingSummary: "当前摘要内容足够长，用于作为微调起点，确保模型不是重新生成整篇日报。",
        sections: {
          今日大事: [{
            topic: "OpenAI 发布新模型",
            summary: "当前条目摘要",
            whyImportant: "模型能力提升",
            sourceIds: [1],
          }],
          变更与实践: [],
          安全与风险: [],
          开源与工具: [],
          数据与洞察: [],
        },
        closingThought: "当前观察内容足够长，用于作为微调起点。",
      },
      sourceRegistry: [{
        sourceNumber: 1,
        sourceKey: "item:item-1",
        itemId: "item-1",
        clusterId: null,
        sourceName: "Example",
        title: "OpenAI 发布新模型",
        url: "https://example.com/a",
        summary: "来源摘要",
        publishedAt: "2026-04-24T01:00:00.000Z",
        qualityScore: 90,
        eventType: "release",
        eventSubject: "OpenAI",
        eventAction: "发布",
        eventObject: "新模型",
        eventDate: "2026-04-24",
      }],
      instruction: "先讨论结构",
      messages: [],
    })) {
      output += delta;
    }

    expect(output).toBe("可以先确认结构，再生成候选稿。");
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0]?.[0]?.stream).toBe(true);
    expect(create.mock.calls[0]?.[0]?.response_format).toBeUndefined();
    expect(create.mock.calls[0]?.[0]?.messages?.[0]?.content).toContain("日报微调对话配置提示词");
    expect(create.mock.calls[0]?.[0]?.messages?.[1]?.content).toContain("当前 session 可用来源");
    expect(create.mock.calls[0]?.[0]?.messages?.[1]?.content).toContain("先讨论结构");
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
    });
    expect(create).toHaveBeenCalledTimes(1);
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
            content: "中文摘要",
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
  });

  it("keeps item summary fallback text untruncated when no api key is configured", async () => {
    const provider = createAiProvider({
      apiKey: "",
      baseURL: "",
      model: "test-model",
    });
    const body = "Fallback summary body. ".repeat(30).trim();

    const summary = await provider.summarizeItem(body, {
      title: "Original title",
      sourceName: "Example Feed",
    });

    expect(summary).toBe(body);
    expect(summary).not.toMatch(/\.\.\.$/);
  });

  it("keeps empty item summary response fallback text untruncated", async () => {
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

    const summary = await provider.summarizeItem(body, {
      title: "Original title",
      sourceName: "Example Feed",
    });

    expect(summary).toBe(body);
    expect(summary).not.toMatch(/\.\.\.$/);
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
    });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("uses the item summary prompt for pre-analysis summarization", async () => {
    const create = vi.fn().mockResolvedValue({
      choices: [
        {
          message: {
            content: "条目摘要结果",
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

    expect(summary).toBe("条目摘要结果");
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0]?.[0]?.messages?.[0]?.content).toContain("新闻摘要助手");
    expect(create.mock.calls[0]?.[0]?.messages?.[0]?.content).toContain("只输出摘要正文");
    expect(create.mock.calls[0]?.[0]?.response_format).toBeUndefined();
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
              content: "默认模型摘要",
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
    await expect(provider.summarizeItem("正文 3", { title: "标题 3" })).resolves.toBe("默认模型摘要");
    await expect(provider.summarizeItem("正文 4", { title: "标题 4" })).resolves.toBe("默认模型摘要");

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
});
