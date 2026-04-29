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
      dailyReportCandidateLimit: 120,
      dailyReportOffsetDays: 0,
      dailyReportAutoPublish: false,
      dailyReportMaxRetries: 0,
      timezone: "Asia/Shanghai",
      lastHeartbeatAt: null,
      lastRunStartedAt: null,
      lastRunFinishedAt: null,
      lastRunStatus: "running",
      nextRunAt: "2026-04-21T01:00:00.000Z",
      cleanupRetentionDays: 365,
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
            key: "item_summary",
            label: "条目摘要",
            actual: 1,
            estimated: 2,
          },
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
        taskTimeline: [
          {
            key: "source_fetch",
            label: "信息抓取",
            status: "succeeded",
            startedAt: "2026-04-21T00:00:00.000Z",
            finishedAt: "2026-04-21T00:00:08.000Z",
            durationMs: 8_000,
            metrics: [
              { label: "抓取源", value: 1 },
              { label: "抓取内容", value: 10 },
              { label: "正文补抓", value: 2 },
            ],
          },
          {
            key: "rule_filter",
            label: "规则过滤",
            status: "running",
            startedAt: "2026-04-21T00:00:08.000Z",
            finishedAt: null,
            durationMs: null,
            metrics: [
              { label: "命中黑名单", value: 2 },
              { label: "复用已有处理", value: 1 },
            ],
          },
          {
            key: "item_summary",
            label: "条目摘要",
            status: "partial",
            startedAt: "2026-04-21T00:00:08.000Z",
            finishedAt: null,
            durationMs: null,
            modelName: "gpt-4.1-mini-summary",
            metrics: [
              { label: "完成", value: 5 },
              { label: "失败", value: 1 },
            ],
          },
          {
            key: "item_analysis",
            label: "内容分析",
            status: "running",
            startedAt: "2026-04-21T00:00:08.000Z",
            finishedAt: null,
            durationMs: null,
            modelName: "gpt-4.1-mini-analysis",
            metrics: [
              { label: "完成", value: 4 },
              { label: "过滤", value: 2 },
            ],
          },
          {
            key: "cluster_assignment",
            label: "归组决策",
            status: "running",
            startedAt: "2026-04-21T00:00:08.000Z",
            finishedAt: null,
            durationMs: null,
            modelName: "gpt-4.1-mini-match",
            metrics: [
              { label: "指纹命中", value: 1 },
              { label: "本地直连", value: 2 },
              { label: "AI归组", value: 1 },
              { label: "跳过", value: 0 },
              { label: "新建", value: 1 },
            ],
          },
          {
            key: "cluster_merge",
            label: "聚合合并",
            status: "succeeded",
            startedAt: null,
            finishedAt: null,
            durationMs: null,
            modelName: "gpt-4.1-mini-merge",
            metrics: [
              { label: "基础池", value: 120 },
              { label: "本地Pair", value: 240 },
              { label: "对象冲突", value: 30 },
              { label: "日期冲突", value: 10 },
              { label: "无锚点", value: 80 },
              { label: "低分", value: 60 },
              { label: "相关Pair", value: 60 },
              { label: "AI候选Pair", value: 12 },
              { label: "Hash跳过", value: 4 },
              { label: "Dirty Pair", value: 8 },
              { label: "裁剪前", value: 18 },
              { label: "候选组", value: 12 },
              { label: "Dirty候选", value: 5 },
              { label: "AI返回组", value: 2 },
              { label: "跳过", value: 0 },
              { label: "合并后", value: 9 },
              { label: "移动条目", value: 6 },
              { label: "失败组", value: 1 },
            ],
          },
          {
            key: "cluster_finalize",
            label: "聚合收尾",
            status: "running",
            startedAt: "2026-04-21T00:00:08.000Z",
            finishedAt: null,
            durationMs: null,
            modelName: "gpt-4.1-mini-cluster",
            metrics: [
              { label: "参与重算", value: 2 },
              { label: "完成更新", value: 2 },
              { label: "摘要完成", value: 1 },
              { label: "摘要失败", value: 0 },
              { label: "已删除", value: 0 },
            ],
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
    expect(dialog.querySelector(".overflow-y-auto.p-6")).toBeTruthy();
    expect(within(dialog).queryByText("AI 调用")).not.toBeInTheDocument();
    expect(within(dialog).getByText("信息抓取")).toBeInTheDocument();
    expect(within(dialog).getByText("规则过滤")).toBeInTheDocument();
    expect(within(dialog).getByText("条目摘要 · 模型 gpt-4.1-mini-summary")).toBeInTheDocument();
    expect(within(dialog).getByText("内容分析 · 模型 gpt-4.1-mini-analysis")).toBeInTheDocument();
    expect(within(dialog).getByText("归组决策 · 模型 gpt-4.1-mini-match")).toBeInTheDocument();
    expect(within(dialog).getByText("聚合合并 · 模型 gpt-4.1-mini-merge")).toBeInTheDocument();
    expect(within(dialog).getByText("聚合收尾 · 模型 gpt-4.1-mini-cluster")).toBeInTheDocument();
    expect(within(dialog).queryByText("进度")).not.toBeInTheDocument();
    expect(within(dialog).getByText("抓取 1 个源 · 10 篇内容 · 正文补抓 2 篇")).toBeInTheDocument();
    expect(within(dialog).getByText("黑名单 2 · 复用 1")).toBeInTheDocument();
    expect(within(dialog).getByText("完成 5 · 失败 1")).toBeInTheDocument();
    expect(within(dialog).getByText("完成 4 · 过滤 2")).toBeInTheDocument();
    expect(within(dialog).getByText("指纹命中 1 · 本地直连 2 · AI归组 1 · 跳过 0 · 新建 1")).toBeInTheDocument();
    expect(within(dialog).getByText("基础池 120 · 候选 12/18 · Dirty 5 · Hash跳过 4 · AI返回 2 · 移动 6 · 失败 1 · 已合并 · 合并后 9 组")).toBeInTheDocument();
    expect(within(dialog).getByText("参与重算 2 · 完成更新 2 · 摘要完成 1 · 摘要失败 0 · 已删除 0")).toBeInTheDocument();
  });

  it("shows item or cluster title in regeneration task details", async () => {
    renderWithProviders(
      <TaskMonitorPanel
        runningTasks={[]}
        recentTasks={[
          {
            ...buildMonitorSnapshot().runningTasks[0],
            id: "task-item",
            kind: "item_regenerate_summary",
            label: "重生成摘要",
            entityId: "item-1",
            entityTitle: "单条新闻标题",
            status: "succeeded",
            startedAt: "2026-04-21T00:00:00.000Z",
            finishedAt: "2026-04-21T00:00:10.000Z",
          },
        ]}
        initialFocusTaskId="task-item"
      />,
    );

    const dialog = await screen.findByRole("dialog", { name: "任务详情" });
    expect(within(dialog).getByText("条目标题:")).toBeInTheDocument();
    expect(within(dialog).getByText("单条新闻标题")).toBeInTheDocument();
  });

  it("keeps current pagination when opening a task detail route", async () => {
    const user = userEvent.setup();
    const onDetailRouteChange = vi.fn();
    const recentTasks = Array.from({ length: 12 }, (_, index) => ({
      ...buildMonitorSnapshot().runningTasks[0],
      id: `task-${index + 1}`,
      status: "succeeded" as const,
      startedAt: "2026-04-21T00:00:00.000Z",
      finishedAt: "2026-04-21T00:00:10.000Z",
    }));
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(
        new Response(
          JSON.stringify({
            ...buildMonitorSnapshot(),
            runningTasks: [],
            recentTasks,
            recentTotal: recentTasks.length,
          }),
        ),
      ),
    );

    renderWithProviders(
      <TaskMonitorPanel
        runningTasks={[]}
        recentTasks={recentTasks}
        initialPage={2}
        initialPageSize={10}
        onDetailRouteChange={onDetailRouteChange}
      />,
    );

    await user.click(await screen.findByRole("button", { name: /默认抓取任务\s+#task-11/ }));

    expect(onDetailRouteChange).toHaveBeenLastCalledWith("task-11", {
      page: 2,
      pageSize: 10,
    });
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
              taskTimeline: [
                {
                  key: "source_fetch",
                  label: "信息抓取",
                  status: "succeeded",
                  startedAt: "2026-04-21T00:00:00.000Z",
                  finishedAt: "2026-04-21T00:00:08.000Z",
                  durationMs: 8_000,
                  metrics: [
                    { label: "抓取源", value: 1 },
                    { label: "抓取内容", value: 10 },
                    { label: "正文补抓", value: 3 },
                  ],
                },
                {
                  key: "rule_filter",
                  label: "规则过滤",
                  status: "running",
                  startedAt: "2026-04-21T00:00:08.000Z",
                  finishedAt: null,
                  durationMs: null,
                  metrics: [
                    { label: "命中黑名单", value: 2 },
                    { label: "复用已有处理", value: 1 },
                  ],
                },
              ],
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
      expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/api/admin/monitor?page="));
    });

    const dialog = await screen.findByRole("dialog", { name: "任务详情" });
    expect(
      await within(dialog).findByText("抓取 1 个源 · 10 篇内容 · 正文补抓 3 篇"),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText("黑名单 2 · 复用 1"),
    ).toBeInTheDocument();
  });
});
