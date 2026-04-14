import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AdminMonitorPanel } from "@/components/admin/admin-monitor-panel";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("AdminMonitorPanel", () => {
  const initialSnapshot = {
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
  } as const;

  it("renders schedule details and running tasks", () => {
    render(<AdminMonitorPanel initialSnapshot={initialSnapshot} />);

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
