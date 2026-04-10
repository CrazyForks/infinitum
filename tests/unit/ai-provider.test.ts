import { describe, expect, it, vi } from "vitest";

import { createAiProvider } from "@/lib/ai/provider";

describe("ai provider", () => {
  it("uses chat completions and returns translated title plus summary", async () => {
    const create = vi.fn().mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              translatedTitle: "中文标题",
              summary: "中文摘要",
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
      summary: "中文摘要",
    });
    expect(create).toHaveBeenCalledTimes(1);
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
    expect(enriched.summary).toContain("This is a long body");
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
                summary: "重试后的中文摘要",
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

    expect(enriched.summary).toBe("重试后的中文摘要");
    expect(create).toHaveBeenCalledTimes(2);
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
      summary: "可容错解析的摘要",
    });
    expect(create).toHaveBeenCalledTimes(2);
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
});
