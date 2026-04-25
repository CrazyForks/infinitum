import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AdminSettingsSnapshot } from "@/lib/settings/types";
import type { BackgroundTaskMonitorSnapshot } from "@/lib/tasks/types";

const {
  openMock,
  pushMock,
  pathnameMock,
  searchParamsState,
} = vi.hoisted(() => ({
  openMock: vi.fn(),
  pushMock: vi.fn(),
  pathnameMock: "/admin",
  searchParamsState: {
    value: "",
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushMock,
  }),
  usePathname: () => pathnameMock,
  useSearchParams: () => new URLSearchParams(searchParamsState.value),
}));

vi.mock("@/components/ui/global-header", () => ({
  GlobalHeader: () => <div>Global Header</div>,
}));

vi.mock("@/components/admin/content-review-panel", () => ({
  ContentReviewPanel: ({
    activeTab,
    initialPage,
    initialPageSize,
  }: {
    activeTab: string;
    initialPage?: number | null;
    initialPageSize?: number | null;
  }) => (
    <div>{`内容审核:${activeTab}:${initialPage ?? "none"}:${initialPageSize ?? "none"}`}</div>
  ),
}));

vi.mock("@/components/admin/task-monitor-panel", () => ({
  TaskMonitorPanel: ({
    initialFocusTaskId,
  }: {
    initialFocusTaskId?: string | null;
  }) => <div>{`任务监控面板:${initialFocusTaskId ?? "none"}`}</div>,
}));

vi.mock("@/components/admin/admin-settings-panel", () => ({
  AdminSettingsPanel: ({ activeSection }: { activeSection: string }) => (
    <div>{`设置面板:${activeSection}`}</div>
  ),
}));

import { AdminPageClient } from "@/components/admin/admin-page-client";

function buildInitialSettings(): AdminSettingsSnapshot {
  return {
    modelApiConfigs: [],
    promptConfigs: [],
    blacklistKeywords: [],
    taskSchedule: {
      key: "ingestion_default",
      enabled: true,
      cronExpression: "0 * * * *",
      sourceConcurrency: 2,
      fullTextFetchThreshold: 80,
      perSourceItemLimit: 20,
      dailyReportCandidateLimit: 120,
      dailyReportAutoPublish: false,
      timezone: "Asia/Shanghai",
      lastHeartbeatAt: null,
      lastRunStartedAt: null,
      lastRunFinishedAt: null,
      lastRunStatus: null,
      nextRunAt: "2026-04-21T00:00:00.000Z",
      isHeartbeatStale: false,
    },
    dailyReportSchedule: {
      key: "daily_report_default",
      enabled: false,
      cronExpression: "30 8 * * *",
      sourceConcurrency: 2,
      fullTextFetchThreshold: 80,
      perSourceItemLimit: 20,
      dailyReportCandidateLimit: 120,
      dailyReportAutoPublish: false,
      timezone: "Asia/Shanghai",
      lastHeartbeatAt: null,
      lastRunStartedAt: null,
      lastRunFinishedAt: null,
      lastRunStatus: null,
      nextRunAt: "2026-04-21T00:30:00.000Z",
      isHeartbeatStale: false,
    },
    groups: [],
    sources: [],
  };
}

function buildInitialSnapshot(): BackgroundTaskMonitorSnapshot {
  return {
    schedule: {
      key: "ingestion_default",
      enabled: true,
      cronExpression: "0 * * * *",
      sourceConcurrency: 2,
      fullTextFetchThreshold: 80,
      perSourceItemLimit: 20,
      dailyReportCandidateLimit: 120,
      dailyReportAutoPublish: false,
      timezone: "Asia/Shanghai",
      lastHeartbeatAt: null,
      lastRunStartedAt: null,
      lastRunFinishedAt: null,
      lastRunStatus: null,
      nextRunAt: "2026-04-21T00:00:00.000Z",
      isHeartbeatStale: false,
    },
    runningTasks: [],
    recentTasks: [],
  };
}

afterEach(() => {
  openMock.mockReset();
  pushMock.mockReset();
  searchParamsState.value = "";
  vi.unstubAllGlobals();
});

describe("AdminPageClient", () => {
  it("restores the current settings tab from the url query", () => {
    searchParamsState.value = "tab=settings&section=tasks";

    render(
      <AdminPageClient
        initialSettings={buildInitialSettings()}
        initialSnapshot={buildInitialSnapshot()}
      />,
    );

    expect(screen.getByText("设置模块")).toBeInTheDocument();
    expect(screen.getByText("设置面板:tasks")).toBeInTheDocument();
  });

  it("restores the current monitoring sub tab from the url query", () => {
    searchParamsState.value = "tab=monitoring&section=content&view=clusters";

    render(
      <AdminPageClient
        initialSettings={buildInitialSettings()}
        initialSnapshot={buildInitialSnapshot()}
      />,
    );

    expect(screen.getByText("内容审核:clusters:none:none")).toBeInTheDocument();
  });

  it("passes content pagination from the url into the content review panel", () => {
    searchParamsState.value = "tab=monitoring&section=content&view=clusters&contentPage=3&contentPageSize=20";

    render(
      <AdminPageClient
        initialSettings={buildInitialSettings()}
        initialSnapshot={buildInitialSnapshot()}
      />,
    );

    expect(screen.getByText("内容审核:clusters:3:20")).toBeInTheDocument();
  });

  it("passes the task id from the url query into the task monitor panel", () => {
    searchParamsState.value = "tab=monitoring&section=tasks&task=task-123";

    render(
      <AdminPageClient
        initialSettings={buildInitialSettings()}
        initialSnapshot={buildInitialSnapshot()}
      />,
    );

    expect(screen.getByText("任务监控面板:task-123")).toBeInTheDocument();
  });

  it("pushes the selected settings tab into the url", async () => {
    const user = userEvent.setup();
    searchParamsState.value = "tab=settings&section=ai&view=model-api";

    render(
      <AdminPageClient
        initialSettings={buildInitialSettings()}
        initialSnapshot={buildInitialSnapshot()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "任务配置" }));

    expect(pushMock).toHaveBeenLastCalledWith("/admin?tab=settings&section=tasks", {
      scroll: false,
    });
  });

  it("pushes the selected monitoring sub tab into the url", async () => {
    const user = userEvent.setup();

    render(
      <AdminPageClient
        initialSettings={buildInitialSettings()}
        initialSnapshot={buildInitialSnapshot()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "聚合管理" }));

    expect(pushMock).toHaveBeenLastCalledWith("/admin?tab=monitoring&section=content&view=clusters", {
      scroll: false,
    });
  });
});
