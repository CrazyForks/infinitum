import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AdminSettingsPanel } from "@/components/admin/admin-settings-panel";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("AdminSettingsPanel", () => {
  it("renders the shared admin shell structure with named regions", () => {
    render(
      <AdminSettingsPanel
        initialSettings={{
          appConfig: {
            ingestionItemConcurrency: 3,
            modelApi: {
              baseURL: "https://example.com/v1",
              model: "gpt-4.1-mini",
              apiKeyMasked: "••••••••1234",
              hasApiKey: true,
            },
            prompts: {
              itemAnalysis: "默认单条分析提示词",
              clusterSummary: "默认聚合摘要提示词",
              clusterMatch: "默认归组判定提示词",
            },
          },
          blacklistKeywords: [],
          groups: [{ id: "group-1", name: "Core" }],
          sources: [],
        }}
      />,
    );

    expect(screen.getByText("Settings")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "后台设置" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "基础配置" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "信息源管理" })).toBeInTheDocument();
  });

  it("saves the basic app config section", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
        }),
      ),
    );

    vi.stubGlobal("fetch", fetchMock);

    render(
      <AdminSettingsPanel
        initialSettings={{
          appConfig: {
            ingestionItemConcurrency: 3,
            modelApi: {
              baseURL: "https://example.com/v1",
              model: "gpt-4.1-mini",
              apiKeyMasked: "••••••••1234",
              hasApiKey: true,
            },
            prompts: {
              itemAnalysis: "默认单条分析提示词",
              clusterSummary: "默认聚合摘要提示词",
              clusterMatch: "默认归组判定提示词",
            },
          },
          blacklistKeywords: ["layoffs"],
          groups: [{ id: "group-1", name: "Core" }],
          sources: [],
        }}
      />,
    );

    await user.clear(screen.getByLabelText("并发数"));
    await user.type(screen.getByLabelText("并发数"), "4");
    await user.clear(screen.getByLabelText("内容分析提示词"));
    await user.type(screen.getByLabelText("内容分析提示词"), "新的单条分析提示词");
    await user.clear(screen.getByLabelText("聚合摘要提示词"));
    await user.type(screen.getByLabelText("聚合摘要提示词"), "新的聚合摘要提示词");
    await user.clear(screen.getByLabelText("归组判定提示词"));
    await user.type(screen.getByLabelText("归组判定提示词"), "新的归组判定提示词");
    await user.click(screen.getByRole("button", { name: "保存基础配置" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/admin/settings/app-config", {
        method: "PUT",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          ingestionItemConcurrency: 4,
          modelApiBaseUrl: "https://example.com/v1",
          modelApiModel: "gpt-4.1-mini",
          modelApiKey: "",
          apiKeyMode: "keep",
          itemAnalysisPrompt: "新的单条分析提示词",
          clusterSummaryPrompt: "新的聚合摘要提示词",
          clusterMatchPrompt: "新的归组判定提示词",
        }),
      });
    });
  });

  it("uses the normalized RSS URL returned by resolve when creating a source", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            source: {
              name: "Resolved Feed",
              rssUrl: "https://feeds.example.com/normalized.xml",
              siteUrl: "https://feeds.example.com",
            },
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: true,
          }),
        ),
      );

    vi.stubGlobal("fetch", fetchMock);

    render(
      <AdminSettingsPanel
        initialSettings={{
          appConfig: {
            ingestionItemConcurrency: 3,
            modelApi: {
              baseURL: "https://example.com/v1",
              model: "gpt-4.1-mini",
              apiKeyMasked: "••••••••1234",
              hasApiKey: true,
            },
            prompts: {
              itemAnalysis: "默认单条分析提示词",
              clusterSummary: "默认聚合摘要提示词",
              clusterMatch: "默认归组判定提示词",
            },
          },
          blacklistKeywords: [],
          groups: [{ id: "group-1", name: "Core" }],
          sources: [],
        }}
      />,
    );

    const inputs = screen.getAllByPlaceholderText("RSS URL");
    await user.type(inputs[0]!, "https://feeds.example.com/feed.xml?raw=1");
    await user.click(screen.getByRole("button", { name: "根据 RSS 自动填充" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/admin/settings/sources/resolve", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          rssUrl: "https://feeds.example.com/feed.xml?raw=1",
        }),
      });
    });

    const nameInput = screen.getAllByPlaceholderText("名称")[0] as HTMLInputElement;
    const rssUrlInput = screen.getAllByPlaceholderText("RSS URL")[0] as HTMLInputElement;
    const siteUrlInput = screen.getAllByPlaceholderText("站点 URL")[0] as HTMLInputElement;

    expect(nameInput.value).toBe("Resolved Feed");
    expect(rssUrlInput.value).toBe("https://feeds.example.com/normalized.xml");
    expect(siteUrlInput.value).toBe("https://feeds.example.com");

    await user.click(screen.getByRole("button", { name: "创建信息源" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/admin/settings/sources", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          name: "Resolved Feed",
          rssUrl: "https://feeds.example.com/normalized.xml",
          siteUrl: "https://feeds.example.com",
          enabled: true,
          fetchFullTextWhenMissing: true,
          groupId: null,
        }),
      });
    });
  });

  it("shows the task monitor navigation link", () => {
    render(
      <AdminSettingsPanel
        initialSettings={{
          appConfig: {
            ingestionItemConcurrency: 3,
            modelApi: {
              baseURL: "https://example.com/v1",
              model: "gpt-4.1-mini",
              apiKeyMasked: "••••••••1234",
              hasApiKey: true,
            },
            prompts: {
              itemAnalysis: "默认单条分析提示词",
              clusterSummary: "默认聚合摘要提示词",
              clusterMatch: "默认归组判定提示词",
            },
          },
          blacklistKeywords: [],
          groups: [],
          sources: [],
        }}
      />,
    );

    expect(screen.getByRole("link", { name: "任务监控" })).toHaveAttribute("href", "/admin/monitor");
  });
});
