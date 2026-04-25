import type { ReactNode } from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
import { ToastProvider } from "@/components/ui/toast";
import type { AdminSettingsSnapshot } from "@/lib/settings/types";

const originalClipboard = navigator.clipboard;
const originalExecCommand = document.execCommand;

function buildInitialSettings(): AdminSettingsSnapshot {
  return {
    modelApiConfigs: [
      {
        id: "model-1",
        name: "默认模型配置",
        baseUrl: "https://example.com/v1",
        modelName: "gpt-4.1-mini",
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
        id: "prompt-0",
        name: "默认条目摘要提示词",
        type: "item_summary" as const,
        prompt: "标题：{{title}}\n来源：{{sourceName}}\n正文：{{inputText}}",
        systemPrompt: "请总结单条内容。",
        temperature: 0.2,
        maxTokens: 300,
        topP: 1,
        modelApiConfigId: "",
        modelApiConfigName: "默认模型配置",
        isUsingDefaultModel: true,
        isEnabled: true,
        isDefault: true,
        createdAt: "2026-04-20T10:00:00.000Z",
        updatedAt: "2026-04-20T10:00:00.000Z",
      },
      {
        id: "prompt-1",
        name: "默认内容分析提示词",
        type: "item_analysis" as const,
        prompt: "标题：{{title}}\n正文：{{inputText}}",
        systemPrompt: "请分析内容并输出 JSON。",
        temperature: 0.2,
        maxTokens: 900,
        topP: 1,
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
      perSourceItemLimit: 20,
      timezone: "Asia/Shanghai",
      lastHeartbeatAt: "2026-04-20T10:00:00.000Z",
      lastRunStartedAt: "2026-04-20T10:00:00.000Z",
      lastRunFinishedAt: "2026-04-20T10:05:00.000Z",
      lastRunStatus: "succeeded" as const,
      nextRunAt: "2026-04-20T11:00:00.000Z",
      isHeartbeatStale: false,
    },
    groups: [{ id: "group-1", name: "Core", sortOrder: 0 }],
    sources: [
      {
        id: "source-1",
        name: "Existing Source",
        rssUrl: "https://example.com/feed.xml",
        siteUrl: "https://example.com",
        enabled: true,
        aiParsingEnabled: true,
        aggregationEnabled: true,
        groupId: "group-1",
        groupName: "Core",
        lastItemCreatedAt: "2026-04-20T10:00:00.000Z",
      },
    ],
  };
}

afterEach(() => {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: originalClipboard,
  });
  Object.defineProperty(document, "execCommand", {
    configurable: true,
    value: originalExecCommand,
  });
  window.history.replaceState(null, "", "/");
  pushMock.mockReset();
  refreshMock.mockReset();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function renderWithProviders(node: ReactNode) {
  return render(<ToastProvider>{node}</ToastProvider>);
}

describe("AdminSettingsPanel", () => {
  it("renders new AI tabs and defaults to model api without the basic tab", () => {
    renderWithProviders(<AdminSettingsPanel initialSettings={buildInitialSettings()} />);

    const settingsNav = screen.getByRole("complementary", { name: "设置导航" });

    expect(within(settingsNav).queryByRole("tab", { name: "基础配置" })).not.toBeInTheDocument();
    expect(within(settingsNav).getByRole("tab", { name: "模型API" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(within(settingsNav).getByRole("tab", { name: "提示词" })).toBeInTheDocument();
    expect(within(settingsNav).getByRole("tab", { name: "任务配置" })).toBeInTheDocument();
    expect(screen.getByText("模型API配置")).toBeInTheDocument();
    expect(screen.getAllByText("默认模型配置").length).toBeGreaterThan(0);
    expect(screen.getByText("抓取并发：")).toBeInTheDocument();
  });

  it("switches to prompt settings from the sidebar tabs", async () => {
    const user = userEvent.setup();

    renderWithProviders(<AdminSettingsPanel initialSettings={buildInitialSettings()} />);

    await user.click(screen.getByRole("tab", { name: "提示词" }));

    expect(screen.getByText("提示词配置")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "条目摘要" })).toBeInTheDocument();
    // 切换到"内容分析"标签页以查看内容分析类提示词
    await user.click(screen.getByRole("button", { name: "内容分析" }));
    expect(screen.getByText("默认内容分析提示词")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "预览" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "复制" })).toBeInTheDocument();
  });

  it("disables deleting default model and prompt configs", async () => {
    const user = userEvent.setup();

    renderWithProviders(<AdminSettingsPanel initialSettings={buildInitialSettings()} />);

    const modelDeleteButton = screen.getByRole("button", { name: "默认配置不可删除" });
    expect(modelDeleteButton).toBeDisabled();

    await user.click(screen.getByRole("tab", { name: "提示词" }));

    const promptDeleteButton = screen.getByRole("button", { name: "默认配置不可删除" });
    expect(promptDeleteButton).toBeDisabled();
  });

  it("creates a model config with ingestion concurrency from the model api page", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          config: {
            id: "model-2",
            name: "新的模型配置",
            baseUrl: "https://example.com/v1",
            modelName: "gpt-4.1",
            ingestionItemConcurrency: 4,
            apiKeyMasked: "••••••••••••",
            hasApiKey: true,
            isEnabled: true,
            isDefault: false,
            createdAt: "2026-04-20T11:00:00.000Z",
            updatedAt: "2026-04-20T11:00:00.000Z",
          },
        }),
      ),
    );

    vi.stubGlobal("fetch", fetchMock);

    renderWithProviders(<AdminSettingsPanel initialSettings={buildInitialSettings()} />);

    await user.click(screen.getByRole("button", { name: /\+ 创建配置/i }));
    await user.clear(screen.getByLabelText(/配置名称/));
    await user.type(screen.getByLabelText(/配置名称/), "新的模型配置");
    await user.clear(screen.getByLabelText(/API密钥/));
    await user.type(screen.getByLabelText(/API密钥/), "sk-test-9876");
    await user.clear(screen.getByLabelText(/抓取并发数/));
    await user.type(screen.getByLabelText(/抓取并发数/), "4");
    await user.click(screen.getByRole("button", { name: "创建" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/admin/settings/model-api-configs", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          name: "新的模型配置",
          baseUrl: "https://api.openai.com/v1",
          apiKey: "sk-test-9876",
          apiKeyMode: "replace",
          modelName: "gpt-4.1-mini",
          ingestionItemConcurrency: 4,
          isEnabled: true,
          isDefault: false,
        }),
      });
    });
  });

  it("edits model config concurrency from the model api modal", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ...buildInitialSettings().modelApiConfigs[0],
            apiKeyRaw: "sk-test-1234",
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            config: {
              ...buildInitialSettings().modelApiConfigs[0],
              ingestionItemConcurrency: 5,
            },
          }),
        ),
      );

    vi.stubGlobal("fetch", fetchMock);

    renderWithProviders(<AdminSettingsPanel initialSettings={buildInitialSettings()} />);

    await user.click(screen.getByTitle("编辑"));
    await user.clear(screen.getByLabelText(/抓取并发数/));
    await user.type(screen.getByLabelText(/抓取并发数/), "5");
    await user.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/admin/settings/model-api-configs/model-1", {
        method: "PUT",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          name: "默认模型配置",
          baseUrl: "https://example.com/v1",
          apiKey: "",
          apiKeyMode: "keep",
          modelName: "gpt-4.1-mini",
          ingestionItemConcurrency: 5,
          isEnabled: true,
          isDefault: true,
        }),
      });
    });
  });

  it("copies the raw model api key from the edit modal", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn<Clipboard["writeText"]>().mockResolvedValue(undefined);
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          ...buildInitialSettings().modelApiConfigs[0],
          apiKeyRaw: "sk-test-1234",
        }),
      ),
    );

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    vi.stubGlobal("fetch", fetchMock);

    renderWithProviders(<AdminSettingsPanel initialSettings={buildInitialSettings()} />);

    await user.click(screen.getByTitle("编辑"));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/admin/settings/model-api-configs/model-1", {
        method: "GET",
      });
    });

    await waitFor(() => {
      expect(screen.getByTitle("复制")).not.toBeDisabled();
    });

    await user.click(screen.getByTitle("复制"));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith("sk-test-1234");
    });
  });

  it("falls back when the clipboard api cannot copy the model api key", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn<Clipboard["writeText"]>().mockRejectedValue(new Error("denied"));
    const execCommand = vi.fn<(commandId: string) => boolean>(() => {
      expect(document.querySelector("textarea")).toHaveValue("sk-test-1234");
      return true;
    });
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          ...buildInitialSettings().modelApiConfigs[0],
          apiKeyRaw: "sk-test-1234",
        }),
      ),
    );

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: execCommand,
    });
    vi.stubGlobal("fetch", fetchMock);

    renderWithProviders(<AdminSettingsPanel initialSettings={buildInitialSettings()} />);

    await user.click(screen.getByTitle("编辑"));

    await waitFor(() => {
      expect(screen.getByTitle("复制")).not.toBeDisabled();
    });

    await user.click(screen.getByTitle("复制"));

    await waitFor(() => {
      expect(execCommand).toHaveBeenCalledWith("copy");
    });
  });

  it("creates a prompt config from the prompt section", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          config: {
            id: "prompt-2",
            name: "新的聚合摘要提示词",
            type: "cluster_summary",
            prompt: "主题：{{title}}",
            systemPrompt: "总结多条内容",
            temperature: null,
            maxTokens: null,
            topP: null,
            modelApiConfigId: null,
            modelApiConfigName: null,
            isEnabled: true,
            isDefault: false,
            createdAt: "2026-04-20T11:00:00.000Z",
            updatedAt: "2026-04-20T11:00:00.000Z",
          },
        }),
      ),
    );

    vi.stubGlobal("fetch", fetchMock);

    renderWithProviders(<AdminSettingsPanel initialSettings={buildInitialSettings()} />);

    await user.click(screen.getByRole("tab", { name: "提示词" }));
    await user.click(screen.getByRole("button", { name: "条目摘要" }));
    await user.click(screen.getAllByRole("button", { name: /创建配置/i })[0]);
    await user.clear(screen.getByLabelText(/配置名称/));
    await user.type(screen.getByLabelText(/配置名称/), "新的条目摘要提示词");
    await user.clear(screen.getByLabelText(/系统提示词/));
    await user.type(screen.getByLabelText(/系统提示词/), "总结单条内容");
    fireEvent.change(screen.getByLabelText(/提示词模板/), {
      target: { value: "标题：{{title}}\n来源：{{sourceName}}\n正文：{{inputText}}" },
    });
    await user.click(screen.getByRole("button", { name: "创建" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/admin/settings/prompt-configs", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          name: "新的条目摘要提示词",
          type: "item_summary",
          prompt: "标题：{{title}}\n来源：{{sourceName}}\n正文：{{inputText}}",
          systemPrompt: "总结单条内容",
          temperature: null,
          maxTokens: null,
          topP: null,
          modelApiConfigId: null,
          isEnabled: true,
          isDefault: false,
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
              suggestedAiParsingEnabled: false,
            },
          }),
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true })));

    vi.stubGlobal("fetch", fetchMock);

    renderWithProviders(
      <AdminSettingsPanel
        onRefresh={refreshSpy}
        initialSettings={{ ...buildInitialSettings(), blacklistKeywords: [], sources: [] }}
      />,
    );

    await user.click(screen.getByRole("tab", { name: "信息源" }));
    await user.click(screen.getByRole("button", { name: "新建信息源" }));
    await user.type(screen.getByLabelText("RSS URL"), "https://feeds.example.com/feed.xml?raw=1");
    await user.click(screen.getByRole("button", { name: "自动填充" }));

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

    await user.selectOptions(screen.getByLabelText("所属分组"), "group-1");
    await user.click(screen.getByRole("button", { name: "创建" }));

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
          aiParsingEnabled: false,
          aggregationEnabled: true,
          groupId: "group-1",
        }),
      });
    });

    await waitFor(() => {
      expect(refreshSpy).toHaveBeenCalledTimes(1);
    });
  });

  it("filters the source list by name, group and enabled status", async () => {
    const user = userEvent.setup();

    renderWithProviders(
      <AdminSettingsPanel
        initialSettings={{
          ...buildInitialSettings(),
          sources: [
            buildInitialSettings().sources[0],
            {
              id: "source-2",
              name: "Infra Feed",
              rssUrl: "https://infra.example.com/rss.xml",
              siteUrl: "https://infra.example.com",
              enabled: false,
              aiParsingEnabled: false,
              aggregationEnabled: false,
              groupId: null,
              groupName: null,
              lastItemCreatedAt: null,
            },
          ],
        }}
      />,
    );

    await user.click(screen.getByRole("tab", { name: "信息源" }));
    const sourcesPanel = screen.getByRole("tabpanel");

    expect(screen.getByText("Existing Source")).toBeInTheDocument();
    expect(screen.getByText("Infra Feed")).toBeInTheDocument();
    expect(screen.queryByText("https://example.com/feed.xml")).not.toBeInTheDocument();
    expect(screen.queryByText("ID：source-1")).not.toBeInTheDocument();
    expect(within(sourcesPanel).getByText("站点信息")).toBeInTheDocument();

    await user.type(within(sourcesPanel).getByLabelText("RSS源名称"), "Infra");
    expect(screen.queryByText("Existing Source")).not.toBeInTheDocument();
    expect(screen.getByText("Infra Feed")).toBeInTheDocument();

    await user.clear(within(sourcesPanel).getByLabelText("RSS源名称"));
    await user.selectOptions(within(sourcesPanel).getByLabelText("是否启用"), "enabled");
    expect(screen.getByText("Existing Source")).toBeInTheDocument();
    expect(screen.queryByText("Infra Feed")).not.toBeInTheDocument();

    await user.selectOptions(within(sourcesPanel).getByLabelText("分组"), "__ungrouped__");
    expect(screen.queryByText("Existing Source")).not.toBeInTheDocument();
  });

  it("exports OPML with source status and AI parsing metadata", async () => {
    const user = userEvent.setup();
    const createObjectUrl = vi.fn<(object: Blob | MediaSource) => string>(() => "blob:opml");
    const revokeObjectUrl = vi.fn();
    const click = vi.fn();
    const appendChild = vi.spyOn(document.body, "appendChild");

    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: createObjectUrl,
      revokeObjectURL: revokeObjectUrl,
    });

    renderWithProviders(<AdminSettingsPanel initialSettings={buildInitialSettings()} />);

    const createElement = vi.spyOn(document, "createElement");
    createElement.mockImplementation((tagName: string, options?: ElementCreationOptions) => {
      const element = document.createElementNS("http://www.w3.org/1999/xhtml", tagName) as HTMLElement;
      if (tagName === "a") {
        Object.defineProperty(element, "click", { value: click });
      }
      return options ? (document.createElementNS("http://www.w3.org/1999/xhtml", tagName, options) as HTMLElement) : element;
    });

    await user.click(screen.getByRole("tab", { name: "信息源" }));
    await user.click(screen.getByRole("button", { name: "导出 OPML" }));

    expect(createObjectUrl).toHaveBeenCalledTimes(1);
    const blob = createObjectUrl.mock.calls[0][0] as Blob;
    const text = await blob.text();

    expect(text).toContain('xmlns:infinitum="https://infinitum.app/opml"');
    expect(text).toContain('infinitum:enabled="true"');
    expect(text).toContain('infinitum:aiParsingEnabled="true"');
    expect(text).toContain('infinitum:aggregationEnabled="true"');
    expect(appendChild).toHaveBeenCalled();
    expect(click).toHaveBeenCalledTimes(1);
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:opml");
  });

  it("requires confirmation before deleting a source", async () => {
    const user = userEvent.setup();
    const refreshSpy = vi.fn();
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify({ ok: true })));

    vi.stubGlobal("fetch", fetchMock);

    renderWithProviders(
      <AdminSettingsPanel onRefresh={refreshSpy} initialSettings={buildInitialSettings()} />,
    );

    await user.click(screen.getByRole("tab", { name: "信息源" }));

    const sourcesPanel = screen.getByRole("tabpanel");
    await user.click(within(sourcesPanel).getByTitle("删除"));

    const deleteDialog = screen.getByRole("dialog", { name: "确认删除信息源" });
    expect(within(deleteDialog).getByText(/Existing Source/)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();

    await user.click(within(deleteDialog).getByRole("button", { name: "取消" }));
    expect(screen.queryByRole("dialog", { name: "确认删除信息源" })).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();

    await user.click(within(sourcesPanel).getByTitle("删除"));
    await user.click(
      within(screen.getByRole("dialog", { name: "确认删除信息源" })).getByRole("button", {
        name: "确认删除",
      }),
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/admin/settings/sources/source-1", {
        method: "DELETE",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({}),
      });
    });

    await waitFor(() => {
      expect(refreshSpy).toHaveBeenCalledTimes(1);
    });
  });

  it("renders the Lumina-like group management list and creates a group from the header action", async () => {
    const user = userEvent.setup();
    const refreshSpy = vi.fn();
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ ok: true })));

    vi.stubGlobal("fetch", fetchMock);

    renderWithProviders(
      <AdminSettingsPanel onRefresh={refreshSpy} initialSettings={buildInitialSettings()} />,
    );

    await user.click(screen.getByRole("tab", { name: "分组" }));

    const groupsPanel = screen.getByRole("tabpanel");

    expect(within(groupsPanel).getByText("分组列表")).toBeInTheDocument();
    expect(within(groupsPanel).getByRole("button", { name: "+ 新增分组" })).toBeInTheDocument();
    expect(within(groupsPanel).getByText("Core")).toBeInTheDocument();
    expect(
      within(groupsPanel).queryByText("用于组织信息源与 OPML 导入结果"),
    ).not.toBeInTheDocument();

    await user.click(within(groupsPanel).getByRole("button", { name: "+ 新增分组" }));
    await user.type(screen.getByPlaceholderText("新分组名称"), "Infra");
    await user.click(screen.getByRole("button", { name: "创建" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/admin/settings/groups", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          name: "Infra",
        }),
      });
    });

    await waitFor(() => {
      expect(refreshSpy).toHaveBeenCalledTimes(1);
    });
  });

  it("links a source to a group from the group management row", async () => {
    const user = userEvent.setup();
    const refreshSpy = vi.fn();
    const initialSettings = buildInitialSettings();
    const targetSource = {
      id: "source-2",
      name: "Other Source",
      rssUrl: "https://other.example.com/feed.xml",
      siteUrl: "https://other.example.com",
      enabled: true,
      aiParsingEnabled: true,
      aggregationEnabled: false,
      groupId: null,
      groupName: null,
      lastItemCreatedAt: null,
    };
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ ok: true })));

    vi.stubGlobal("fetch", fetchMock);

    renderWithProviders(
      <AdminSettingsPanel
        onRefresh={refreshSpy}
        initialSettings={{
          ...initialSettings,
          sources: [...initialSettings.sources, targetSource],
        }}
      />,
    );

    await user.click(screen.getByRole("tab", { name: "分组" }));
    await user.click(screen.getByRole("button", { name: "关联信息源：Core" }));

    const dialog = await screen.findByRole("dialog", { name: "关联信息源：Core" });
    await user.type(within(dialog).getByLabelText("搜索信息源"), "Other");

    expect(within(dialog).getByText("Other Source")).toBeInTheDocument();
    expect(within(dialog).getByText("当前分组：未分组")).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "关联到 Core" }));

    const confirmDialog = await screen.findByRole("dialog", { name: "确认关联信息源" });
    expect(
      within(confirmDialog).getByText("确认将「Other Source」关联到「Core」？"),
    ).toBeInTheDocument();
    await user.click(within(confirmDialog).getByRole("button", { name: "确认" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/admin/settings/sources/source-2", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          name: "Other Source",
          rssUrl: "https://other.example.com/feed.xml",
          siteUrl: "https://other.example.com",
          enabled: true,
          aiParsingEnabled: true,
          aggregationEnabled: false,
          groupId: "group-1",
        }),
      });
    });

    await waitFor(() => {
      expect(within(dialog).getByText("当前分组：Core")).toBeInTheDocument();
    });
    expect(within(dialog).getByRole("button", { name: "取消关联" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "确认关联信息源" })).not.toBeInTheDocument();
    expect(refreshSpy).not.toHaveBeenCalled();
  });

  it("unlinks an already associated source from the group management dialog", async () => {
    const user = userEvent.setup();
    const refreshSpy = vi.fn();
    const initialSettings = buildInitialSettings();
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ ok: true })));

    vi.stubGlobal("fetch", fetchMock);

    renderWithProviders(
      <AdminSettingsPanel onRefresh={refreshSpy} initialSettings={initialSettings} />,
    );

    await user.click(screen.getByRole("tab", { name: "分组" }));
    await user.click(screen.getByRole("button", { name: "关联信息源：Core" }));

    const dialog = await screen.findByRole("dialog", { name: "关联信息源：Core" });
    expect(within(dialog).getByText("Existing Source")).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "取消关联" }));

    const confirmDialog = await screen.findByRole("dialog", { name: "确认取消关联" });
    expect(
      within(confirmDialog).getByText("确认取消「Existing Source」与「Core」的分组关联？"),
    ).toBeInTheDocument();
    await user.click(within(confirmDialog).getByRole("button", { name: "确认" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/admin/settings/sources/source-1", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          name: "Existing Source",
          rssUrl: "https://example.com/feed.xml",
          siteUrl: "https://example.com",
          enabled: true,
          aiParsingEnabled: true,
          aggregationEnabled: true,
          groupId: null,
        }),
      });
    });

    await waitFor(() => {
      expect(within(dialog).getByText("当前分组：未分组")).toBeInTheDocument();
    });
    expect(within(dialog).getByRole("button", { name: "关联到 Core" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "确认取消关联" })).not.toBeInTheDocument();
    expect(refreshSpy).not.toHaveBeenCalled();
  });

  it("renders the Lumina-like blacklist layout and keeps the original save payload", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ ok: true })));

    vi.stubGlobal("fetch", fetchMock);

    renderWithProviders(<AdminSettingsPanel initialSettings={buildInitialSettings()} />);

    await user.click(screen.getByRole("tab", { name: "黑名单" }));

    const blacklistPanel = screen.getByRole("tabpanel");

    expect(within(blacklistPanel).getAllByText("黑名单").length).toBeGreaterThan(0);
    expect(within(blacklistPanel).getByText("配置关键词黑名单过滤规则")).toBeInTheDocument();
    expect(within(blacklistPanel).queryByText("规则黑名单")).not.toBeInTheDocument();
    expect(within(blacklistPanel).queryByText("已生效")).not.toBeInTheDocument();

    const editorRegion = screen.getByRole("region", { name: "黑名单关键词编辑区" });
    const textarea = within(editorRegion).getByLabelText("关键词列表");

    expect(textarea).toHaveValue("layoffs");
    expect(textarea).toHaveAttribute("placeholder", "每行一个黑名单关键词");
    expect(within(editorRegion).getByText("?")).toBeInTheDocument();

    await user.clear(textarea);
    await user.type(textarea, " layoffs \n\n funding ");
    await user.click(screen.getByRole("button", { name: "保存配置" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/admin/settings/blacklist", {
        method: "PUT",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          keywords: ["layoffs", "funding"],
        }),
      });
    });
  });

  it("renders task settings after sources and submits the existing schedule API payload", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          schedule: {
            ...buildInitialSettings().taskSchedule,
            enabled: false,
            cronExpression: "*/15 * * * *",
            sourceConcurrency: 4,
            fullTextFetchThreshold: 120,
          },
        }),
      ),
    );

    vi.stubGlobal("fetch", fetchMock);

    renderWithProviders(<AdminSettingsPanel initialSettings={buildInitialSettings()} />);

    const tabs = screen.getAllByRole("tab");
    expect(tabs.at(-1)).toHaveAccessibleName("任务配置");

    await user.click(screen.getByRole("tab", { name: "任务配置" }));

    const taskPanel = screen.getByRole("tabpanel");

    expect(within(taskPanel).getByText("任务配置")).toBeInTheDocument();
    expect(within(taskPanel).queryByText("默认抓取任务")).not.toBeInTheDocument();
    expect(within(taskPanel).queryByText("调度状态")).not.toBeInTheDocument();
    expect(within(taskPanel).queryByDisplayValue("调度器在线")).not.toBeInTheDocument();
    expect(within(taskPanel).queryByDisplayValue("已成功")).not.toBeInTheDocument();
    expect(within(taskPanel).getByLabelText("Cron 表达式")).toHaveValue("0 * * * *");
    expect(within(taskPanel).getByLabelText("源抓取并发")).toHaveValue(2);
    expect(within(taskPanel).getByLabelText("正文补抓阈值")).toHaveValue(80);

    await user.clear(within(taskPanel).getByLabelText("Cron 表达式"));
    await user.type(within(taskPanel).getByLabelText("Cron 表达式"), "*/15 * * * *");
    await user.clear(within(taskPanel).getByLabelText("源抓取并发"));
    await user.type(within(taskPanel).getByLabelText("源抓取并发"), "4");
    await user.clear(within(taskPanel).getByLabelText("正文补抓阈值"));
    await user.type(within(taskPanel).getByLabelText("正文补抓阈值"), "120");
    await user.click(within(taskPanel).getByLabelText("启用默认抓取任务"));
    await user.click(within(taskPanel).getByRole("button", { name: "保存配置" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/admin/monitor/schedule/ingestion-default", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          enabled: false,
          cronExpression: "*/15 * * * *",
          sourceConcurrency: 4,
          fullTextFetchThreshold: 120,
          perSourceItemLimit: 20,
          processingStartAt: null,
        }),
      });
    });
  });
});
