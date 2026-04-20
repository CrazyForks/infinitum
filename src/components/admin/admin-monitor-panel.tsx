"use client";
import type { ReactNode } from "react";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";

import { PageShell } from "@/components/ui/page-shell";
import { useToast } from "@/components/ui/toast";
import { StatusBanner } from "@/components/ui/status-banner";
import type {
  BackgroundTaskMonitorSnapshot,
  TaskRunSnapshot,
} from "@/lib/tasks/types";
import { cx } from "@/lib/ui/cx";

type AdminMonitorPanelProps = {
  initialSnapshot: BackgroundTaskMonitorSnapshot;
  embedMode?: boolean;
  showSchedule?: boolean;
  showScheduleOnly?: boolean;
};

type SchedulePayload = {
  error?: string;
  schedule?: BackgroundTaskMonitorSnapshot["schedule"];
};

type CancelPayload = {
  error?: string;
  task?: BackgroundTaskMonitorSnapshot["runningTasks"][number];
};

const triggerTypeLabels = {
  admin_action: "后台操作",
  manual: "手动触发",
  scheduled: "定时调度",
} as const;

const statusLabels = {
  cancelled: "已取消",
  failed: "失败",
  partial: "部分成功",
  queued: "已排队",
  running: "运行中",
  succeeded: "已成功",
} as const;

const taskKindLabels = {
  cluster_regenerate_summary: "聚合摘要重生成",
  ingestion: "抓取任务",
  item_reanalyze: "内容重分析",
  item_regenerate_summary: "摘要重生成",
  item_regenerate_translation: "译文重生成",
} as const;

const surfaceCardClassName =
  "rounded-[1.35rem] border border-[color:var(--line)] bg-white/95 shadow-[var(--shadow-sm)]";
const subtleCardClassName =
  "rounded-[1rem] border border-[color:var(--line)] bg-[var(--surface-muted)] shadow-[var(--shadow-sm)]";
const primaryButtonClassName =
  "inline-flex min-h-10 items-center justify-center rounded-xl bg-[var(--accent)] px-3.5 py-2.5 text-sm font-semibold text-white shadow-[0_14px_28px_rgba(37,99,235,0.18)] transition hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:bg-[var(--accent)]";
const secondaryButtonClassName =
  "inline-flex min-h-10 items-center justify-center rounded-xl border border-[color:var(--line)] bg-white px-3.5 py-2.5 text-sm font-medium text-[var(--foreground)] shadow-[var(--shadow-sm)] transition hover:bg-[var(--surface)] disabled:cursor-not-allowed disabled:opacity-55";
const inputClassName =
  "min-h-10 rounded-xl border border-[color:var(--line)] bg-white px-3.5 py-2.5 text-sm text-[var(--foreground)] outline-none transition placeholder:text-[var(--muted)] focus:border-[color:var(--accent)] focus:ring-2 focus:ring-[color:var(--accent-soft)]";
const chipBaseClassName =
  "inline-flex items-center rounded-full border px-2.5 py-1 font-mono text-[11px] font-medium uppercase tracking-[0.18em]";
const adminWorkspaceNavItems = [
  {
    href: "/admin/monitor",
    key: "monitor",
    label: "任务监控",
    note: "调度状态与运行队列",
  },
  {
    href: "/admin/settings",
    key: "admin",
    label: "后台设置",
    note: "模型、规则与信息源",
  },
] as const;

function formatDateTime(value: string | null) {
  if (!value) {
    return "暂无";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Shanghai",
  }).format(new Date(value));
}

function getAiCallLabel(task: TaskRunSnapshot) {
  if (task.aiCallCountActual <= 0 && task.aiCallCountEstimated <= 0) {
    return null;
  }

  if (task.aiCallCountEstimated > 0) {
    return `AI 调用：${task.aiCallCountActual} / ${task.aiCallCountEstimated}`;
  }

  return `AI 调用：${task.aiCallCountActual}`;
}

function isMonitorSnapshot(
  value: unknown,
): value is BackgroundTaskMonitorSnapshot {
  if (!value || typeof value !== "object") {
    return false;
  }

  return (
    "schedule" in value && "runningTasks" in value && "recentTasks" in value
  );
}

async function readJson<T>(response: Response) {
  return (await response.json()) as T;
}

function TaskFact({ label, value }: { label: string; value: string }) {
  return (
    <div className={cx(subtleCardClassName, "p-3")}>
      <p className="font-mono text-[11px] font-medium uppercase tracking-[0.22em] text-[var(--muted)]">
        {label}
      </p>
      <p className="mt-2 text-sm leading-6 text-[var(--foreground)]">{value}</p>
    </div>
  );
}

function TaskToneBadge({
  children,
  tone,
}: {
  children: ReactNode;
  tone: "accent" | "danger" | "muted" | "success" | "warning";
}) {
  const toneClassName = {
    accent:
      "border-[color:var(--accent-soft)] bg-[var(--accent-soft)] text-[var(--accent-strong)]",
    danger:
      "border-[color:var(--danger-line)] bg-[var(--danger-surface)] text-[var(--danger-ink)]",
    muted: "border-[color:var(--line)] bg-white text-[var(--muted)]",
    success:
      "border-[color:var(--success-line)] bg-[var(--success-surface)] text-[var(--success-ink)]",
    warning:
      "border-[color:var(--warning-line)] bg-[var(--warning-surface)] text-[var(--warning-ink)]",
  } as const;

  return (
    <span className={cx(chipBaseClassName, toneClassName[tone])}>
      {children}
    </span>
  );
}

function TaskCard({
  cancellable,
  cancellingTaskId,
  emphasis = "normal",
  emptyProgressLabel,
  onCancel,
  task,
}: {
  cancellable: boolean;
  cancellingTaskId: string | null;
  emphasis?: "normal" | "strong";
  emptyProgressLabel: string;
  onCancel: (taskId: string) => Promise<void>;
  task: TaskRunSnapshot;
}) {
  const statusTone =
    task.status === "failed"
      ? "danger"
      : task.status === "running"
        ? "accent"
        : task.status === "succeeded"
          ? "success"
          : task.status === "partial"
            ? "warning"
            : "muted";

  return (
    <article
      className={cx(
        "overflow-hidden rounded-[1.15rem] border p-4 shadow-[var(--shadow-sm)] sm:p-5",
        emphasis === "strong"
          ? "border-[color:var(--line-strong)] bg-white/95"
          : "border-[color:var(--line)] bg-[var(--surface)]",
      )}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-4">
          <div className="space-y-3">
            <h3 className="text-lg font-semibold tracking-[-0.03em] text-[var(--foreground)]">
              {task.label}
            </h3>
            <div className="flex flex-wrap gap-2">
              <TaskToneBadge tone="muted">
                {triggerTypeLabels[task.triggerType]}
              </TaskToneBadge>
              <TaskToneBadge tone={statusTone}>
                {statusLabels[task.status]}
              </TaskToneBadge>
              <TaskToneBadge tone="muted">
                {taskKindLabels[task.kind]}
              </TaskToneBadge>
              {task.cancelRequestedAt ? (
                <TaskToneBadge tone="warning">终止请求已提交</TaskToneBadge>
              ) : null}
            </div>
          </div>

          <p className="text-sm leading-6 text-[var(--foreground)]">
            {task.progressLabel ?? emptyProgressLabel}
          </p>
        </div>

        {cancellable ? (
          <button
            className={secondaryButtonClassName}
            type="button"
            disabled={
              Boolean(task.cancelRequestedAt) || cancellingTaskId === task.id
            }
            onClick={() => void onCancel(task.id)}
          >
            {task.cancelRequestedAt ? "终止中" : "终止任务"}
          </button>
        ) : null}
      </div>

      <div className="mt-4 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
        <TaskFact
          label="AI Calls"
          value={getAiCallLabel(task) ?? "AI 调用：0"}
        />
        <TaskFact label="Started" value={formatDateTime(task.startedAt)} />
        <TaskFact label="Finished" value={formatDateTime(task.finishedAt)} />
        <TaskFact label="Task ID" value={task.id} />
      </div>

      {task.errorSummary ? (
        <StatusBanner className="mt-4 rounded-[1rem] px-4 py-3" tone="error">
          {task.errorSummary}
        </StatusBanner>
      ) : null}
    </article>
  );
}

export function AdminMonitorPanel({
  initialSnapshot,
  embedMode,
  showSchedule = true,
  showScheduleOnly = false,
}: AdminMonitorPanelProps) {
  const { showToast } = useToast();
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [enabled, setEnabled] = useState(initialSnapshot.schedule.enabled);
  const [intervalMinutes, setIntervalMinutes] = useState(
    String(initialSnapshot.schedule.intervalMinutes),
  );
  const [isPending, startTransition] = useTransition();
  const [cancellingTaskId, setCancellingTaskId] = useState<string | null>(null);
  const isScheduleDirtyRef = useRef(false);
  const hasShownRefreshErrorRef = useRef(false);
  const isScheduleDirty =
    enabled !== snapshot.schedule.enabled ||
    intervalMinutes !== String(snapshot.schedule.intervalMinutes);

  isScheduleDirtyRef.current = isScheduleDirty;

  useEffect(() => {
    let disposed = false;

    const refreshSnapshot = async () => {
      try {
        const response = await fetch("/api/admin/monitor");
        const payload = await readJson<
          BackgroundTaskMonitorSnapshot | { error?: string }
        >(response);

        if (disposed) {
          return;
        }

        if (!response.ok || !isMonitorSnapshot(payload)) {
          if (!hasShownRefreshErrorRef.current) {
            showToast("任务监控刷新失败。", "error");
            hasShownRefreshErrorRef.current = true;
          }
          return;
        }

        setSnapshot(payload);
        hasShownRefreshErrorRef.current = false;

        if (!isScheduleDirtyRef.current) {
          setEnabled(payload.schedule.enabled);
          setIntervalMinutes(String(payload.schedule.intervalMinutes));
        }
      } catch {
        if (!disposed) {
          if (!hasShownRefreshErrorRef.current) {
            showToast("任务监控刷新失败。", "error");
            hasShownRefreshErrorRef.current = true;
          }
        }
      }
    };

    const timer = window.setInterval(
      () => {
        void refreshSnapshot();
      },
      snapshot.runningTasks.length > 0 ? 2_500 : 10_000,
    );

    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [showToast, snapshot.runningTasks.length]);

  const saveSchedule = () => {
    startTransition(async () => {
      try {
        const response = await fetch(
          "/api/admin/monitor/schedule/ingestion-default",
          {
            method: "PATCH",
            headers: {
              "content-type": "application/json",
            },
            body: JSON.stringify({
              enabled,
              intervalMinutes: Number(intervalMinutes),
            }),
          },
        );
        const payload = await readJson<SchedulePayload>(response);

        if (!response.ok || payload.error || !payload.schedule) {
          showToast(payload.error ?? "调度配置保存失败。", "error");
          return;
        }

        const schedule = payload.schedule;

        setSnapshot((current) => ({
          ...current,
          schedule,
        }));
        showToast("调度配置已保存。", "success");
      } catch {
        showToast("调度配置保存失败。", "error");
      }
    });
  };

  const cancelTask = async (taskId: string) => {
    setCancellingTaskId(taskId);

    try {
      const response = await fetch(
        `/api/admin/monitor/tasks/${taskId}/cancel`,
        {
          method: "POST",
        },
      );
      const payload = await readJson<CancelPayload>(response);

      if (!response.ok || payload.error || !payload.task) {
        showToast(payload.error ?? "终止任务失败。", "error");
        return;
      }

      setSnapshot((current) => ({
        ...current,
        runningTasks: current.runningTasks.map((task) =>
          task.id === payload.task!.id ? payload.task! : task,
        ),
        recentTasks: current.recentTasks.map((task) =>
          task.id === payload.task!.id ? payload.task! : task,
        ),
      }));
      showToast("终止请求已提交。", "success");
    } catch {
      showToast("终止任务失败。", "error");
    } finally {
      setCancellingTaskId(null);
    }
  };

  const scheduleSection = (
    <section
      aria-labelledby="monitor-schedule-heading"
      className={cx(surfaceCardClassName, "space-y-5 p-4 sm:p-5")}
    >
      <div className="flex flex-col gap-4 border-b border-[color:var(--line)] pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-mono text-[11px] font-medium uppercase tracking-[0.24em] text-[var(--accent-strong)]">
              Default Ingestion
            </p>
            <h2
              id="monitor-schedule-heading"
              className="mt-2 text-lg font-semibold tracking-[-0.03em] text-[var(--foreground)]"
            >
              调度设置
            </h2>
          </div>
          <TaskToneBadge
            tone={snapshot.schedule.enabled ? "success" : "muted"}
          >
            {snapshot.schedule.enabled ? "启用中" : "已停用"}
          </TaskToneBadge>
        </div>

        <p className="text-sm leading-6 text-[var(--muted)]">
          控制默认抓取任务的频率与开关，同时查看调度器健康和下次运行时间。
        </p>
      </div>

      <div className="grid gap-3">
        <label
          className={cx(subtleCardClassName, "flex flex-col gap-3 p-3.5")}
        >
          <span className="font-mono text-[11px] font-medium uppercase tracking-[0.22em] text-[var(--muted)]">
            Interval
          </span>
          <span className="text-sm font-medium text-[var(--foreground)]">
            抓取频率（分钟）
          </span>
          <input
            aria-label="抓取频率（分钟）"
            className={inputClassName}
            min={5}
            type="number"
            value={intervalMinutes}
            onChange={(event) => setIntervalMinutes(event.target.value)}
          />
        </label>

        <label
          className={cx(
            subtleCardClassName,
            "flex cursor-pointer flex-col gap-3 p-3.5",
          )}
        >
          <span className="font-mono text-[11px] font-medium uppercase tracking-[0.22em] text-[var(--muted)]">
            Scheduler
          </span>
          <div className="space-y-2">
            <p className="text-sm font-medium text-[var(--foreground)]">
              启用默认抓取任务
            </p>
            <p className="text-sm leading-6 text-[var(--muted)]">
              停用后不会继续自动拉取新内容，但历史任务记录仍会保留。
            </p>
          </div>
          <span className="inline-flex items-center gap-3">
            <span
              aria-hidden="true"
              className={cx(
                "relative inline-flex h-7 w-12 rounded-full border transition",
                enabled
                  ? "border-[color:var(--accent)] bg-[var(--accent)]"
                  : "border-[color:var(--line)] bg-[var(--surface)]",
              )}
            >
              <span
                className={cx(
                  "absolute left-0.5 top-0.5 h-6 w-6 rounded-full bg-white shadow-[var(--shadow-sm)] transition-transform",
                  enabled ? "translate-x-5" : "translate-x-0",
                )}
              />
            </span>
            <input
              aria-label="启用默认抓取任务"
              checked={enabled}
              className="sr-only"
              type="checkbox"
              onChange={(event) => setEnabled(event.target.checked)}
            />
            <span className="text-sm font-medium text-[var(--foreground)]">
              {enabled ? "当前已启用" : "当前已停用"}
            </span>
          </span>
        </label>
      </div>

      <div className="grid gap-2.5 sm:grid-cols-2">
        <TaskFact
          label="Health"
          value={
            snapshot.schedule.isHeartbeatStale
              ? "调度器离线"
              : "调度器在线"
          }
        />
        <TaskFact
          label="Last Status"
          value={
            snapshot.schedule.lastRunStatus
              ? statusLabels[snapshot.schedule.lastRunStatus]
              : "暂无"
          }
        />
        <TaskFact
          label="Next Run"
          value={formatDateTime(snapshot.schedule.nextRunAt)}
        />
        <TaskFact label="Timezone" value={snapshot.schedule.timezone} />
      </div>

      <div className="flex flex-col gap-3">
        <button
          className={primaryButtonClassName}
          type="button"
          disabled={isPending}
          onClick={saveSchedule}
        >
          保存调度设置
        </button>
      </div>
    </section>
  );

  const tasksSection = (
    <div className="grid gap-4">
      <section
        aria-labelledby="monitor-running-heading"
        className={cx(
          surfaceCardClassName,
          "space-y-5 border-[color:var(--line-strong)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(239,246,255,0.82))] p-4 sm:p-5",
        )}
      >
        <div className="flex flex-col gap-4 border-b border-[color:var(--line)] pb-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-mono text-[11px] font-medium uppercase tracking-[0.24em] text-[var(--accent-strong)]">
                Live Queue
              </p>
              <h2
                id="monitor-running-heading"
                className="mt-2 text-lg font-semibold tracking-[-0.03em] text-[var(--foreground)]"
              >
                运行中任务
              </h2>
            </div>
            <TaskToneBadge
              tone={snapshot.runningTasks.length > 0 ? "accent" : "muted"}
            >
              {snapshot.runningTasks.length > 0
                ? `${snapshot.runningTasks.length} 个活动任务`
                : "队列空闲"}
            </TaskToneBadge>
          </div>

          <p className="text-sm leading-6 text-[var(--muted)]">
            优先展示正在执行或等待终止的任务，保留终止入口与关键运行指标。
          </p>
        </div>

        <div className="grid gap-3">
          {snapshot.runningTasks.length > 0 ? (
            snapshot.runningTasks.map((task) => (
              <TaskCard
                key={task.id}
                cancellable={task.kind === "ingestion"}
                cancellingTaskId={cancellingTaskId}
                emphasis="strong"
                emptyProgressLabel="等待处理"
                task={task}
                onCancel={cancelTask}
              />
            ))
          ) : (
            <div
              className={cx(
                subtleCardClassName,
                "p-4 text-sm leading-6 text-[var(--muted)]",
              )}
            >
              当前没有运行中的后台任务。
            </div>
          )}
        </div>
      </section>

      <section
        aria-labelledby="monitor-recent-heading"
        className={cx(surfaceCardClassName, "space-y-5 p-4 sm:p-5")}
      >
        <div className="flex flex-col gap-4 border-b border-[color:var(--line)] pb-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-mono text-[11px] font-medium uppercase tracking-[0.24em] text-[var(--accent-strong)]">
                Recent Runs
              </p>
              <h2
                id="monitor-recent-heading"
                className="mt-2 text-lg font-semibold tracking-[-0.03em] text-[var(--foreground)]"
              >
                最近任务
              </h2>
            </div>
            <TaskToneBadge tone="muted">
              {snapshot.recentTasks.length} 条记录
            </TaskToneBadge>
          </div>

          <p className="text-sm leading-6 text-[var(--muted)]">
            最近任务沿用与运行中任务一致的状态、触发方式、AI
            调用数和错误摘要样式。
          </p>
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          {snapshot.recentTasks.length > 0 ? (
            snapshot.recentTasks.map((task) => (
              <TaskCard
                key={task.id}
                cancellable={false}
                cancellingTaskId={cancellingTaskId}
                emptyProgressLabel="暂无进度信息"
                task={task}
                onCancel={cancelTask}
              />
            ))
          ) : (
            <div
              className={cx(
                subtleCardClassName,
                "p-4 text-sm leading-6 text-[var(--muted)]",
              )}
            >
              当前还没有后台任务记录。
            </div>
          )}
        </div>
      </section>
    </div>
  );

  const content = (
    <section className="space-y-4">
      <h1 className="sr-only">任务监控</h1>

      {showScheduleOnly ? (
        scheduleSection
      ) : (
        <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)] xl:items-start">
          {showSchedule && scheduleSection}
          {tasksSection}
        </div>
      )}
    </section>
  );

  if (embedMode) {
    return content;
  }

  return (
    <PageShell
      header={{ activeNav: null, isAdmin: true }}
      contentClassName="gap-4 sm:gap-5"
      contentWidth="workspace"
    >
      {content}
    </PageShell>
  );
}

function AdminWorkspaceSidebar({
  activeItem,
}: {
  activeItem: "admin" | "monitor";
}) {
  return (
    <aside
      aria-label="管理导航"
      className={cx(
        surfaceCardClassName,
        "space-y-3 p-3.5 xl:sticky xl:top-24",
      )}
    >
      <nav aria-label="管理页标签" className="space-y-1.5">
        {adminWorkspaceNavItems.map((item) => {
          const isActive = item.key === activeItem;

          return (
            <Link
              key={item.href}
              aria-label={item.label}
              aria-current={isActive ? "page" : undefined}
              className={cx(
                "flex rounded-[1rem] border px-3 py-3 text-left transition",
                isActive
                  ? "border-[color:var(--line-strong)] bg-[var(--surface-highlight)] shadow-[var(--shadow-sm)]"
                  : "border-transparent bg-transparent hover:border-[color:var(--line)] hover:bg-[var(--surface)]",
              )}
              href={item.href}
            >
              <span className="block text-sm font-semibold text-[var(--foreground)]">
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
