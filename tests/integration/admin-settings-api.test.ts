import { afterEach, describe, expect, it, vi } from "vitest";

const requireAdmin = vi.fn();
const getAdminSettings = vi.fn();
const updateAppConfig = vi.fn();

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
    updateAppConfig,
  };
});

afterEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

describe("/api/admin/settings", () => {
  it("returns the database-backed settings payload for admins", async () => {
    requireAdmin.mockResolvedValue(undefined);
    getAdminSettings.mockResolvedValue({
      appConfig: {
        ingestionItemConcurrency: 3,
        modelApi: {
          baseURL: "https://example.com/v1",
          model: "gpt-test",
          apiKeyMasked: "••••••••1234",
          hasApiKey: true,
        },
        prompts: {
          itemAnalysis: "单条提示词",
          clusterSummary: "聚合提示词",
          clusterMatch: "归组提示词",
        },
      },
      blacklistKeywords: ["layoffs"],
      groups: [{ id: "group-1", name: "Core" }],
      sources: [],
    });

    const { GET } = await import("@/app/api/admin/settings/route");
    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.groups[0].name).toBe("Core");
    expect(json.appConfig.modelApi.apiKeyMasked).toBe("••••••••1234");
    expect(json.appConfig.prompts.itemAnalysis).toBe("单条提示词");
    expect(json.appConfig.prompts.clusterMatch).toBe("归组提示词");
  });

  it("updates basic app config for admins", async () => {
    requireAdmin.mockResolvedValue(undefined);
    updateAppConfig.mockResolvedValue(undefined);

    const { PUT } = await import("@/app/api/admin/settings/app-config/route");
    const response = await PUT(
      new Request("http://localhost/api/admin/settings/app-config", {
        method: "PUT",
        body: JSON.stringify({
          ingestionItemConcurrency: 4,
          modelApiBaseUrl: "https://example.com/v1",
          modelApiModel: "gpt-4.1-mini",
          modelApiKey: "sk-updated",
          apiKeyMode: "replace",
          itemAnalysisPrompt: "新的单条分析提示词",
          clusterSummaryPrompt: "新的聚合摘要提示词",
          clusterMatchPrompt: "新的归组判定提示词",
        }),
        headers: {
          "content-type": "application/json",
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(updateAppConfig).toHaveBeenCalledWith({
      ingestionItemConcurrency: 4,
      modelApiBaseUrl: "https://example.com/v1",
      modelApiModel: "gpt-4.1-mini",
      modelApiKey: "sk-updated",
      apiKeyMode: "replace",
      itemAnalysisPrompt: "新的单条分析提示词",
      clusterSummaryPrompt: "新的聚合摘要提示词",
      clusterMatchPrompt: "新的归组判定提示词",
    });
  });
});
