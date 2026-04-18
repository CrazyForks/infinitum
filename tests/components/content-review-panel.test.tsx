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

import { ContentReviewPanel } from "@/components/admin/content-review-panel";

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

    render(<ContentReviewPanel />);

    expect(await screen.findByRole("heading", { name: "营销内容" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "主导航" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "内容审核" })).not.toBeInTheDocument();
    expect(screen.queryByText("处理过滤队列与聚合结果。")).not.toBeInTheDocument();
    expect(screen.queryByText("聚焦过滤队列与聚合结果，优先处理真正需要人工判断的内容。")).not.toBeInTheDocument();
    const toolbar = screen.getByRole("toolbar", { name: "审核工具条" });
    const filterRegion = screen.getByRole("region", { name: "审核筛选" });
    const filteredRegion = screen.getByRole("region", { name: "过滤内容列表" });
    const actionBar = screen.getByRole("button", { name: "恢复内容" }).parentElement;

    expect(within(toolbar).getByRole("tablist", { name: "内容审核视图" })).toBeInTheDocument();
    expect(within(filterRegion).getByLabelText("审核关键词")).toBeInTheDocument();
    expect(within(filterRegion).getByLabelText("审核来源")).toBeInTheDocument();
    expect(within(filterRegion).getByText("结果 1")).toBeInTheDocument();
    expect(within(filteredRegion).getByRole("heading", { name: "营销内容" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "查看原文：营销内容" })).toHaveAttribute("href", "https://example.com/1");
    expect(actionBar).toHaveClass("rounded-[0.95rem]", "border");
    expect(actionBar).not.toHaveClass("lg:w-[220px]");

    await user.click(screen.getByRole("button", { name: "恢复内容" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/admin/items/item-1/restore", {
        method: "POST",
      });
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

    render(<ContentReviewPanel />);

    expect(await screen.findByRole("heading", { name: "营销内容" })).toBeInTheDocument();

    await user.type(screen.getByLabelText("审核关键词"), "不存在的关键词");

    await waitFor(() => {
      expect(screen.getByText("当前筛选条件下没有匹配内容。")).toBeInTheDocument();
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

    render(<ContentReviewPanel />);

    expect(await screen.findByRole("heading", { name: "营销内容" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "重新 AI 判定" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/admin/items/item-1/reanalyze", {
        method: "POST",
      });
    });

    expect(screen.getByText("已创建后台任务，正在处理中。")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "营销内容" })).toBeInTheDocument();
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

    render(<ContentReviewPanel />);

    expect(await screen.findByRole("heading", { name: "营销内容" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "重新 AI 判定" }));

    await waitFor(() => {
      expect(screen.getByText("操作失败")).toBeInTheDocument();
    });

    expect(screen.queryByText("已创建后台任务，正在处理中。")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "营销内容" })).toBeInTheDocument();
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
            clusters: [createCluster()],
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

    render(<ContentReviewPanel />);

    await user.click(await screen.findByRole("tab", { name: "聚合管理" }));
    expect(await screen.findByText("条目 A")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "移出条目" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/admin/clusters/cluster-1/items/item-1/detach", {
        method: "POST",
      });
    });

    await waitFor(() => {
      expect(screen.queryByText("条目 A")).not.toBeInTheDocument();
    });

    expect(screen.getByText("0 条内容")).toBeInTheDocument();
  });

  it("shows an error when detaching an item returns 200 without cluster", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input.url;

      if (url === "/api/admin/items?moderationStatus=filtered") {
        return new Response(JSON.stringify({ items: [] }));
      }

      if (url === "/api/admin/clusters") {
        return new Response(JSON.stringify({ clusters: [createCluster()] }));
      }

      if (url === "/api/admin/clusters/cluster-1/items/item-1/detach") {
        expect(init?.method).toBe("POST");
        return new Response(JSON.stringify({}), { status: 200 });
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<ContentReviewPanel />);

    await user.click(await screen.findByRole("tab", { name: "聚合管理" }));
    expect(await screen.findByText("条目 A")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "移出条目" }));

    await waitFor(() => {
      expect(screen.getByText("操作失败")).toBeInTheDocument();
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
        return new Response(JSON.stringify({ clusters: [createCluster()] }));
      }

      if (url === "/api/admin/clusters/cluster-1/regenerate-summary") {
        expect(init?.method).toBe("POST");
        return new Response(JSON.stringify({}), { status: 202 });
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<ContentReviewPanel />);

    await user.click(await screen.findByRole("tab", { name: "聚合管理" }));

    await user.click(screen.getByRole("button", { name: "重新生成聚合摘要" }));

    await waitFor(() => {
      expect(screen.getByText("操作失败")).toBeInTheDocument();
    });

    expect(screen.queryByText("已创建后台任务，正在处理中。")).not.toBeInTheDocument();
    expect(screen.getByText("AI 融资动态")).toBeInTheDocument();
  });

  it.each([
    {
      buttonLabel: "隐藏聚合组",
      cluster: createCluster(),
      requestUrl: "/api/admin/clusters/cluster-1/hide",
    },
    {
      buttonLabel: "恢复聚合组",
      cluster: createCluster({ status: "hidden" }),
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

    render(<ContentReviewPanel />);

    await user.click(await screen.findByRole("tab", { name: "聚合管理" }));

    await user.click(screen.getByRole("button", { name: buttonLabel }));

    await waitFor(() => {
      expect(screen.getByText("操作失败")).toBeInTheDocument();
    });

    expect(screen.queryByText(buttonLabel === "隐藏聚合组" ? "聚合组已隐藏。" : "聚合组已恢复。")).not.toBeInTheDocument();
    expect(screen.getByText("AI 融资动态")).toBeInTheDocument();
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

    render(<ContentReviewPanel />);

    expect(await screen.findByText("审核数据加载失败。")).toBeInTheDocument();
  });
});
