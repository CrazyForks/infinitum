"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { FilterSelect } from "@/components/ui/filter-select";
import { ModalShell } from "@/components/ui/modal-shell";
import { StatusTag } from "@/components/ui/status-tag";
import { useToast } from "@/components/ui/toast";
import { IconButton } from "@/components/ui/icon-button";
import { IconRotateCw, IconSquare } from "@/components/ui/icons";
import type {
  BackgroundTaskMonitorSnapshot,
  BackgroundTaskRunStatus,
  TaskRunSnapshot,
} from "@/lib/tasks/types";
import { cx } from "@/lib/ui/cx";

// Task status filter options
type TaskStatusFilter = "" | BackgroundTaskRunStatus;
type TaskKindFilter = "" | "ingestion" | "item" | "cluster";
type TimeRangeFilter = "" | "today" | "week" | "month";

const statusOptions: Array<{ value: TaskStatusFilter; label: string }> = [
  { value: "", label: "全部" },
  { value: "queued", label: "待处理" },
  { value: "running", label: "运行中" },
  { value: "succeeded", label: "已成功" },
  { value: "failed", label: "失败" },
  { value: "partial", label: "部分成功" },
  { value: "cancelled", label: "已取消" },
];

const kindOptions: Array<{ value: TaskKindFilter; label: string }> = [
  { value: "", label: "全部" },
  { value: "ingestion", label: "抓取任务" },
  { value: "item", label: "内容处理" },
  { value: "cluster", label: "聚合处理" },
];

const timeRangeOptions: Array<{ value: TimeRangeFilter; label: string }> = [
  { value: "", label: "全部时间" },
  { value: "today", label: "今天" },
  { value: "week", label: "最近7天" },
  { value: "month", label: "最近30天" },
];

const statusLabels: Record<BackgroundTaskRunStatus, string> = {
  queued: "待处理",
  running: "运行中",
  succeeded: "已成功",
  failed: "失败",
  partial: "部分成功",
  cancelled: "已取消",
};

const kindLabels: Record<TaskRunSnapshot["kind"], string> = {
  ingestion: "抓取任务",
  item_reanalyze: "内容重分析",
  item_regenerate_summary: "摘要重生成",
  item_regenerate_translation: "译文重生成",
  cluster_regenerate_summary: "聚合摘要重生成",
};

const triggerLabels: Record<TaskRunSnapshot["triggerType"], string> = {
  scheduled: "定时调度",
  manual: "手动触发",
  admin_action: "后台操作",
};

function formatDateTime(value: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatDuration(durationMs: number | null) {
  if (durationMs === null) {
    return "进行中";
  }

  if (durationMs < 1_000) {
    return `${durationMs}ms`;
  }

  if (durationMs < 60_000) {
    return `${(durationMs / 1_000).toFixed(1)}s`;
  }

  const minutes = Math.floor(durationMs / 60_000);
  const seconds = ((durationMs % 60_000) / 1_000).toFixed(1);
  return `${minutes}分 ${seconds}s`;
}

function formatAiCallBreakdown(task: TaskRunSnapshot) {
  const breakdownMap = new Map((task.aiCallBreakdown ?? []).map((entry) => [entry.key, entry]));
  const itemAnalysisCount = breakdownMap.get("item_analysis")?.actual ?? 0;
  const clusterMatchCount = breakdownMap.get("cluster_match")?.actual ?? 0;
  const clusterSummaryCount = breakdownMap.get("cluster_summary")?.actual ?? 0;

  return `内容分析 ${itemAnalysisCount} 条，聚合匹配 ${clusterMatchCount} 条，聚合摘要 ${clusterSummaryCount} 条`;
}

function buildTaskTimeline(task: TaskRunSnapshot) {
  const timeline: Array<{
    key: string;
    title: string;
    time: string | null;
    detail: string;
    isActive: boolean;
  }> = [];

  if (task.startedAt) {
    timeline.push({
      key: "task_started",
      title: "任务开始",
      time: task.startedAt,
      detail: kindLabels[task.kind],
      isActive: task.status === "running" && task.stageTimings.length === 0,
    });
  }

  for (const stageTiming of task.stageTimings) {
    timeline.push({
      key: stageTiming.key,
      title: stageTiming.finishedAt ? `${stageTiming.label}完成` : `${stageTiming.label}进行中`,
      time: stageTiming.finishedAt ?? stageTiming.startedAt,
      detail: `耗时 ${formatDuration(stageTiming.durationMs)}`,
      isActive: !stageTiming.finishedAt,
    });
  }

  if (task.finishedAt) {
    timeline.push({
      key: "task_finished",
      title:
        task.status === "cancelled"
          ? "任务已取消"
          : task.status === "failed"
            ? "任务失败"
            : "任务完成",
      time: task.finishedAt,
      detail: task.errorSummary ?? statusLabels[task.status],
      isActive: false,
    });
  }

  return timeline;
}

function getStatusTone(status: BackgroundTaskRunStatus) {
  switch (status) {
    case "succeeded":
      return "success";
    case "failed":
      return "danger";
    case "running":
      return "info";
    case "cancelled":
      return "neutral";
    case "partial":
      return "warning";
    default:
      return "warning";
  }
}

function getLocalDateString(date: Date): string {
  // Use browser's local timezone and return YYYY-MM-DD format
  return date.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function filterTasks(
  tasks: TaskRunSnapshot[],
  statusFilter: TaskStatusFilter,
  kindFilter: TaskKindFilter,
  timeRangeFilter: TimeRangeFilter,
) {
  return tasks.filter((task) => {
    if (statusFilter && task.status !== statusFilter) return false;
    if (kindFilter) {
      if (kindFilter === "ingestion" && task.kind !== "ingestion") return false;
      if (kindFilter === "item" && !task.kind.startsWith("item_")) return false;
      if (kindFilter === "cluster" && !task.kind.startsWith("cluster_"))
        return false;
    }
    if (timeRangeFilter && task.startedAt) {
      const taskDate = new Date(task.startedAt);
      const now = new Date();

      // Get local timezone dates
      const taskLocalDate = getLocalDateString(taskDate);
      const nowLocalDate = getLocalDateString(now);

      // Parse dates for comparison
      const [taskYear, taskMonth, taskDay] = taskLocalDate.split("/").map(Number);
      const [nowYear, nowMonth, nowDay] = nowLocalDate.split("/").map(Number);

      // Calculate days difference based on local dates
      const taskLocalTime = new Date(taskYear, taskMonth - 1, taskDay).getTime();
      const nowLocalTime = new Date(nowYear, nowMonth - 1, nowDay).getTime();
      const diffDays = (nowLocalTime - taskLocalTime) / (1000 * 60 * 60 * 24);

      if (timeRangeFilter === "today" && diffDays !== 0) return false;
      if (timeRangeFilter === "week" && (diffDays < 0 || diffDays > 6)) return false;
      if (timeRangeFilter === "month" && (diffDays < 0 || diffDays > 29)) return false;
    }
    return true;
  });
}

interface TaskDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  task: TaskRunSnapshot | null;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  onRetrigger?: (taskId: string) => void;
  isRetriggering?: boolean;
  onCancel?: (taskId: string) => void;
  isCancelling?: boolean;
}

function TaskDetailModal({
  isOpen,
  onClose,
  task,
  onRefresh,
  isRefreshing,
  onRetrigger,
  isRetriggering,
  onCancel,
  isCancelling,
}: TaskDetailModalProps) {
  if (!task) return null;

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title="任务详情"
      widthClassName="max-w-2xl"
      panelClassName="flex max-h-[calc(100vh-2rem)] flex-col"
      headerClassName="border-b border-[color:var(--line)] p-6"
      bodyClassName="overflow-y-auto p-6"
      footerClassName="border-t border-[color:var(--line)] bg-[var(--bg-muted)] p-6"
      footer={
        <div className="flex justify-end gap-2">
          {task && (task.status === "running" || task.status === "queued") && onCancel && (
            <Button
              onClick={() => onCancel(task.id)}
              variant="danger"
              disabled={isCancelling}
            >
              <IconSquare className={cx("h-4 w-4 mr-1", isCancelling && "animate-pulse")} />
              停止任务
            </Button>
          )}
          {task && task.status !== "running" && task.status !== "queued" && onRetrigger && (
            <Button
              onClick={() => onRetrigger(task.id)}
              variant="secondary"
              disabled={isRetriggering}
            >
              <IconRotateCw className={cx("h-4 w-4 mr-1", isRetriggering && "animate-spin")} />
              重新触发
            </Button>
          )}
          <Button onClick={onClose} variant="secondary">
            关闭
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Basic Info */}
        <div className="rounded-lg border border-[color:var(--line)] bg-[var(--bg-muted)] p-4 text-sm text-[var(--text-2)]">
          <div className="font-medium text-[var(--text-1)] mb-2">
            {task.label}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="text-[var(--text-3)]">任务ID:</span> {task.id}
            </div>
            <div>
              <span className="text-[var(--text-3)]">类型:</span>{" "}
              {kindLabels[task.kind]}
            </div>
            <div>
              <span className="text-[var(--text-3)]">触发方式:</span>{" "}
              {triggerLabels[task.triggerType]}
            </div>
            <div>
              <span className="text-[var(--text-3)]">状态:</span>{" "}
              <StatusTag tone={getStatusTone(task.status)}>
                {statusLabels[task.status]}
              </StatusTag>
            </div>
          </div>
        </div>

        {/* Progress */}
        {task.progressTotal > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <h4 className="text-sm font-semibold text-[var(--text-1)]">
                进度
              </h4>
              {onRefresh ? (
                <IconButton
                  onClick={onRefresh}
                  variant="secondary"
                  size="sm"
                  title="刷新进度"
                  disabled={isRefreshing}
                >
                  <IconRotateCw className={cx("h-4 w-4", isRefreshing && "animate-spin")} />
                </IconButton>
              ) : null}
            </div>
            <div className="w-full bg-[var(--surface)] rounded-full h-2">
              <div
                className="bg-[var(--accent)] h-2 rounded-full transition-all"
                style={{
                  width: `${Math.round((task.progressCurrent / task.progressTotal) * 100)}%`,
                }}
              />
            </div>
            <div className="text-sm text-[var(--text-2)]">
              {task.progressCurrent} / {task.progressTotal}
              {task.progressLabel ? ` · ${task.progressLabel}` : ""}
            </div>
            <div
              className={cx(
                "text-sm",
                task.itemsAdded > 0 || (task.fullTextFetchedCount ?? 0) > 0
                  ? "text-[var(--success-ink)]"
                  : "text-[var(--text-3)]",
              )}
            >
              实际新增 {task.itemsAdded} 条内容 · 正文补抓 {task.fullTextFetchedCount ?? 0} 篇
            </div>
          </div>
        )}

        {/* AI Calls */}
        {(task.aiCallCountActual > 0 || task.aiCallCountEstimated > 0) && (
          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-[var(--text-1)]">
              AI 调用
            </h4>
            <div className="text-sm text-[var(--text-2)]">
              实际: {task.aiCallCountActual}
              {task.aiCallCountEstimated > 0
                ? ` / 预估: ${task.aiCallCountEstimated}`
                : ""}
              {` · ${formatAiCallBreakdown(task)}`}
            </div>
          </div>
        )}

        {/* Timeline */}
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-[var(--text-1)]">
            时间线
          </h4>
          <div className="space-y-3">
            {buildTaskTimeline(task).length === 0 ? (
              <div className="rounded-md border border-[color:var(--line)] bg-[var(--bg-muted)] px-3 py-2 text-sm text-[var(--text-3)]">
                暂无时间线数据
              </div>
            ) : buildTaskTimeline(task).map((entry, index, entries) => (
              <div key={entry.key} className="flex gap-3">
                <div className="relative flex w-5 justify-center">
                  <span
                    className={cx(
                      "mt-1 h-2.5 w-2.5 rounded-full border-2",
                      entry.isActive
                        ? "border-[var(--accent)] bg-[var(--accent)]"
                        : "border-[color:var(--line-strong)] bg-[var(--surface)]",
                    )}
                  />
                  {index < entries.length - 1 ? (
                    <span className="absolute top-4 h-[calc(100%+0.25rem)] w-px bg-[color:var(--line)]" />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1 rounded-md border border-[color:var(--line)] bg-[var(--bg-muted)] px-3 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium text-[var(--text-1)]">
                      {entry.title}
                    </span>
                    <span className="shrink-0 text-xs text-[var(--text-3)]">
                      {formatDateTime(entry.time)}
                    </span>
                  </div>
                  <div className="mt-1 text-sm text-[var(--text-2)]">
                    {entry.detail}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Error */}
        {task.errorSummary && (
          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-[var(--danger-ink)]">
              错误信息
            </h4>
            <div className="rounded-md border border-[var(--danger-line)] bg-[var(--danger-surface)] p-3 text-sm text-[var(--danger-ink)]">
              {task.errorSummary}
            </div>
          </div>
        )}
      </div>
    </ModalShell>
  );
}

interface TaskMonitorPanelProps {
  runningTasks: TaskRunSnapshot[];
  recentTasks: TaskRunSnapshot[];
  initialFocusTaskId?: string | null;
}

function isTaskMonitorSnapshot(value: unknown): value is BackgroundTaskMonitorSnapshot {
  if (!value || typeof value !== "object") {
    return false;
  }

  return "schedule" in value && "runningTasks" in value && "recentTasks" in value;
}

export function TaskMonitorPanel({
  runningTasks,
  recentTasks,
  initialFocusTaskId = null,
}: TaskMonitorPanelProps) {
  const { showToast } = useToast();
  const [taskLists, setTaskLists] = useState(() => ({
    runningTasks,
    recentTasks,
  }));
  const [statusFilter, setStatusFilter] = useState<TaskStatusFilter>("");
  const [kindFilter, setKindFilter] = useState<TaskKindFilter>("");
  const [timeRangeFilter, setTimeRangeFilter] = useState<TimeRangeFilter>("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [isRefreshingSnapshot, setIsRefreshingSnapshot] = useState(false);
  const [selectedTask, setSelectedTask] = useState<TaskRunSnapshot | null>(
    null
  );
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [retriggeringTaskId, setRetriggeringTaskId] = useState<string | null>(
    null
  );
  const [cancellingTaskId, setCancellingTaskId] = useState<string | null>(
    null
  );
  const [confirmTask, setConfirmTask] = useState<TaskRunSnapshot | null>(null);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<"retrigger" | "cancel">("retrigger");
  const hasAppliedInitialFocusRef = useRef(false);

  const allTasks = useMemo(() => {
    // Merge and deduplicate by task id (runningTasks takes precedence)
    const taskMap = new Map<string, TaskRunSnapshot>();
    for (const task of taskLists.recentTasks) {
      taskMap.set(task.id, task);
    }
    for (const task of taskLists.runningTasks) {
      taskMap.set(task.id, task);
    }
    return Array.from(taskMap.values());
  }, [taskLists]);

  useEffect(() => {
    setTaskLists({
      runningTasks,
      recentTasks,
    });
  }, [recentTasks, runningTasks]);

  useEffect(() => {
    if (!selectedTask) {
      return;
    }

    const latestSelectedTask = allTasks.find((task) => task.id === selectedTask.id);
    if (latestSelectedTask && latestSelectedTask !== selectedTask) {
      setSelectedTask(latestSelectedTask);
    }
  }, [allTasks, selectedTask]);

  useEffect(() => {
    if (!initialFocusTaskId || hasAppliedInitialFocusRef.current) {
      return;
    }

    const initialTask = allTasks.find((task) => task.id === initialFocusTaskId);
    if (!initialTask) {
      return;
    }

    setSelectedTask(initialTask);
    setIsDetailOpen(true);
    hasAppliedInitialFocusRef.current = true;
  }, [allTasks, initialFocusTaskId]);

  const filteredTasks = useMemo(
    () => filterTasks(allTasks, statusFilter, kindFilter, timeRangeFilter),
    [allTasks, statusFilter, kindFilter, timeRangeFilter]
  );

  const totalPages = Math.ceil(filteredTasks.length / pageSize) || 1;
  const paginatedTasks = filteredTasks.slice(
    (page - 1) * pageSize,
    page * pageSize
  );

  const hasFilters = statusFilter || kindFilter || timeRangeFilter;

  const refreshSnapshot = async () => {
    setIsRefreshingSnapshot(true);

    try {
      const response = await fetch("/api/admin/monitor");
      const payload = (await response.json()) as BackgroundTaskMonitorSnapshot | { error?: string };

      if (!response.ok || !isTaskMonitorSnapshot(payload)) {
        showToast(
          "error" in payload && payload.error ? payload.error : "刷新任务监控失败",
          "error",
        );
        return;
      }

      setTaskLists({
        runningTasks: payload.runningTasks,
        recentTasks: payload.recentTasks,
      });
    } catch {
      showToast("刷新任务监控失败", "error");
    } finally {
      setIsRefreshingSnapshot(false);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshingSnapshot(true);
    try {
      await refreshSnapshot();
    } finally {
      setIsRefreshingSnapshot(false);
    }
  };

  const handleClearFilters = () => {
    setStatusFilter("");
    setKindFilter("");
    setTimeRangeFilter("");
    setPage(1);
  };

  const handleOpenConfirm = (task: TaskRunSnapshot, action: "retrigger" | "cancel") => {
    setConfirmTask(task);
    setConfirmAction(action);
    setIsConfirmOpen(true);
  };

  const handleCloseConfirm = () => {
    setIsConfirmOpen(false);
    setConfirmTask(null);
  };

  const handleConfirmAction = () => {
    if (!confirmTask) return;
    if (confirmAction === "retrigger") {
      handleRetrigger(confirmTask.id);
    } else {
      handleCancel(confirmTask.id);
    }
    handleCloseConfirm();
  };

  const handleOpenDetail = (task: TaskRunSnapshot) => {
    setSelectedTask(task);
    setIsDetailOpen(true);
  };

  const handleCloseDetail = () => {
    setIsDetailOpen(false);
    setSelectedTask(null);
  };

  const handleRetrigger = async (taskId: string) => {
    setRetriggeringTaskId(taskId);

    try {
      const response = await fetch(`/api/admin/monitor/tasks/${taskId}/retrigger`, {
        method: "POST",
      });

      const data = await response.json();

      if (!response.ok || data.error) {
        showToast(data.error || "重新触发任务失败", "error");
        return;
      }

      showToast("任务已重新触发", "success");

      // Refresh the task list after a short delay
      setTimeout(() => {
        void refreshSnapshot();
      }, 500);
    } catch {
      showToast("重新触发任务失败", "error");
    } finally {
      setRetriggeringTaskId(null);
    }
  };

  const handleCancel = async (taskId: string) => {
    setCancellingTaskId(taskId);

    try {
      const response = await fetch(`/api/admin/monitor/tasks/${taskId}/cancel`, {
        method: "POST",
      });

      const data = await response.json();

      if (!response.ok || data.error) {
        showToast(data.error || "停止任务失败", "error");
        return;
      }

      showToast("任务已停止", "success");

      // Refresh the task list after a short delay
      setTimeout(() => {
        void refreshSnapshot();
      }, 500);
    } catch {
      showToast("停止任务失败", "error");
    } finally {
      setCancellingTaskId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-[var(--foreground)]">
            任务监控
          </h2>
          <p className="text-sm text-[var(--muted)]">
            查看和管理后台任务运行状态
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={handleClearFilters}
            variant="secondary"
            disabled={!hasFilters}
          >
            清空筛选
          </Button>
          <Button
            onClick={handleRefresh}
            variant="secondary"
            disabled={isRefreshingSnapshot}
          >
            刷新
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <FilterSelect
          label="状态"
          value={statusFilter}
          onChange={(value) => {
            setStatusFilter(value as TaskStatusFilter);
            setPage(1);
          }}
          options={statusOptions}
          showSearch={false}
        />
        <FilterSelect
          label="任务类型"
          value={kindFilter}
          onChange={(value) => {
            setKindFilter(value as TaskKindFilter);
            setPage(1);
          }}
          options={kindOptions}
          showSearch={false}
        />
        <FilterSelect
          label="开始时间"
          value={timeRangeFilter}
          onChange={(value) => {
            setTimeRangeFilter(value as TimeRangeFilter);
            setPage(1);
          }}
          options={timeRangeOptions}
          showSearch={false}
        />
      </div>

      {/* Task List */}
      {isRefreshingSnapshot ? (
        <div className="rounded-sm border border-[color:var(--line)] bg-[var(--bg-muted)] px-4 py-8 text-center text-sm text-[var(--muted)]">
          加载中...
        </div>
      ) : paginatedTasks.length === 0 ? (
        <div className="rounded-sm border border-[color:var(--line)] bg-[var(--bg-muted)] px-4 py-8 text-center text-sm text-[var(--muted)]">
          {hasFilters ? "暂无匹配任务" : "暂无任务"}
        </div>
      ) : (
        <div className="w-full overflow-x-auto">
          <table className="w-full table-auto text-sm">
            <thead className="bg-[var(--bg-muted)] text-[var(--muted)]">
              <tr>
                <th className="w-[25%] text-left px-4 py-3">任务</th>
                <th className="w-[12%] whitespace-nowrap text-left px-4 py-3">
                  状态
                </th>
                <th className="w-[15%] whitespace-nowrap text-left px-4 py-3">
                  类型
                </th>
                <th className="w-[20%] whitespace-nowrap text-left px-4 py-3">
                  时间
                </th>
                <th className="w-[15%] whitespace-nowrap text-right px-4 py-3">
                  操作
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:var(--line)]">
              {paginatedTasks.map((task) => (
                <tr
                  key={task.id}
                  className="hover:bg-[var(--bg-muted)] transition-colors"
                >
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => handleOpenDetail(task)}
                      className="w-full text-left group"
                    >
                      <div className="font-medium text-[var(--foreground)] group-hover:text-[var(--accent)] transition-colors">
                        {task.label}
                      </div>
                      <div className="text-xs text-[var(--muted)]">
                        #{task.id.slice(0, 8)}
                      </div>
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <StatusTag tone={getStatusTone(task.status)}>
                      {statusLabels[task.status]}
                    </StatusTag>
                  </td>
                  <td className="px-4 py-3 text-[var(--text-2)]">
                    {kindLabels[task.kind]}
                  </td>
                  <td className="px-4 py-3 text-[var(--text-3)] text-xs">
                    <div>开始: {formatDateTime(task.startedAt)}</div>
                    {task.finishedAt && (
                      <div>完成: {formatDateTime(task.finishedAt)}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {task.status === "running" || task.status === "queued" ? (
                        <IconButton
                          onClick={() => handleOpenConfirm(task, "cancel")}
                          variant="ghost"
                          size="sm"
                          title="停止任务"
                          disabled={cancellingTaskId === task.id}
                        >
                          <IconSquare className={cx("h-4 w-4", cancellingTaskId === task.id && "animate-pulse")} />
                        </IconButton>
                      ) : (
                        <IconButton
                          onClick={() => handleOpenConfirm(task, "retrigger")}
                          variant="ghost"
                          size="sm"
                          title="重新触发"
                          disabled={retriggeringTaskId === task.id}
                        >
                          <IconRotateCw className={cx("h-4 w-4", retriggeringTaskId === task.id && "animate-spin")} />
                        </IconButton>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {filteredTasks.length > 0 && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-[var(--muted)]">
            <span>每页显示</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
              className="rounded-sm border border-[color:var(--line)] bg-[var(--surface)] px-2 py-1 text-sm"
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
            </select>
            <span>
              条，共 {filteredTasks.length} 条
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              variant="secondary"
              size="sm"
            >
              上一页
            </Button>
            <span className="min-w-[100px] px-4 py-2 text-center text-sm bg-[var(--surface)] border border-[color:var(--line)] rounded-sm text-[var(--muted)]">
              第 {page} / {totalPages} 页
            </span>
            <Button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              variant="secondary"
              size="sm"
            >
              下一页
            </Button>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      <TaskDetailModal
        isOpen={isDetailOpen}
        onClose={handleCloseDetail}
        task={selectedTask}
        onRefresh={handleRefresh}
        isRefreshing={isRefreshingSnapshot}
        onRetrigger={handleRetrigger}
        isRetriggering={retriggeringTaskId === selectedTask?.id}
        onCancel={handleCancel}
        isCancelling={cancellingTaskId === selectedTask?.id}
      />

      {/* Confirm Modal */}
      <ModalShell
        isOpen={isConfirmOpen}
        onClose={handleCloseConfirm}
        title={confirmAction === "retrigger" ? "确认重新触发" : "确认停止任务"}
        widthClassName="max-w-md"
        headerClassName="border-b border-[color:var(--line)] p-4"
        bodyClassName="p-4"
        footerClassName="border-t border-[color:var(--line)] bg-[var(--bg-muted)] p-4"
        footer={
          <div className="flex justify-end gap-2">
            <Button onClick={handleCloseConfirm} variant="secondary">
              取消
            </Button>
            <Button
              onClick={handleConfirmAction}
              variant={confirmAction === "cancel" ? "danger" : "primary"}
            >
              {confirmAction === "retrigger" ? "重新触发" : "停止任务"}
            </Button>
          </div>
        }
      >
        <p className="text-sm text-[var(--text-2)]">
          {confirmAction === "retrigger"
            ? `确定要重新触发任务 "${confirmTask?.label}" 吗？`
            : `确定要停止任务 "${confirmTask?.label}" 吗？`}
        </p>
      </ModalShell>
    </div>
  );
}
