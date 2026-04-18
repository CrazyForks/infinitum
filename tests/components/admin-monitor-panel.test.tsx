import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { BackgroundTaskMonitorSnapshot } from "@/lib/tasks/types";
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

import { AdminMonitorPanel } from "@/components/admin/admin-monitor-panel";

afterEach(() => {
  vi.useRealTimers();
  pushMock.mockReset();
  refreshMock.mockReset();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("AdminMonitorPanel", () => {
  const initialSnapshot: BackgroundTaskMonitorSnapshot = {
    schedule: {
      key: "ingestion_default",
      enabled: true,
      intervalMinutes: 60,
      timezone: "Asia/Shanghai",
      lastHeartbeatAt: "2026-04-12T00:00:00.000Z",
      lastRunStartedAt: null,
      lastRunFinishedAt: null,
      lastRunStatus: null,
      nextRunAt: "2026-04-12T01:00:00.000Z",
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
        progressCurrent: 3,
        progressTotal: 10,
        progressLabel: "已处理 3/10 条内容，来自 1 个源，失败 0 项",
        aiCallCountActual: 2,
        aiCallCountEstimated: 6,
        startedAt: "2026-04-12T00:30:00.000Z",
        finishedAt: null,
        cancelRequestedAt: null,
        errorSummary: null,
      },
    ],
    recentTasks: [],
  };

  it("renders the monitor workspace with aligned global and sidebar navigation", () => {
    render(<AdminMonitorPanel initialSnapshot={initialSnapshot} />);

    expect(screen.getByRole("navigation", { name: "主导航" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "任务" })).toHaveAttribute("aria-current", "page");
    const adminNav = screen.getByRole("complementary", { name: "管理导航" });

    expect(within(adminNav).getByRole("link", { name: "任务监控" })).toHaveAttribute("aria-current", "page");
    expect(within(adminNav).getByRole("link", { name: "后台设置" })).toHaveAttribute("href", "/admin/settings");
    expect(screen.getByRole("heading", { name: "任务监控", level: 1 })).toBeInTheDocument();
    expect(screen.queryByText("Task Monitor")).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "调度设置" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "运行中任务" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "最近任务" })).toBeInTheDocument();
    expect(screen.getAllByText("默认抓取任务")[0]).toBeInTheDocument();
    expect(screen.getByLabelText("抓取频率（分钟）")).toHaveValue(60);
    expect(screen.getByText("已处理 3/10 条内容，来自 1 个源，失败 0 项")).toBeInTheDocument();
    expect(screen.getByText("AI 调用：2 / 6")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "终止任务" })).toBeInTheDocument();
  });

  it("submits schedule changes", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            schedule: {
              ...initialSnapshot.schedule,
              enabled: false,
              intervalMinutes: 120,
            },
          }),
        ),
      );

    vi.stubGlobal("fetch", fetchMock);

    render(<AdminMonitorPanel initialSnapshot={initialSnapshot} />);

    await user.clear(screen.getByLabelText("抓取频率（分钟）"));
    await user.type(screen.getByLabelText("抓取频率（分钟）"), "120");
    await user.click(screen.getByLabelText("启用默认抓取任务"));
    await user.click(screen.getByRole("button", { name: "保存调度设置" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/admin/monitor/schedule/ingestion-default", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          enabled: false,
          intervalMinutes: 120,
        }),
      });
    });
  });

  it("shows an error banner when saving schedule changes fails", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValueOnce(new Error("network down"));

    vi.stubGlobal("fetch", fetchMock);

    render(<AdminMonitorPanel initialSnapshot={initialSnapshot} />);

    await user.click(screen.getByRole("button", { name: "保存调度设置" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("调度配置保存失败。");
    });
  });

  it("keeps dirty schedule form values when polling refreshes snapshot", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          ...initialSnapshot,
          schedule: {
            ...initialSnapshot.schedule,
            enabled: true,
            intervalMinutes: 60,
            nextRunAt: "2026-04-12T02:00:00.000Z",
          },
        }),
      ),
    );

    vi.stubGlobal("fetch", fetchMock);

    render(<AdminMonitorPanel initialSnapshot={initialSnapshot} />);

    const intervalInput = screen.getByLabelText("抓取频率（分钟）");
    const enabledCheckbox = screen.getByLabelText("启用默认抓取任务");

    fireEvent.change(intervalInput, { target: { value: "120" } });
    fireEvent.click(enabledCheckbox);

    expect(intervalInput).toHaveValue(120);
    expect(enabledCheckbox).not.toBeChecked();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_500);
    });
    await Promise.resolve();

    expect(fetchMock).toHaveBeenCalledWith("/api/admin/monitor");

    expect(intervalInput).toHaveValue(120);
    expect(enabledCheckbox).not.toBeChecked();
  });

  it("submits a cancel request for a running task", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            task: {
              ...initialSnapshot.runningTasks[0],
              cancelRequestedAt: "2026-04-12T00:31:00.000Z",
            },
          }),
        ),
      );

    vi.stubGlobal("fetch", fetchMock);

    render(<AdminMonitorPanel initialSnapshot={initialSnapshot} />);

    await user.click(screen.getByRole("button", { name: "终止任务" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/admin/monitor/tasks/task-1/cancel", {
        method: "POST",
      });
    });

    expect(screen.getByRole("button", { name: "终止中" })).toBeDisabled();
  });
});
