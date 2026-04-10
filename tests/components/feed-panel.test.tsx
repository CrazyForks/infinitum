import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FeedPanel } from "@/components/feed/feed-panel";
import type { FeedItemDTO, FeedRange } from "@/lib/feed/types";

const initialItems: FeedItemDTO[] = [
  {
    id: "item-1",
    title: "中文标题",
    originalUrl: "https://example.com/posts/1",
    publishedAt: "2026-04-10T09:00:00.000Z",
    sourceName: "Example Feed",
    author: "Alex",
    summary: "摘要内容",
  },
];

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("FeedPanel", () => {
  it("renders the initial feed and refetches when the range changes", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            items: [
              {
                ...initialItems[0],
                id: "item-2",
                title: "一月内标题",
              },
            ],
            nextCursor: null,
            range: "1m" satisfies FeedRange,
          }),
        ),
      );

    vi.stubGlobal("fetch", fetchMock);

    render(
      <FeedPanel
        initialItems={initialItems}
        initialRange="7d"
        initialNextCursor={null}
        initialStatus={null}
      />,
    );

    expect(screen.getByRole("heading", { name: "信息流" })).toBeInTheDocument();
    expect(screen.getByText("中文标题")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "1月" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/feed?range=1m");
    });

    expect(await screen.findByText("一月内标题")).toBeInTheDocument();
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

      if (url === "/api/feed?range=7d") {
        return new Response(
          JSON.stringify({
            items: [
              {
                ...initialItems[0],
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
        initialItems={initialItems}
        initialRange="7d"
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
      />,
    );

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(fetchMock).toHaveBeenCalledWith("/api/ingest/status");
    expect(fetchMock).toHaveBeenCalledWith("/api/feed?range=7d");
    expect(screen.getByText("刷新后的标题")).toBeInTheDocument();
  });
});
