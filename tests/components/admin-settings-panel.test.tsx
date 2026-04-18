import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const { pushMock, refreshMock } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  refreshMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushMock,
    refresh: refreshMock,
  }),
}));

import { AdminSettingsPanel } from "@/components/admin/admin-settings-panel";

function buildInitialSettings() {
  return {
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
    sources: [
      {
        id: "source-1",
        name: "Existing Source",
        rssUrl: "https://example.com/feed.xml",
        siteUrl: "https://example.com",
        enabled: true,
        fetchFullTextWhenMissing: true,
        groupId: "group-1",
        groupName: "Core",
      },
    ],
  };
}

afterEach(() => {
  pushMock.mockReset();
  refreshMock.mockReset();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("AdminSettingsPanel", () => {
  it("shows the four settings tabs and defaults to the basic section only", () => {
    render(<AdminSettingsPanel initialSettings={buildInitialSettings()} />);

    expect(
      screen.getByRole("navigation", { name: "主导航" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "任务" })).toHaveAttribute(
      "href",
      "/admin/monitor",
    );
    const settingsNav = screen.getByRole("complementary", { name: "设置导航" });

    expect(
      within(settingsNav).getByRole("tab", { name: "基础配置" }),
    ).toHaveAttribute("aria-selected", "true");
    expect(
      within(settingsNav).getByRole("tab", { name: "黑名单" }),
    ).toBeInTheDocument();
    expect(
      within(settingsNav).getByRole("tab", { name: "分组" }),
    ).toBeInTheDocument();
    expect(
      within(settingsNav).getByRole("tab", { name: "信息源管理" }),
    ).toBeInTheDocument();
    expect(within(settingsNav).queryByText("Admin")).not.toBeInTheDocument();
    expect(within(settingsNav).queryByText("任务监控")).not.toBeInTheDocument();
    expect(
      within(settingsNav).queryByText("维护模型、规则与信息源。"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "后台设置工作台" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { level: 1, name: "后台设置" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Settings")).not.toBeInTheDocument();
    expect(
      screen.queryByText(
        "将基础模型参数、黑名单、分组与信息源维护收拢到统一后台壳层里，所有修改都会直接写入数据库并影响后续抓取与重生成流程。",
      ),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "基础配置" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: "黑名单" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: "分组" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: "信息源管理" }),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("并发数")).toHaveClass("min-h-9");
    expect(screen.getByRole("button", { name: "保存基础配置" })).toHaveClass(
      "min-h-9",
    );
  });

  it("switches sections from the sidebar tabs", async () => {
    const user = userEvent.setup();

    render(<AdminSettingsPanel initialSettings={buildInitialSettings()} />);

    await user.click(screen.getByRole("tab", { name: "信息源管理" }));

    const settingsNav = screen.getByRole("complementary", { name: "设置导航" });
    const sourcesWorkspace = screen.getByRole("region", {
      name: "信息源工作区",
    });
    const existingSourcesRegion = within(sourcesWorkspace).getByRole("region", {
      name: "已有信息源列表",
    });
    const existingSourceName = within(existingSourcesRegion).getByDisplayValue(
      "Existing Source",
    );
    const sourceRow = existingSourceName.closest("div.grid")?.parentElement;

    expect(
      within(settingsNav).getByRole("tab", { name: "基础配置" }),
    ).toHaveAttribute("aria-selected", "false");
    expect(
      within(settingsNav).getByRole("tab", { name: "信息源管理" }),
    ).toHaveAttribute("aria-selected", "true");
    expect(
      screen.getByRole("region", { name: "信息源管理" }),
    ).toBeInTheDocument();
    expect(
      within(sourcesWorkspace).getByRole("region", { name: "新建信息源" }),
    ).toBeInTheDocument();
    expect(existingSourcesRegion).toBeInTheDocument();
    expect(sourcesWorkspace).toHaveClass("rounded-[1rem]", "border");
    expect(existingSourcesRegion).not.toHaveClass("rounded-[0.95rem]");
    expect(sourceRow).toHaveClass("border-t");
    expect(
      screen.queryByRole("region", { name: "基础配置" }),
    ).not.toBeInTheDocument();
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
          ...buildInitialSettings(),
          sources: [],
        }}
      />,
    );

    await user.clear(screen.getByLabelText("并发数"));
    await user.type(screen.getByLabelText("并发数"), "4");
    await user.clear(screen.getByLabelText("内容分析提示词"));
    await user.type(
      screen.getByLabelText("内容分析提示词"),
      "新的单条分析提示词",
    );
    await user.clear(screen.getByLabelText("聚合摘要提示词"));
    await user.type(
      screen.getByLabelText("聚合摘要提示词"),
      "新的聚合摘要提示词",
    );
    await user.clear(screen.getByLabelText("归组判定提示词"));
    await user.type(
      screen.getByLabelText("归组判定提示词"),
      "新的归组判定提示词",
    );
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
    const refreshSpy = vi.fn();
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
        onRefresh={refreshSpy}
        initialSettings={{
          ...buildInitialSettings(),
          blacklistKeywords: [],
          sources: [],
        }}
      />,
    );

    await user.click(screen.getByRole("tab", { name: "信息源管理" }));
    await user.type(
      screen.getByLabelText("RSS URL"),
      "https://feeds.example.com/feed.xml?raw=1",
    );
    await user.click(screen.getByRole("button", { name: "根据 RSS 自动填充" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/admin/settings/sources/resolve",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            rssUrl: "https://feeds.example.com/feed.xml?raw=1",
          }),
        },
      );
    });

    const nameInput = screen.getByLabelText("名称") as HTMLInputElement;
    const rssUrlInput = screen.getByLabelText("RSS URL") as HTMLInputElement;
    const siteUrlInput = screen.getByLabelText("站点 URL") as HTMLInputElement;
    const groupSelect = screen.getByLabelText("所属分组");

    expect(nameInput.value).toBe("Resolved Feed");
    expect(rssUrlInput.value).toBe("https://feeds.example.com/normalized.xml");
    expect(siteUrlInput.value).toBe("https://feeds.example.com");

    await user.selectOptions(groupSelect, "group-1");
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
          groupId: "group-1",
        }),
      });
    });

    await waitFor(() => {
      expect(refreshSpy).toHaveBeenCalledTimes(1);
    });
  });

  it("keeps the global admin shell chrome", () => {
    render(
      <AdminSettingsPanel
        initialSettings={{ ...buildInitialSettings(), groups: [], sources: [] }}
      />,
    );

    expect(
      screen.getByRole("navigation", { name: "主导航" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("complementary", { name: "设置导航" }),
    ).toBeInTheDocument();
  });
});
