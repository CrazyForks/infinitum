import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

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

afterEach(() => {
  vi.restoreAllMocks();
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

    expect(screen.getByRole("heading", { name: "信息流" })).toBeInTheDocument();
    expect(screen.getByText("OpenAI Agent 发布")).toBeInTheDocument();
    expect(screen.getByText("中文标题")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "1月" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/feed?range=1m&sort=time_desc");
    });

    expect(await screen.findByText("一月内标题")).toBeInTheDocument();
  });

  it("supports custom date range and score-based sorting", async () => {
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

    await user.type(screen.getByLabelText("开始日期"), "2026-04-01");
    await user.type(screen.getByLabelText("结束日期"), "2026-04-10");
    await user.selectOptions(screen.getByLabelText("排序方式"), "score_desc");
    await user.click(screen.getByRole("button", { name: "应用时间范围" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/feed?range=7d&sort=score_desc&start=2026-04-01&end=2026-04-10");
    });

    expect(await screen.findByText("评分最高内容")).toBeInTheDocument();
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
      expect(fetchMock).toHaveBeenCalledWith("/api/feed/clusters/cluster-1?range=7d&sort=time_desc");
    });

    expect(await screen.findByText("详细标题")).toBeInTheDocument();
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

      if (url === "/api/feed?range=7d&sort=time_desc") {
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
    expect(fetchMock).toHaveBeenCalledWith("/api/feed?range=7d&sort=time_desc");
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

  it("shows admin actions and updates a single item after regenerating the summary", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input.url;

      if (url === "/api/admin/items/item-1/regenerate") {
        expect(init?.method).toBe("POST");

        return new Response(
          JSON.stringify({
            item: {
              ...initialEntries[1],
              summary: "重生成后的摘要",
            },
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

    expect(await screen.findByText("重生成后的摘要")).toBeInTheDocument();
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

    await user.selectOptions(screen.getByLabelText("分组"), "group-1");
    await user.selectOptions(screen.getByLabelText("信息源"), "source-2");

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/feed?range=7d&sort=score_desc&start=2026-04-01&end=2026-04-10&groupId=group-1&sourceId=source-2",
      );
    });
  });
});
