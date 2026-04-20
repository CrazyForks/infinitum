import type { ReactNode } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ToastProvider } from "@/components/ui/toast";
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

import { ContentReviewPanel } from "@/components/admin/content-review-panel";

function renderWithProviders(node: ReactNode) {
  return render(<ToastProvider>{node}</ToastProvider>);
}

async function waitForLoaded() {
  await waitFor(() => {
    expect(screen.queryByText("加载中...")).not.toBeInTheDocument();
  });
}

async function confirmAction(user: ReturnType<typeof userEvent.setup>, buttonLabel: string) {
  await user.click(screen.getByRole("button", { name: buttonLabel }));
}

function createFilteredItem(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "item-1",
    title: "营销内容",
    originalUrl: "https://example.com/1",
    publishedAt: "2026-04-10T09:00:00.000Z",
    sourceName: "Example Feed",
    author: "Alex",
    summary: "摘要",
    moderationStatus: "filtered",
    moderationReason: "marketing",
    moderationDetail: "营销措辞明显",
    qualityScore: 18,
    qualityRationale: "低质量",
    topicLabel: "AI Marketing",
    canRegenerateTranslation: true,
    ...overrides,
  };
}

function createClusterItem(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "item-1",
    title: "条目 A",
    originalUrl: "https://example.com/a",
    publishedAt: "2026-04-10T09:00:00.000Z",
    sourceName: "Example Feed",
    author: "Alex",
    summary: "条目摘要",
    moderationStatus: "published",
    moderationReason: null,
    moderationDetail: null,
    qualityScore: 80,
    qualityRationale: "高质量",
    topicLabel: "融资",
    canRegenerateTranslation: false,
    ...overrides,
  };
}

function createCluster(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "cluster-1",
    title: "AI 融资动态",
    summary: "聚合摘要",
    status: "active",
    score: 92,
    itemCount: 1,
    latestPublishedAt: "2026-04-10T09:00:00.000Z",
    items: [createClusterItem()],
    ...overrides,
  };
}

afterEach(() => {
  pushMock.mockReset();
  refreshMock.mockReset();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("ContentReviewPanel", () => {
  it("loads filtered items and restores one item", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input.url;

      if (url === "/api/admin/items?moderationStatus=filtered") {
        return new Response(
          JSON.stringify({
            items: [createFilteredItem()],
          }),
        );
      }

      if (url === "/api/admin/clusters") {
        return new Response(
          JSON.stringify({
            clusters: [],
          }),
        );
      }

      if (url === "/api/admin/items/item-1/restore") {
        expect(init?.method).toBe("POST");

        return new Response(
          JSON.stringify({
            item: {
              id: "item-1",
              moderationStatus: "restored",
            },
          }),
        );
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    renderWithProviders(<ContentReviewPanel />);
    await waitForLoaded();

    expect(screen.getByRole("heading", { name: "过滤内容" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "主导航" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "内容审核" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("审核关键词")).toBeInTheDocument();
    expect(screen.getByLabelText("审核来源")).toBeInTheDocument();
    expect(screen.getByLabelText("过滤原因")).toBeInTheDocument();
    const filteredTable = screen.getByRole("table");
    expect(within(filteredTable).getByRole("button", { name: /营销内容/ })).toBeInTheDocument();
    expect(within(filteredTable).getByText("Example Feed")).toBeInTheDocument();

    await user.click(screen.getByTitle("恢复内容"));
    expect(await screen.findByRole("dialog", { name: "确认恢复内容" })).toBeInTheDocument();
    await confirmAction(user, "恢复");

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/admin/items/item-1/restore", {
        method: "POST",
      });
    });

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent("内容已恢复。");
    });
  });

  it("filters the current review list by keyword", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input.url;

      if (url === "/api/admin/items?moderationStatus=filtered") {
        return new Response(JSON.stringify({ items: [createFilteredItem()] }));
      }

      if (url === "/api/admin/clusters") {
        return new Response(JSON.stringify({ clusters: [] }));
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    renderWithProviders(<ContentReviewPanel />);
    await waitForLoaded();

    expect(
      within(screen.getByRole("table")).getByRole("button", { name: /营销内容/ }),
    ).toBeInTheDocument();

    await user.type(screen.getByLabelText("审核关键词"), "不存在的关键词");

    await waitFor(() => {
      expect(screen.getByText("暂无匹配内容")).toBeInTheDocument();
    });
  });

  it("queues reanalyze as a background task", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input.url;

      if (url === "/api/admin/items?moderationStatus=filtered") {
        return new Response(
          JSON.stringify({
            items: [createFilteredItem()],
          }),
        );
      }

      if (url === "/api/admin/clusters") {
        return new Response(JSON.stringify({ clusters: [] }));
      }

      if (url === "/api/admin/items/item-1/reanalyze") {
        expect(init?.method).toBe("POST");

        return new Response(
          JSON.stringify({
            taskRun: {
              id: "task-1",
              kind: "item_reanalyze",
            },
          }),
          { status: 202 },
        );
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    renderWithProviders(<ContentReviewPanel />);
    await waitForLoaded();

    expect(
      within(screen.getByRole("table")).getByRole("button", { name: /营销内容/ }),
    ).toBeInTheDocument();

    await user.click(screen.getByTitle("重新 AI 判定"));
    expect(await screen.findByRole("dialog", { name: "确认重新 AI 判定" })).toBeInTheDocument();
    await confirmAction(user, "重新判定");

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/admin/items/item-1/reanalyze", {
        method: "POST",
      });
    });

    expect(screen.getByRole("status")).toHaveTextContent("已创建后台任务，正在处理中。");
    expect(
      within(screen.getByRole("table")).getByRole("button", { name: /营销内容/ }),
    ).toBeInTheDocument();
  });

  it("shows an error when reanalyze returns 202 without taskRun", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input.url;

      if (url === "/api/admin/items?moderationStatus=filtered") {
        return new Response(JSON.stringify({ items: [createFilteredItem()] }));
      }

      if (url === "/api/admin/clusters") {
        return new Response(JSON.stringify({ clusters: [] }));
      }

      if (url === "/api/admin/items/item-1/reanalyze") {
        expect(init?.method).toBe("POST");

        return new Response(JSON.stringify({}), { status: 202 });
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    renderWithProviders(<ContentReviewPanel />);
    await waitForLoaded();

    expect(
      within(screen.getByRole("table")).getByRole("button", { name: /营销内容/ }),
    ).toBeInTheDocument();

    await user.click(screen.getByTitle("重新 AI 判定"));
    expect(await screen.findByRole("dialog", { name: "确认重新 AI 判定" })).toBeInTheDocument();
    await confirmAction(user, "重新判定");

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("操作失败");
    });

    expect(screen.queryByText("已创建后台任务，正在处理中。")).not.toBeInTheDocument();
    expect(
      within(screen.getByRole("table")).getByRole("button", { name: /营销内容/ }),
    ).toBeInTheDocument();
  });

  it("updates cluster preview after detaching an item", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input.url;

      if (url === "/api/admin/items?moderationStatus=filtered") {
        return new Response(JSON.stringify({ items: [] }));
      }

      if (url === "/api/admin/clusters") {
        return new Response(
          JSON.stringify({
            clusters: [
              createCluster({
                itemCount: 2,
                items: [createClusterItem(), createClusterItem({ id: "item-2", title: "条目 B" })],
              }),
            ],
          }),
        );
      }

      if (url === "/api/admin/clusters/cluster-1/items/item-1/detach") {
        expect(init?.method).toBe("POST");

        return new Response(
          JSON.stringify({
            cluster: createCluster({ itemCount: 0, items: [] }),
          }),
        );
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    renderWithProviders(<ContentReviewPanel activeTab="clusters" />);
    await waitForLoaded();

    expect(screen.getByRole("heading", { name: "聚合管理" })).toBeInTheDocument();
    await user.click(screen.getByText("AI 融资动态"));
    const detailDialog = await screen.findByRole("dialog", { name: "聚合详情" });
    expect(within(detailDialog).getByText("条目 A")).toBeInTheDocument();

    await user.click(within(detailDialog).getAllByTitle("移出聚合")[0]);
    expect(await screen.findByRole("dialog", { name: "确认移出条目" })).toBeInTheDocument();
    await confirmAction(user, "移出");

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/admin/clusters/cluster-1/items/item-1/detach", {
        method: "POST",
      });
    });

    await waitFor(() => {
      expect(screen.queryByText("条目 A")).not.toBeInTheDocument();
    });

    expect(screen.getByText("包含内容 (0)")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("已移出聚合组。");
  });

  it("shows an error when detaching an item returns 200 without cluster", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input.url;

      if (url === "/api/admin/items?moderationStatus=filtered") {
        return new Response(JSON.stringify({ items: [] }));
      }

      if (url === "/api/admin/clusters") {
        return new Response(
          JSON.stringify({
            clusters: [
              createCluster({
                itemCount: 2,
                items: [createClusterItem(), createClusterItem({ id: "item-2", title: "条目 B" })],
              }),
            ],
          }),
        );
      }

      if (url === "/api/admin/clusters/cluster-1/items/item-1/detach") {
        expect(init?.method).toBe("POST");
        return new Response(JSON.stringify({}), { status: 200 });
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    renderWithProviders(<ContentReviewPanel activeTab="clusters" />);
    await waitForLoaded();

    await user.click(screen.getByText("AI 融资动态"));
    const detailDialog = await screen.findByRole("dialog", { name: "聚合详情" });
    expect(within(detailDialog).getByText("条目 A")).toBeInTheDocument();

    await user.click(within(detailDialog).getAllByTitle("移出聚合")[0]);
    expect(await screen.findByRole("dialog", { name: "确认移出条目" })).toBeInTheDocument();
    await confirmAction(user, "移出");

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("操作失败");
    });

    expect(screen.queryByText("已移出聚合组。")).not.toBeInTheDocument();
    expect(screen.getByText("条目 A")).toBeInTheDocument();
  });

  it("shows an error when regenerating a summary returns 202 without taskRun", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input.url;

      if (url === "/api/admin/items?moderationStatus=filtered") {
        return new Response(JSON.stringify({ items: [] }));
      }

      if (url === "/api/admin/clusters") {
        return new Response(
          JSON.stringify({
            clusters: [
              createCluster({
                itemCount: 2,
                items: [createClusterItem(), createClusterItem({ id: "item-2", title: "条目 B" })],
              }),
            ],
          }),
        );
      }

      if (url === "/api/admin/clusters/cluster-1/regenerate-summary") {
        expect(init?.method).toBe("POST");
        return new Response(JSON.stringify({}), { status: 202 });
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    renderWithProviders(<ContentReviewPanel activeTab="clusters" />);
    await waitForLoaded();

    expect(within(screen.getByRole("table")).getByText("AI 融资动态")).toBeInTheDocument();

    await user.click(screen.getByTitle("重新生成摘要"));
    expect(await screen.findByRole("dialog", { name: "确认重新生成摘要" })).toBeInTheDocument();
    await confirmAction(user, "重新生成");

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("操作失败");
    });

    expect(screen.queryByText("已创建后台任务，正在处理中。")).not.toBeInTheDocument();
    expect(within(screen.getByRole("table")).getByText("AI 融资动态")).toBeInTheDocument();
  });

  it.each([
    {
      buttonLabel: "隐藏聚合组",
      cluster: createCluster({
        itemCount: 2,
        items: [createClusterItem(), createClusterItem({ id: "item-2", title: "条目 B" })],
      }),
      requestUrl: "/api/admin/clusters/cluster-1/hide",
    },
    {
      buttonLabel: "恢复聚合组",
      cluster: createCluster({
        status: "hidden",
        itemCount: 2,
        items: [createClusterItem(), createClusterItem({ id: "item-2", title: "条目 B" })],
      }),
      requestUrl: "/api/admin/clusters/cluster-1/restore",
    },
  ])("shows an error when $buttonLabel returns 200 without cluster", async ({ buttonLabel, cluster, requestUrl }) => {
    const user = userEvent.setup();
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input.url;

      if (url === "/api/admin/items?moderationStatus=filtered") {
        return new Response(JSON.stringify({ items: [] }));
      }

      if (url === "/api/admin/clusters") {
        return new Response(JSON.stringify({ clusters: [cluster] }));
      }

      if (url === requestUrl) {
        expect(init?.method).toBe("POST");
        return new Response(JSON.stringify({}), { status: 200 });
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    renderWithProviders(<ContentReviewPanel activeTab="clusters" />);
    await waitForLoaded();

    expect(within(screen.getByRole("table")).getByText("AI 融资动态")).toBeInTheDocument();

    await user.click(screen.getByTitle(buttonLabel === "隐藏聚合组" ? "隐藏聚合" : "恢复显示"));
    expect(
      await screen.findByRole("dialog", {
        name: buttonLabel === "隐藏聚合组" ? "确认隐藏聚合" : "确认恢复聚合",
      }),
    ).toBeInTheDocument();
    await confirmAction(user, buttonLabel === "隐藏聚合组" ? "隐藏" : "恢复");

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("操作失败");
    });

    expect(screen.queryByText(buttonLabel === "隐藏聚合组" ? "聚合组已隐藏。" : "聚合组已恢复。")).not.toBeInTheDocument();
    expect(within(screen.getByRole("table")).getByText("AI 融资动态")).toBeInTheDocument();
  });

  it.each([
    {
      name: "filtered request returns a non-2xx response",
      failingUrl: "/api/admin/items?moderationStatus=filtered",
      okUrl: "/api/admin/clusters",
      okBody: { clusters: [] },
    },
    {
      name: "cluster request returns a non-2xx response",
      failingUrl: "/api/admin/clusters",
      okUrl: "/api/admin/items?moderationStatus=filtered",
      okBody: { items: [] },
    },
  ])("shows a load failure when $name", async ({ failingUrl, okUrl, okBody }) => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input.url;

      if (url === failingUrl) {
        return new Response(JSON.stringify({}), { status: 500 });
      }

      if (url === okUrl) {
        return new Response(JSON.stringify(okBody));
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    renderWithProviders(<ContentReviewPanel />);

    expect(await screen.findByRole("alert")).toHaveTextContent("审核数据加载失败。");
  });
});
