import { afterEach, describe, expect, it, vi } from "vitest";

const requireAdmin = vi.fn();
const getAdminSettings = vi.fn();
const createModelApiConfig = vi.fn();
const createPromptConfig = vi.fn();
const getModelApiConfig = vi.fn();

vi.mock("@/lib/admin/session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/admin/session")>();

  return {
    ...actual,
    requireAdmin,
  };
});

vi.mock("@/lib/settings/service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/settings/service")>();

  return {
    ...actual,
    getAdminSettings,
    createModelApiConfig,
    createPromptConfig,
    getModelApiConfig,
  };
});

afterEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

describe("/api/admin/settings", () => {
  it("returns the settings payload for admins", async () => {
    requireAdmin.mockResolvedValue(undefined);
    getAdminSettings.mockResolvedValue({
      modelApiConfigs: [
        {
          id: "model-1",
          name: "默认模型配置",
          baseUrl: "https://example.com/v1",
          modelName: "gpt-test",
          ingestionItemConcurrency: 3,
          apiKeyMasked: "••••••••••••",
          hasApiKey: true,
          isEnabled: true,
          isDefault: true,
          createdAt: "2026-04-20T10:00:00.000Z",
          updatedAt: "2026-04-20T10:00:00.000Z",
        },
      ],
      promptConfigs: [
        {
          id: "prompt-1",
          name: "默认条目摘要提示词",
          type: "item_summary",
          prompt: "标题：{{title}}\n来源：{{sourceName}}\n正文：{{inputText}}",
          systemPrompt: "摘要内容",
          temperature: null,
          maxTokens: null,
          topP: null,
          modelApiConfigId: "model-1",
          modelApiConfigName: "默认模型配置",
          isUsingDefaultModel: false,
          isEnabled: true,
          isDefault: true,
          createdAt: "2026-04-20T10:00:00.000Z",
          updatedAt: "2026-04-20T10:00:00.000Z",
        },
      ],
      blacklistKeywords: ["layoffs"],
      taskSchedule: {
        key: "ingestion_default",
        enabled: true,
        cronExpression: "0 * * * *",
        sourceConcurrency: 2,
        fullTextFetchThreshold: 80,
        timezone: "Asia/Shanghai",
        lastHeartbeatAt: "2026-04-20T10:00:00.000Z",
        lastRunStartedAt: "2026-04-20T10:00:00.000Z",
        lastRunFinishedAt: "2026-04-20T10:05:00.000Z",
        lastRunStatus: "succeeded",
        nextRunAt: "2026-04-20T11:00:00.000Z",
        isHeartbeatStale: false,
      },
      groups: [{ id: "group-1", name: "Core" }],
      sources: [],
    });

    const { GET } = await import("@/app/api/admin/settings/route");
    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.modelApiConfigs[0].apiKeyMasked).toBe("••••••••••••");
    expect(json.promptConfigs[0].type).toBe("item_summary");
    expect(json.taskSchedule.key).toBe("ingestion_default");
  });

  it("returns raw api key only from the single model config detail endpoint", async () => {
    requireAdmin.mockResolvedValue(undefined);
    getModelApiConfig.mockResolvedValue({
      id: "model-1",
      name: "默认模型配置",
      baseUrl: "https://example.com/v1",
      modelName: "gpt-test",
      ingestionItemConcurrency: 3,
      apiKeyMasked: "••••••••••••",
      apiKeyRaw: "sk-test-1234",
      hasApiKey: true,
      isEnabled: true,
      isDefault: true,
      createdAt: "2026-04-20T10:00:00.000Z",
      updatedAt: "2026-04-20T10:00:00.000Z",
    });

    const { GET } = await import("@/app/api/admin/settings/model-api-configs/[id]/route");
    const response = await GET(new Request("http://localhost/api/admin/settings/model-api-configs/model-1"), {
      params: Promise.resolve({ id: "model-1" }),
    });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.apiKeyMasked).toBe("••••••••••••");
    expect(json.apiKeyRaw).toBe("sk-test-1234");
  });

  it("creates model api configs for admins", async () => {
    requireAdmin.mockResolvedValue(undefined);
    createModelApiConfig.mockResolvedValue({ id: "model-1" });

    const { POST } = await import("@/app/api/admin/settings/model-api-configs/route");
    const response = await POST(
      new Request("http://localhost/api/admin/settings/model-api-configs", {
        method: "POST",
        body: JSON.stringify({
          name: "默认模型配置",
          baseUrl: "https://example.com/v1",
          apiKey: "sk-test",
          modelName: "gpt-4.1-mini",
          ingestionItemConcurrency: 4,
          isEnabled: true,
          isDefault: true,
        }),
        headers: {
          "content-type": "application/json",
        },
      }),
    );

    expect(response.status).toBe(201);
    expect(createModelApiConfig).toHaveBeenCalledWith({
      name: "默认模型配置",
      baseUrl: "https://example.com/v1",
      apiKey: "sk-test",
      apiKeyMode: "replace",
      modelName: "gpt-4.1-mini",
      ingestionItemConcurrency: 4,
      isEnabled: true,
      isDefault: true,
    });
  });

  it("creates prompt configs for admins", async () => {
    requireAdmin.mockResolvedValue(undefined);
    createPromptConfig.mockResolvedValue({ id: "prompt-1" });

    const { POST } = await import("@/app/api/admin/settings/prompt-configs/route");
    const response = await POST(
      new Request("http://localhost/api/admin/settings/prompt-configs", {
        method: "POST",
        body: JSON.stringify({
          name: "默认条目摘要提示词",
          type: "item_summary",
          prompt: "标题：{{title}}\n来源：{{sourceName}}\n正文：{{inputText}}",
          systemPrompt: "摘要内容",
          temperature: null,
          maxTokens: null,
          topP: null,
          modelApiConfigId: "model-1",
          isEnabled: true,
          isDefault: true,
        }),
        headers: {
          "content-type": "application/json",
        },
      }),
    );

    expect(response.status).toBe(201);
    expect(createPromptConfig).toHaveBeenCalledWith({
      name: "默认条目摘要提示词",
      type: "item_summary",
      prompt: "标题：{{title}}\n来源：{{sourceName}}\n正文：{{inputText}}",
      systemPrompt: "摘要内容",
      temperature: null,
      maxTokens: null,
      topP: null,
      modelApiConfigId: "model-1",
      isEnabled: true,
      isDefault: true,
    });
  });
});
