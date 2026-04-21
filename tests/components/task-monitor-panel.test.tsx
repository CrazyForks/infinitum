import type { ReactNode } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TaskMonitorPanel } from "@/components/admin/task-monitor-panel";
import { ToastProvider } from "@/components/ui/toast";
import type { BackgroundTaskMonitorSnapshot } from "@/lib/tasks/types";

function renderWithProviders(node: ReactNode) {
  return render(<ToastProvider>{node}</ToastProvider>);
}

function buildMonitorSnapshot(): BackgroundTaskMonitorSnapshot {
  return {
    schedule: {
      key: "ingestion_default",
      enabled: true,
      cronExpression: "0 * * * *",
      sourceConcurrency: 2,
      fullTextFetchThreshold: 80,
      perSourceItemLimit: 20,
      timezone: "Asia/Shanghai",
      lastHeartbeatAt: null,
      lastRunStartedAt: null,
      lastRunFinishedAt: null,
      lastRunStatus: "running",
      nextRunAt: "2026-04-21T01:00:00.000Z",
      isHeartbeatStale: false,
    },
    runningTasks: [
      {
        id: "task-1",
        kind: "ingestion",
        triggerType: "manual",
        status: "running",
        label: "默认抓取任务",
        entityId: null,
        progressCurrent: 1,
        progressTotal: 10,
        progressLabel: "已处理 1/10 条内容，来自 1 个源，失败 0 项，正文补抓 2 篇",
        itemsAdded: 1,
        fullTextFetchedCount: 2,
        aiCallCountActual: 1,
        aiCallCountEstimated: 5,
        aiCallBreakdown: [
          {
            key: "item_analysis",
            label: "内容分析",
            actual: 1,
            estimated: 2,
          },
          {
            key: "cluster_match",
            label: "聚合匹配",
            actual: 0,
            estimated: 2,
          },
          {
            key: "cluster_summary",
            label: "聚合摘要",
            actual: 0,
            estimated: 1,
          },
        ],
        cancelRequestedAt: null,
        startedAt: "2026-04-21T00:00:00.000Z",
        finishedAt: null,
        errorSummary: null,
        stageTimings: [
          {
            key: "source_sync",
            label: "信息源同步",
            startedAt: "2026-04-21T00:00:00.000Z",
            finishedAt: "2026-04-21T00:00:08.000Z",
            durationMs: 8_000,
          },
          {
            key: "item_processing",
            label: "内容处理",
            startedAt: "2026-04-21T00:00:08.000Z",
            finishedAt: null,
            durationMs: null,
          },
        ],
      },
    ],
    recentTasks: [],
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("TaskMonitorPanel", () => {
  it("opens the task detail modal from the initial focus task id", async () => {
    renderWithProviders(
      <TaskMonitorPanel
        runningTasks={buildMonitorSnapshot().runningTasks}
        recentTasks={buildMonitorSnapshot().recentTasks}
        initialFocusTaskId="task-1"
      />,
    );

    const dialog = await screen.findByRole("dialog", { name: "任务详情" });
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText("默认抓取任务")).toBeInTheDocument();
    expect(within(dialog).getByText(/已处理 1\/10 条内容/)).toBeInTheDocument();
    expect(
      within(dialog).getByText(/实际新增 1 条内容 · 正文补抓 2 篇/),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(/内容分析 1 条，聚合匹配 0 条，聚合摘要 0 条/),
    ).toBeInTheDocument();
    expect(dialog.querySelector(".overflow-y-auto.p-6")).toBeTruthy();
    expect(within(dialog).getByText("任务开始")).toBeInTheDocument();
    expect(within(dialog).getByText("信息源同步完成")).toBeInTheDocument();
    expect(within(dialog).getByText("内容处理进行中")).toBeInTheDocument();
    expect(within(dialog).getByText("耗时 8.0s")).toBeInTheDocument();
    expect(within(dialog).getByText("耗时 进行中")).toBeInTheDocument();
  });

  it("refreshes task progress from the task detail modal", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          ...buildMonitorSnapshot(),
          runningTasks: [
            {
              ...buildMonitorSnapshot().runningTasks[0],
              progressCurrent: 4,
              progressLabel: "已处理 4/10 条内容，来自 1 个源，失败 0 项，正文补抓 3 篇",
              itemsAdded: 3,
              fullTextFetchedCount: 3,
            },
          ],
        }),
      ),
    );

    vi.stubGlobal("fetch", fetchMock);

    renderWithProviders(
      <TaskMonitorPanel
        runningTasks={buildMonitorSnapshot().runningTasks}
        recentTasks={buildMonitorSnapshot().recentTasks}
        initialFocusTaskId="task-1"
      />,
    );

    await screen.findByRole("dialog", { name: "任务详情" });
    await user.click(screen.getByTitle("刷新进度"));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/admin/monitor");
    });

    const dialog = await screen.findByRole("dialog", { name: "任务详情" });
    expect(await within(dialog).findByText(/已处理 4\/10 条内容/)).toBeInTheDocument();
    expect(
      within(dialog).getByText(/实际新增 3 条内容 · 正文补抓 3 篇/),
    ).toBeInTheDocument();
  });
});
