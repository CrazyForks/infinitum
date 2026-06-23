import type { ReactNode } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TagSettingsPanel } from "@/components/admin/tag-settings-panel";
import { ToastProvider } from "@/components/ui/toast";

function renderWithProviders(node: ReactNode) {
  return render(<ToastProvider>{node}</ToastProvider>);
}

const tagListPayload = {
  tags: [
    {
      id: "tag-agent",
      name: "AI Agent",
      normalized: "ai agent",
      itemCount: 12,
      aliasCount: 1,
      aliases: [
        {
          id: "alias-agent-cn",
          aliasName: "智能体",
          aliasNormalized: "智能体",
          createdBy: "admin",
          createdAt: "2026-04-20T10:00:00.000Z",
        },
      ],
      createdAt: "2026-04-20T10:00:00.000Z",
      updatedAt: "2026-04-21T10:00:00.000Z",
    },
    {
      id: "tag-agents",
      name: "AI Agents",
      normalized: "ai agents",
      itemCount: 3,
      aliasCount: 0,
      aliases: [],
      createdAt: "2026-04-20T10:00:00.000Z",
      updatedAt: "2026-04-21T11:00:00.000Z",
    },
  ],
  totalCount: 2,
  page: 1,
  pageSize: 10,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("TagSettingsPanel", () => {
  it("loads tags with database pagination and shows management actions", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async () =>
      new Response(JSON.stringify(tagListPayload)),
    );
    vi.stubGlobal("fetch", fetchMock);

    renderWithProviders(<TagSettingsPanel />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/admin/settings/tags?page=1&pageSize=10", {
        method: "GET",
        headers: {
          "content-type": "application/json",
        },
        body: undefined,
      });
    });

    expect(screen.getByRole("heading", { name: "标签管理" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "清空筛选" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "刷新" })).toBeInTheDocument();
    expect(screen.getByText("AI Agent")).toBeInTheDocument();
    expect(screen.queryByText("ai agent")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "应用筛选" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "AI Agent" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "新增别名：AI Agent" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "合并标签：AI Agent" })).toBeInTheDocument();
  });

  it("opens tag detail from the tag name and action modals from operation icons", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async () =>
      new Response(JSON.stringify(tagListPayload)),
    );
    vi.stubGlobal("fetch", fetchMock);

    renderWithProviders(<TagSettingsPanel />);

    await screen.findByText("AI Agent");

    await user.click(screen.getByRole("button", { name: "AI Agent" }));
    const manageDialog = screen.getByRole("dialog", { name: "标签详情" });
    expect(within(manageDialog).getByText("基本信息")).toBeInTheDocument();
    expect(within(manageDialog).getByText("已有关联别名")).toBeInTheDocument();
    expect(within(manageDialog).getByText("智能体")).toBeInTheDocument();
    const footerButtons = within(manageDialog).getAllByRole("button").slice(-3).map((button) => button.textContent);
    expect(footerButtons).toEqual(["新增别名", "合并标签", "关闭"]);

    await user.click(within(manageDialog).getByRole("button", { name: "合并标签" }));
    const mergeDialog = screen.getByRole("dialog", { name: "合并标签" });
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/admin/settings/tags?page=1&pageSize=100", {
        method: "GET",
        headers: {
          "content-type": "application/json",
        },
        body: undefined,
      });
    });
    expect(within(mergeDialog).getByText("操作说明")).toBeInTheDocument();
    expect(within(mergeDialog).getByRole("button", { name: "确认合并 (0 个)" })).toBeDisabled();
    await user.click(within(mergeDialog).getByText("取消"));

    await user.click(within(manageDialog).getByRole("button", { name: "新增别名" }));
    const aliasAddDialog = screen.getByRole("dialog", { name: "新增别名" });
    expect(within(aliasAddDialog).getByRole("button", { name: "添加别名" })).toBeDisabled();
    await user.click(within(aliasAddDialog).getByText("取消"));
    await user.click(within(manageDialog).getByText("关闭"));

    await user.click(screen.getByRole("button", { name: "新增别名：AI Agent" }));
    expect(screen.getByRole("dialog", { name: "新增别名" })).toBeInTheDocument();
    await user.click(screen.getByText("取消"));

    await user.click(screen.getByRole("button", { name: "合并标签：AI Agent" }));
    expect(screen.getByRole("dialog", { name: "合并标签" })).toBeInTheDocument();
  });
});
