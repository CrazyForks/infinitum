import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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

import { FeedPanel } from "@/components/feed/feed-panel";
import type { FeedEntryDTO, FeedRange, FeedSort } from "@/lib/feed/types";

const initialEntries: FeedEntryDTO[] = [
  {
    id: "cluster-1",
    type: "cluster",
    title: "OpenAI Agent 发布",
    summary: "聚合摘要内容",
    publishedAt: "2026-04-10T09:00:00.000Z",
    latestPublishedAt: "2026-04-10T09:00:00.000Z",
    score: 90,
    sourceCount: 2,
    itemCount: 2,
    itemsPreview: [
      {
        id: "item-preview-1",
        title: "预览标题",
        originalUrl: "https://example.com/preview",
        publishedAt: "2026-04-10T09:00:00.000Z",
        sourceName: "Example Feed",
        author: "Alex",
        summary: "预览摘要",
        score: 88,
        canRegenerateTranslation: true,
      },
    ],
    hasMoreItems: true,
  },
  {
    id: "item-1",
    type: "single",
    title: "中文标题",
    originalUrl: "https://example.com/posts/1",
    publishedAt: "2026-04-09T09:00:00.000Z",
    latestPublishedAt: "2026-04-09T09:00:00.000Z",
    sourceName: "Example Feed",
    author: "Alex",
    summary: "摘要内容",
    score: 72,
    sourceCount: 1,
    itemCount: 1,
    canRegenerateTranslation: true,
  },
];

function getSelectRoot(name: string) {
  return screen.getByRole("combobox", { name }).closest(".select-modern-antd");
}

async function selectFilterOption(user: ReturnType<typeof userEvent.setup>, name: string, optionText: string) {
  const combobox = screen.getByRole("combobox", { name });
  if (combobox instanceof HTMLSelectElement) {
    const option = within(combobox).getByRole("option", { name: optionText });
    await user.selectOptions(combobox, option);
    return;
  }

  const control = (combobox.closest(".ant-select")?.querySelector(".ant-select-selector") as HTMLElement | null) ?? combobox;
  fireEvent.mouseDown(control);
  await user.click(await screen.findByRole("option", { name: optionText }));
}

afterEach(() => {
  pushMock.mockReset();
  refreshMock.mockReset();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("FeedPanel", () => {
  it("formats published timestamps with an explicit timezone to avoid hydration mismatch", () => {
    function MockDateTimeFormat(locale?: string | string[], options?: Intl.DateTimeFormatOptions) {
      return {
        format: () => "2026/04/10 17:00",
        resolvedOptions: () => ({
          locale: Array.isArray(locale) ? locale[0] ?? "zh-CN" : locale ?? "zh-CN",
          calendar: "gregory",
          numberingSystem: "latn",
          timeZone: options?.timeZone ?? "UTC",
        }),
      } as Intl.DateTimeFormat;
    }

    const dateTimeFormatSpy = vi.spyOn(Intl, "DateTimeFormat").mockImplementation(MockDateTimeFormat as typeof Intl.DateTimeFormat);

    render(
      <FeedPanel
        initialItems={initialEntries}
        initialRange="7d"
        initialSort="time_desc"
        initialStartDate={null}
        initialEndDate={null}
        initialNextCursor={null}
        initialStatus={null}
        isAdmin={false}
      />,
    );

    expect(dateTimeFormatSpy).toHaveBeenCalledWith(
      "zh-CN",
      expect.objectContaining({
        timeZone: "Asia/Shanghai",
      }),
    );
  });

  it("renders the mixed feed and refetches when the range changes", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            items: [
              {
                ...initialEntries[1],
                id: "item-2",
                title: "一月内标题",
              },
            ],
            nextCursor: null,
            range: "1m" satisfies FeedRange,
            sort: "time_desc" satisfies FeedSort,
            start: null,
            end: null,
          }),
        ),
      );

    vi.stubGlobal("fetch", fetchMock);

    render(
      <FeedPanel
        initialItems={initialEntries}
        initialRange="7d"
        initialSort="time_desc"
        initialStartDate={null}
        initialEndDate={null}
        initialNextCursor={null}
        initialStatus={null}
        isAdmin={false}
      />,
    );

    expect(screen.getByRole("navigation", { name: "主导航" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "信息流" })).not.toBeInTheDocument();
    const filterRegion = screen.getByRole("region", { name: "信息流筛选" });
    const overviewRegion = screen.getByRole("region", { name: "信息流结果" });

    expect(filterRegion).toBeInTheDocument();
    expect(within(filterRegion).queryByText("筛选与状态")).not.toBeInTheDocument();
    expect(within(filterRegion).queryByText("时间范围、排序、来源和抓取状态都压在同一块工具区里。")).not.toBeInTheDocument();
    expect(getSelectRoot("创建时间")).toHaveTextContent("7天");
    expect(within(filterRegion).getByRole("button", { name: "高级筛选" })).toHaveAttribute("aria-expanded", "false");
    expect(within(filterRegion).queryByLabelText("标题模糊搜索")).not.toBeInTheDocument();
    expect(within(filterRegion).getByText("创建时间：7天")).toBeInTheDocument();
    expect(within(filterRegion).getByText("排序：按时间倒序")).toBeInTheDocument();
    expect(within(filterRegion).getByText("最近抓取：尚未执行")).toBeInTheDocument();
    expect(within(filterRegion).getByRole("button", { name: "清除筛选" })).toBeInTheDocument();
    expect(screen.getByText("高质量 90")).toBeInTheDocument();
    expect(screen.getAllByText("Example Feed").length).toBeGreaterThan(0);
    expect(screen.queryByRole("heading", { name: "信息流控制台" })).not.toBeInTheDocument();
    expect(within(overviewRegion).getByText("OpenAI Agent 发布")).toBeInTheDocument();
    expect(within(overviewRegion).getByText("中文标题")).toBeInTheDocument();
    expect(within(overviewRegion).getByText("聚合摘要内容")).toBeInTheDocument();
    expect(within(overviewRegion).getByText("摘要内容")).toBeInTheDocument();
    expect(within(overviewRegion).queryByText("1 条目")).not.toBeInTheDocument();
    expect(within(overviewRegion).queryByText("1 个来源")).not.toBeInTheDocument();

    await selectFilterOption(user, "创建时间", "1月");

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/feed?range=1m&sort=time_desc&tzOffsetMinutes=-480");
    });

    expect(await screen.findByText("一月内标题")).toBeInTheDocument();
  });

  it("supports advanced filters with automatic refresh and title search", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async () =>
      new Response(
        JSON.stringify({
          items: [
            {
              ...initialEntries[1],
              id: "item-score-top",
              title: "评分最高内容",
              score: 99,
            },
          ],
          nextCursor: null,
          range: "7d" satisfies FeedRange,
          sort: "score_desc" satisfies FeedSort,
          start: "2026-04-01",
          end: "2026-04-10",
        }),
      ),
    );

    vi.stubGlobal("fetch", fetchMock);

    render(
      <FeedPanel
        initialItems={initialEntries}
        initialRange="7d"
        initialSort="time_desc"
        initialStartDate={null}
        initialEndDate={null}
        initialNextCursor={null}
        initialStatus={null}
        isAdmin={false}
      />,
    );

    await user.click(screen.getByRole("button", { name: "高级筛选" }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "高级筛选" })).toHaveAttribute("aria-expanded", "true");
    });

    expect(screen.getAllByText("创建时间").length).toBeGreaterThan(0);
    expect(screen.getByPlaceholderText("开始日期")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("结束日期")).toBeInTheDocument();

    await user.type(screen.getByLabelText("标题模糊搜索"), "Agent");
    await selectFilterOption(user, "排序方式", "按评分倒序");

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/feed?range=7d&sort=score_desc&title=Agent&tzOffsetMinutes=-480");
    });

    expect(await screen.findByText("评分最高内容")).toBeInTheDocument();
    expect(screen.getByText("标题：Agent")).toBeInTheDocument();
    expect(screen.getByText("排序：按评分倒序")).toBeInTheDocument();
  });

  it("renders the latest ingestion result inside the filter summary area", () => {
    render(
      <FeedPanel
        initialItems={initialEntries}
        initialRange="7d"
        initialSort="time_desc"
        initialStartDate={null}
        initialEndDate={null}
        initialNextCursor={null}
        initialStatus={{
          id: "run-summary-1",
          status: "partial",
          triggerType: "manual",
          startedAt: "2026-04-10T10:00:00.000Z",
          finishedAt: "2026-04-10T10:06:00.000Z",
          sourceCount: 3,
          itemCount: 6,
          successCount: 4,
          failureCount: 2,
          errorSummary: "2 个源抓取失败",
        }}
        isAdmin={false}
      />,
    );

    const filterRegion = screen.getByRole("region", { name: "信息流筛选" });

    expect(within(filterRegion).getByText(/最近抓取：部分成功 · 6\/6 · 2026\/04\/10 18:06/)).toBeInTheDocument();
    expect(within(filterRegion).getByText("抓取说明：2 个源抓取失败")).toBeInTheDocument();
  });

  it("keeps the latest ingestion summary next to the refresh button for admins", () => {
    render(
      <FeedPanel
        initialItems={initialEntries}
        initialRange="7d"
        initialSort="time_desc"
        initialStartDate={null}
        initialEndDate={null}
        initialNextCursor={null}
        initialStatus={{
          id: "run-summary-inline-1",
          status: "succeeded",
          triggerType: "manual",
          startedAt: "2026-04-18T00:40:00.000Z",
          finishedAt: "2026-04-18T00:58:00.000Z",
          sourceCount: 50,
          itemCount: 50,
          successCount: 50,
          failureCount: 0,
          errorSummary: null,
        }}
        isAdmin
      />,
    );

    const refreshButton = screen.getByRole("button", { name: "立即刷新" });
    const inlineControls = refreshButton.parentElement;

    expect(inlineControls).not.toBeNull();
    expect(inlineControls).toHaveTextContent("最近抓取：已成功 · 50/50 · 2026/04/18 08:58");
  });

  it("keeps Lumina-like typography on the homepage filter controls and cards", () => {
    render(
      <FeedPanel
        initialItems={initialEntries}
        initialRange="7d"
        initialSort="time_desc"
        initialStartDate={null}
        initialEndDate={null}
        initialNextCursor={null}
        initialStatus={null}
        isAdmin={false}
      />,
    );

    const advancedToggle = screen.getByRole("button", { name: "高级筛选" });
    const refreshButton = screen.queryByRole("button", { name: "立即刷新" });
    const rangeSelect = getSelectRoot("创建时间");
    const sortSelect = getSelectRoot("排序方式");
    const clearButton = screen.getByRole("button", { name: "清除筛选" });
    const title = screen.getByRole("heading", { name: "OpenAI Agent 发布" });

    expect(advancedToggle.className).toContain("text-sm");
    expect(advancedToggle.className).toContain("px-4");
    expect(advancedToggle.className).toContain("py-1");
    expect(refreshButton).toBeNull();
    expect(rangeSelect?.className).toContain("select-modern-antd");
    expect(rangeSelect?.className).toContain("h-9");
    expect(sortSelect?.className).toContain("select-modern-antd");
    expect(sortSelect?.className).toContain("h-9");
    expect(clearButton.className).toContain("ml-auto");
    expect(clearButton.className).toContain("px-3");
    expect(clearButton.className).toContain("py-1");
    expect(title.className).toContain("text-xl");
  });

  it("matches Lumina button color states for advanced filters and clear filters", async () => {
    const user = userEvent.setup();

    render(
      <FeedPanel
        initialItems={initialEntries}
        initialRange="7d"
        initialSort="time_desc"
        initialStartDate={null}
        initialEndDate={null}
        initialNextCursor={null}
        initialStatus={null}
        isAdmin={false}
      />,
    );

    const advancedToggle = screen.getByRole("button", { name: "高级筛选" });
    const clearButton = screen.getByRole("button", { name: "清除筛选" });

    expect(advancedToggle.className).toContain("lumina-home-action-button");
    expect(clearButton.className).toContain("lumina-home-action-button");
    expect(advancedToggle.className).toContain("bg-[var(--bg-muted)]");
    expect(advancedToggle.className).toContain("text-[var(--text-2)]");
    expect(advancedToggle.className).toContain("hover:bg-[var(--surface)]");

    expect(clearButton.className).toContain("bg-[var(--surface)]");
    expect(clearButton.className).toContain("text-[var(--text-2)]");
    expect(clearButton.className).toContain("hover:bg-[var(--bg-muted)]");
    expect(clearButton.className).toContain("hover:text-[var(--text-1)]");

    await user.click(advancedToggle);

    expect(advancedToggle.className).toContain("bg-[var(--accent-soft)]");
    expect(advancedToggle.className).toContain("text-[var(--accent-strong)]");
  });

  it("keeps the clear filters button enabled when the summary shows non-default filter chips", () => {
    render(
      <FeedPanel
        initialItems={initialEntries}
        initialRange="7d"
        initialSort="time_desc"
        initialStartDate={null}
        initialEndDate={null}
        initialNextCursor={null}
        initialStatus={null}
        isAdmin={false}
      />,
    );

    const clearButton = screen.getByRole("button", { name: "清除筛选" });

    expect(screen.getByText("创建时间：7天")).toBeInTheDocument();
    expect(screen.getByText("排序：按时间倒序")).toBeInTheDocument();
    expect(clearButton).toBeEnabled();
    expect(clearButton.className).toContain("lumina-home-action-button--clear");
  });

  it("uses the same search and refresh icons as Lumina for the filter action buttons", () => {
    render(
      <FeedPanel
        initialItems={initialEntries}
        initialRange="7d"
        initialSort="time_desc"
        initialStartDate={null}
        initialEndDate={null}
        initialNextCursor={null}
        initialStatus={null}
        isAdmin
      />,
    );

    const advancedToggle = screen.getByRole("button", { name: "高级筛选" });
    const refreshButton = screen.getByRole("button", { name: "立即刷新" });
    const advancedIcon = advancedToggle.querySelector("svg");
    const refreshIcon = refreshButton.querySelector("svg");

    expect(advancedIcon?.getAttribute("viewBox")).toBe("0 0 24 24");
    expect(advancedIcon?.innerHTML).toContain('circle cx="11" cy="11" r="7"');
    expect(advancedIcon?.innerHTML).toContain('path d="m21 21-4.3-4.3"');

    expect(refreshIcon?.getAttribute("viewBox")).toBe("0 0 24 24");
    expect(refreshIcon?.innerHTML).toContain('path d="M21 12a9 9 0 0 1-9 9 9 9 0 0 1-7.5-4"');
    expect(refreshIcon?.innerHTML).toContain('path d="M3 12a9 9 0 0 1 9-9 9 9 0 0 1 7.5 4"');
    expect(refreshIcon?.innerHTML).toContain('path d="M3 5v4h4"');
    expect(refreshIcon?.innerHTML).toContain('path d="M21 19v-4h-4"');
  });

  it("keeps the admin refresh button as a white-on-primary Lumina-style action", () => {
    render(
      <FeedPanel
        initialItems={initialEntries}
        initialRange="7d"
        initialSort="time_desc"
        initialStartDate={null}
        initialEndDate={null}
        initialNextCursor={null}
        initialStatus={null}
        isAdmin
      />,
    );

    const refreshButton = screen.getByRole("button", { name: "立即刷新" });

    expect(refreshButton.className).toContain("lumina-home-action-button");
    expect(refreshButton.className).toContain("lumina-home-action-button--primary");
    expect(refreshButton.className).toContain("bg-[var(--accent)]");
    expect(refreshButton.className).toContain("text-white");
    expect(refreshButton.className).toContain("font-medium");
  });

  it("uses transplanted Lumina filter components on the homepage", () => {
    const { container } = render(
      <FeedPanel
        initialItems={initialEntries}
        initialRange="7d"
        initialSort="time_desc"
        initialStartDate={null}
        initialEndDate={null}
        initialNextCursor={null}
        initialStatus={null}
        isAdmin={false}
      />,
    );

    expect(container.querySelector(".panel-raised")).not.toBeNull();
    expect(container.querySelector(".select-modern-antd")).not.toBeNull();
    expect(container.querySelector(".filter-chip")).not.toBeNull();
  });

  it("loads cluster items on demand when expanded", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async () =>
      new Response(
        JSON.stringify({
          items: [
            {
              id: "item-detail-1",
              title: "详细标题",
              originalUrl: "https://example.com/detail",
              publishedAt: "2026-04-10T09:00:00.000Z",
              sourceName: "Another Feed",
              author: "Jamie",
              summary: "详细摘要",
              score: 84,
              canRegenerateTranslation: true,
            },
          ],
        }),
      ),
    );

    vi.stubGlobal("fetch", fetchMock);

    render(
      <FeedPanel
        initialItems={initialEntries}
        initialRange="7d"
        initialSort="time_desc"
        initialStartDate={null}
        initialEndDate={null}
        initialNextCursor={null}
        initialStatus={null}
        isAdmin={false}
      />,
    );

    await user.click(screen.getByRole("button", { name: "展开相关内容" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/feed/clusters/cluster-1?range=7d&sort=time_desc&tzOffsetMinutes=-480");
    });

    expect(await screen.findByText("详细标题")).toBeInTheDocument();
    expect(screen.getByText("详细摘要")).toBeInTheDocument();
  });

  it("renders an admin-specific empty state hint", () => {
    render(
      <FeedPanel
        initialItems={[]}
        initialRange="7d"
        initialSort="time_desc"
        initialStartDate={null}
        initialEndDate={null}
        initialNextCursor={null}
        initialStatus={null}
        isAdmin
      />,
    );

    expect(screen.getByText("当前时间范围内还没有可展示内容，可以先点击“立即刷新”拉取数据。")).toBeInTheDocument();
  });

  it("renders a neutral empty state for non-admin visitors", () => {
    render(
      <FeedPanel
        initialItems={[]}
        initialRange="7d"
        initialSort="time_desc"
        initialStartDate={null}
        initialEndDate={null}
        initialNextCursor={null}
        initialStatus={null}
        isAdmin={false}
      />,
    );

    expect(screen.getByText("当前时间范围内还没有可展示内容，请稍后再回来看看。")).toBeInTheDocument();
    expect(screen.queryByText("当前时间范围内还没有可展示内容，可以先点击“立即刷新”拉取数据。")).not.toBeInTheDocument();
  });

  it("polls ingestion status for an active run and reloads the current range when the run completes", async () => {
    vi.useFakeTimers();

    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input.url;

      if (url === "/api/ingest/status") {
        return new Response(
          JSON.stringify({
            run: {
              id: "run-1",
              status: "succeeded",
              triggerType: "manual",
              startedAt: "2026-04-10T10:00:00.000Z",
              finishedAt: "2026-04-10T10:01:00.000Z",
              sourceCount: 1,
              itemCount: 2,
              successCount: 2,
              failureCount: 0,
              errorSummary: null,
            },
          }),
        );
      }

      if (url === "/api/feed?range=7d&sort=time_desc&tzOffsetMinutes=-480") {
        return new Response(
          JSON.stringify({
            items: [
              {
                ...initialEntries[1],
                id: "item-2",
                title: "刷新后的标题",
              },
            ],
            nextCursor: null,
          }),
        );
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    render(
      <FeedPanel
        initialItems={initialEntries}
        initialRange="7d"
        initialSort="time_desc"
        initialStartDate={null}
        initialEndDate={null}
        initialNextCursor={null}
        initialStatus={{
          id: "run-1",
          status: "running",
          triggerType: "manual",
          startedAt: "2026-04-10T10:00:00.000Z",
          finishedAt: null,
          sourceCount: 1,
          itemCount: 2,
          successCount: 0,
          failureCount: 0,
          errorSummary: null,
        }}
        isAdmin={false}
      />,
    );

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(fetchMock).toHaveBeenCalledWith("/api/ingest/status");
    expect(fetchMock).toHaveBeenCalledWith("/api/feed?range=7d&sort=time_desc&tzOffsetMinutes=-480");
    expect(screen.getByText("刷新后的标题")).toBeInTheDocument();
  });

  it("queues ingestion from the admin refresh button", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          taskRun: {
            id: "task-1",
            kind: "ingestion",
            status: "queued",
            triggerType: "manual",
            label: "默认抓取任务",
            entityId: null,
            progressCurrent: 0,
            progressTotal: 0,
            progressLabel: null,
            startedAt: null,
            finishedAt: null,
            errorSummary: null,
          },
        }),
      ),
    );

    vi.stubGlobal("fetch", fetchMock);

    render(
      <FeedPanel
        initialItems={initialEntries}
        initialRange="7d"
        initialSort="time_desc"
        initialStartDate={null}
        initialEndDate={null}
        initialNextCursor={null}
        initialStatus={null}
        isAdmin
      />,
    );

    await user.click(screen.getByRole("button", { name: "立即刷新" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/ingest/run", { method: "POST" });
    });

    expect(screen.getByText("抓取任务已进入队列，等待后台执行。")).toBeInTheDocument();
    expect(screen.getByText("抓取任务已进入队列，等待后台执行。").closest('[role="status"]')).not.toBeNull();
  });

  it("renders refresh API errors as alerts", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: "Unauthorized",
        }),
        { status: 401 },
      ),
    );

    vi.stubGlobal("fetch", fetchMock);

    render(
      <FeedPanel
        initialItems={initialEntries}
        initialRange="7d"
        initialSort="time_desc"
        initialStartDate={null}
        initialEndDate={null}
        initialNextCursor={null}
        initialStatus={null}
        isAdmin
      />,
    );

    await user.click(screen.getByRole("button", { name: "立即刷新" }));

    expect(await screen.findByText("Unauthorized")).toBeInTheDocument();
    expect(screen.getByText("Unauthorized").closest('[role="alert"]')).not.toBeNull();
  });

  it("hides admin-only controls for anonymous visitors", () => {
    render(
      <FeedPanel
        initialItems={initialEntries}
        initialRange="7d"
        initialSort="time_desc"
        initialStartDate={null}
        initialEndDate={null}
        initialNextCursor={null}
        initialStatus={null}
        isAdmin={false}
      />,
    );

    expect(screen.queryByRole("button", { name: "立即刷新" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "重新生成摘要" })).not.toBeInTheDocument();
  });

  it("shows admin actions and queues a background task after regenerating the summary", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input.url;

      if (url === "/api/admin/items/item-1/regenerate") {
        expect(init?.method).toBe("POST");

        return new Response(
          JSON.stringify({
            taskRun: {
              id: "task-2",
            },
          }),
          { status: 202 },
        );
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    render(
      <FeedPanel
        initialItems={initialEntries}
        initialRange="7d"
        initialSort="time_desc"
        initialStartDate={null}
        initialEndDate={null}
        initialNextCursor={null}
        initialStatus={null}
        isAdmin={true}
      />,
    );

    expect(screen.getByRole("button", { name: "立即刷新" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "重新生成摘要" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "重新生成摘要" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/admin/items/item-1/regenerate", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ target: "summary" }),
      });
    });

    expect(await screen.findByText("已创建后台任务，正在处理中。")).toBeInTheDocument();
    expect(screen.getByText("已创建后台任务，正在处理中。").closest('[role="status"]')).not.toBeNull();
    expect(screen.getByText("摘要内容")).toBeInTheDocument();
  });

  it("renders regenerate API errors as alerts", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input.url;

      if (url === "/api/admin/items/item-1/regenerate") {
        return new Response(
          JSON.stringify({
            error: "An ingestion run is already in progress.",
          }),
          { status: 409 },
        );
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    render(
      <FeedPanel
        initialItems={initialEntries}
        initialRange="7d"
        initialSort="time_desc"
        initialStartDate={null}
        initialEndDate={null}
        initialNextCursor={null}
        initialStatus={null}
        isAdmin={true}
      />,
    );

    await user.click(screen.getByRole("button", { name: "重新生成摘要" }));

    expect(await screen.findByText("An ingestion run is already in progress.")).toBeInTheDocument();
    expect(screen.getByText("An ingestion run is already in progress.").closest('[role="alert"]')).not.toBeNull();
  });

  it("requests feed data with group and source filters while preserving the current range inputs", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async () =>
      new Response(
        JSON.stringify({
          items: initialEntries,
          nextCursor: null,
          range: "7d" satisfies FeedRange,
          sort: "score_desc" satisfies FeedSort,
          start: "2026-04-01",
          end: "2026-04-10",
          groupId: "group-1",
          sourceId: "source-2",
        }),
      ),
    );

    vi.stubGlobal("fetch", fetchMock);

    render(
      <FeedPanel
        initialItems={initialEntries}
        initialRange="7d"
        initialSort="score_desc"
        initialStartDate="2026-04-01"
        initialEndDate="2026-04-10"
        initialNextCursor={null}
        initialStatus={null}
        isAdmin={false}
        initialGroupId=""
        initialSourceId=""
        availableGroups={[
          { id: "group-1", name: "Core" },
          { id: "group-2", name: "Research" },
        ]}
        availableSources={[
          { id: "source-1", name: "Feed One", groupId: "group-1" },
          { id: "source-2", name: "Feed Two", groupId: "group-1" },
          { id: "source-3", name: "Feed Three", groupId: "group-2" },
        ]}
      />,
    );

    expect(screen.getByRole("button", { name: "高级筛选" })).toHaveAttribute("aria-expanded", "true");
    await selectFilterOption(user, "分组", "Core");
    await selectFilterOption(user, "信息源", "Feed Two");

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/feed?range=7d&sort=score_desc&start=2026-04-01&end=2026-04-10&groupId=group-1&sourceId=source-2&tzOffsetMinutes=-480",
      );
    });
  });

  it("clears active filters and reloads the default view", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementation(async () =>
        new Response(
          JSON.stringify({
            items: initialEntries,
            nextCursor: null,
            range: "today" satisfies FeedRange,
            sort: "time_desc" satisfies FeedSort,
            start: null,
            end: null,
            groupId: null,
            sourceId: null,
            title: null,
          }),
        ),
      );

    vi.stubGlobal("fetch", fetchMock);

    render(
      <FeedPanel
        initialItems={initialEntries}
        initialRange="7d"
        initialSort="score_desc"
        initialStartDate={null}
        initialEndDate={null}
        initialNextCursor={null}
        initialStatus={null}
        isAdmin={false}
        initialGroupId="group-1"
        initialSourceId="source-2"
        initialTitle="Agent"
        availableGroups={[{ id: "group-1", name: "Core" }]}
        availableSources={[{ id: "source-2", name: "Feed Two", groupId: "group-1" }]}
      />,
    );

    expect(screen.getByRole("button", { name: "高级筛选" })).toHaveAttribute("aria-expanded", "true");
    await user.click(screen.getByRole("button", { name: "清除筛选" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenLastCalledWith("/api/feed?range=today&sort=time_desc&tzOffsetMinutes=-480");
    });

    expect(getSelectRoot("创建时间")).toHaveTextContent("当天");
    expect(screen.getByText("创建时间：当天")).toBeInTheDocument();
    expect(screen.getByText("排序：按时间倒序")).toBeInTheDocument();
    expect(screen.queryByText("标题：Agent")).not.toBeInTheDocument();
  });
});
