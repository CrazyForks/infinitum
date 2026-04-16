"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useRef, useState, useTransition } from "react";

import { PageHeader } from "@/components/ui/page-header";
import { PageShell } from "@/components/ui/page-shell";
import { StatusBanner } from "@/components/ui/status-banner";
import type { BackgroundTaskMonitorSnapshot, TaskRunSnapshot } from "@/lib/tasks/types";
import { cx } from "@/lib/ui/cx";

type AdminMonitorPanelProps = {
  initialSnapshot: BackgroundTaskMonitorSnapshot;
};

type FeedbackTone = "error" | "info" | "success";
type FeedbackState = {
  text: string;
  tone: FeedbackTone;
} | null;

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
  "rounded-[1.75rem] border border-[color:var(--line)] bg-white/95 shadow-[var(--shadow-sm)]";
const subtleCardClassName =
  "rounded-[1.5rem] border border-[color:var(--line)] bg-[var(--surface-muted)] shadow-[var(--shadow-sm)]";
const navLinkClassName =
  "inline-flex min-h-11 items-center justify-center rounded-2xl border border-[color:var(--line)] bg-white px-4 py-3 text-sm font-medium text-[var(--foreground)] shadow-[var(--shadow-sm)] transition hover:border-[color:var(--line-strong)] hover:bg-[var(--surface)]";
const primaryButtonClassName =
  "inline-flex min-h-11 items-center justify-center rounded-2xl bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-white shadow-[0_16px_32px_rgba(37,99,235,0.2)] transition hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:bg-[var(--accent)]";
const secondaryButtonClassName =
  "inline-flex min-h-11 items-center justify-center rounded-2xl border border-[color:var(--line)] bg-white px-4 py-3 text-sm font-medium text-[var(--foreground)] shadow-[var(--shadow-sm)] transition hover:bg-[var(--surface)] disabled:cursor-not-allowed disabled:opacity-55";
const inputClassName =
  "min-h-12 rounded-2xl border border-[color:var(--line)] bg-white px-4 py-3 text-base text-[var(--foreground)] outline-none transition placeholder:text-[var(--muted)] focus:border-[color:var(--accent)] focus:ring-4 focus:ring-[color:var(--accent-soft)]";
const chipBaseClassName =
  "inline-flex items-center rounded-full border px-3 py-1 font-mono text-[11px] font-medium uppercase tracking-[0.2em]";

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

function isMonitorSnapshot(value: unknown): value is BackgroundTaskMonitorSnapshot {
  if (!value || typeof value !== "object") {
    return false;
  }

  return "schedule" in value && "runningTasks" in value && "recentTasks" in value;
}

async function readJson<T>(response: Response) {
  return (await response.json()) as T;
}

function SummaryMetric({ label, note, value }: { label: string; note: string; value: ReactNode }) {
  return (
    <article className={cx(subtleCardClassName, "p-5")}>
      <p className="font-mono text-[11px] font-medium uppercase tracking-[0.24em] text-[var(--muted)]">{label}</p>
      <p className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-[var(--foreground)]">{value}</p>
      <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{note}</p>
    </article>
  );
}

function TaskFact({ label, value }: { label: string; value: string }) {
  return (
    <div className={cx(subtleCardClassName, "p-4")}>
      <p className="font-mono text-[11px] font-medium uppercase tracking-[0.22em] text-[var(--muted)]">{label}</p>
      <p className="mt-3 text-sm leading-7 text-[var(--foreground)]">{value}</p>
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
    accent: "border-[color:var(--accent-soft)] bg-[var(--accent-soft)] text-[var(--accent-strong)]",
    danger: "border-[color:var(--danger-line)] bg-[var(--danger-surface)] text-[var(--danger-ink)]",
    muted: "border-[color:var(--line)] bg-white text-[var(--muted)]",
    success: "border-[color:var(--success-line)] bg-[var(--success-surface)] text-[var(--success-ink)]",
    warning: "border-[color:var(--warning-line)] bg-[var(--warning-surface)] text-[var(--warning-ink)]",
  } as const;

  return <span className={cx(chipBaseClassName, toneClassName[tone])}>{children}</span>;
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
        "overflow-hidden rounded-[1.5rem] border p-5 shadow-[var(--shadow-sm)] sm:p-6",
        emphasis === "strong"
          ? "border-[color:var(--line-strong)] bg-white/95"
          : "border-[color:var(--line)] bg-[var(--surface)]",
      )}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-4">
          <div className="space-y-3">
            <h3 className="text-xl font-semibold tracking-[-0.03em] text-[var(--foreground)]">{task.label}</h3>
            <div className="flex flex-wrap gap-2">
              <TaskToneBadge tone="muted">{triggerTypeLabels[task.triggerType]}</TaskToneBadge>
              <TaskToneBadge tone={statusTone}>{statusLabels[task.status]}</TaskToneBadge>
              <TaskToneBadge tone="muted">{taskKindLabels[task.kind]}</TaskToneBadge>
              {task.cancelRequestedAt ? <TaskToneBadge tone="warning">终止请求已提交</TaskToneBadge> : null}
            </div>
          </div>

          <p className="text-sm leading-7 text-[var(--foreground)]">{task.progressLabel ?? emptyProgressLabel}</p>
        </div>

        {cancellable ? (
          <button
            className={secondaryButtonClassName}
            type="button"
            disabled={Boolean(task.cancelRequestedAt) || cancellingTaskId === task.id}
            onClick={() => void onCancel(task.id)}
          >
            {task.cancelRequestedAt ? "终止中" : "终止任务"}
          </button>
        ) : null}
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <TaskFact label="AI Calls" value={getAiCallLabel(task) ?? "AI 调用：0"} />
        <TaskFact label="Started" value={formatDateTime(task.startedAt)} />
        <TaskFact label="Finished" value={formatDateTime(task.finishedAt)} />
        <TaskFact label="Task ID" value={task.id} />
      </div>

      {task.errorSummary ? (
        <StatusBanner className="mt-4 rounded-[1.25rem] px-4 py-3" tone="error">
          {task.errorSummary}
        </StatusBanner>
      ) : null}
    </article>
  );
}

export function AdminMonitorPanel({ initialSnapshot }: AdminMonitorPanelProps) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [enabled, setEnabled] = useState(initialSnapshot.schedule.enabled);
  const [intervalMinutes, setIntervalMinutes] = useState(String(initialSnapshot.schedule.intervalMinutes));
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [isPending, startTransition] = useTransition();
  const [cancellingTaskId, setCancellingTaskId] = useState<string | null>(null);
  const isScheduleDirtyRef = useRef(false);
  const isScheduleDirty =
    enabled !== snapshot.schedule.enabled || intervalMinutes !== String(snapshot.schedule.intervalMinutes);

  isScheduleDirtyRef.current = isScheduleDirty;

  useEffect(() => {
    let disposed = false;

    const refreshSnapshot = async () => {
      try {
        const response = await fetch("/api/admin/monitor");
        const payload = await readJson<BackgroundTaskMonitorSnapshot | { error?: string }>(response);

        if (disposed) {
          return;
        }

        if (!response.ok || !isMonitorSnapshot(payload)) {
          setFeedback((current) => current ?? { tone: "error", text: "任务监控刷新失败。" });
          return;
        }

        setSnapshot(payload);

        if (!isScheduleDirtyRef.current) {
          setEnabled(payload.schedule.enabled);
          setIntervalMinutes(String(payload.schedule.intervalMinutes));
        }
      } catch {
        if (!disposed) {
          setFeedback((current) => current ?? { tone: "error", text: "任务监控刷新失败。" });
        }
      }
    };

    const timer = window.setInterval(() => {
      void refreshSnapshot();
    }, snapshot.runningTasks.length > 0 ? 2_500 : 10_000);

    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [snapshot.runningTasks.length]);

  const saveSchedule = () => {
    startTransition(async () => {
      try {
        const response = await fetch("/api/admin/monitor/schedule/ingestion-default", {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            enabled,
            intervalMinutes: Number(intervalMinutes),
          }),
        });
        const payload = await readJson<SchedulePayload>(response);

        if (!response.ok || payload.error || !payload.schedule) {
          setFeedback({ tone: "error", text: payload.error ?? "调度配置保存失败。" });
          return;
        }

        const schedule = payload.schedule;

        setSnapshot((current) => ({
          ...current,
          schedule,
        }));
        setFeedback({ tone: "success", text: "调度配置已保存。" });
      } catch {
        setFeedback({ tone: "error", text: "调度配置保存失败。" });
      }
    });
  };

  const cancelTask = async (taskId: string) => {
    setCancellingTaskId(taskId);

    try {
      const response = await fetch(`/api/admin/monitor/tasks/${taskId}/cancel`, {
        method: "POST",
      });
      const payload = await readJson<CancelPayload>(response);

      if (!response.ok || payload.error || !payload.task) {
        setFeedback({ tone: "error", text: payload.error ?? "终止任务失败。" });
        return;
      }

      setSnapshot((current) => ({
        ...current,
        runningTasks: current.runningTasks.map((task) => (task.id === payload.task!.id ? payload.task! : task)),
        recentTasks: current.recentTasks.map((task) => (task.id === payload.task!.id ? payload.task! : task)),
      }));
      setFeedback({ tone: "success", text: "终止请求已提交。" });
    } catch {
      setFeedback({ tone: "error", text: "终止任务失败。" });
    } finally {
      setCancellingTaskId(null);
    }
  };

  return (
    <PageShell contentClassName="gap-6">
      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_340px]">
        <div className="space-y-6">
          <PageHeader
            eyebrow="Task Monitor"
            title="任务监控"
            description="查看默认抓取调度状态、当前运行中任务以及最近的后台任务执行记录，运行中队列会保持高频轮询。"
          />

          <div className="grid gap-4 md:grid-cols-3">
            <SummaryMetric
              label="Scheduler"
              note="默认抓取调度的启停状态与下一次执行时间。"
              value={snapshot.schedule.enabled ? "启用" : "停用"}
            />
            <SummaryMetric label="Running Tasks" note="当前执行中的后台任务数量。" value={snapshot.runningTasks.length} />
            <SummaryMetric label="Recent Tasks" note="最近一次轮询返回的任务记录数量。" value={snapshot.recentTasks.length} />
          </div>
        </div>

        <aside className={cx(surfaceCardClassName, "flex flex-col gap-5 p-6")}>
          <div>
            <p className="font-mono text-[11px] font-medium uppercase tracking-[0.24em] text-[var(--accent-strong)]">
              Monitor Toolkit
            </p>
            <h2 className="mt-3 text-xl font-semibold tracking-[-0.03em] text-[var(--foreground)]">后台快捷入口</h2>
            <p className="mt-3 text-sm leading-7 text-[var(--muted)]">
              监控页已经迁移到统一后台壳层，和登录、Feed、内容审核保持同一套产品化后台视觉与反馈模式。
            </p>
          </div>

          <div className="grid gap-3">
            <Link className={navLinkClassName} href="/">
              返回首页
            </Link>
            <Link className={navLinkClassName} href="/admin/settings">
              后台设置
            </Link>
            <Link className={navLinkClassName} href="/admin/content">
              内容审核
            </Link>
          </div>

          <div className="rounded-[1.5rem] border border-dashed border-[color:var(--line)] bg-[var(--surface)] p-4 text-sm leading-7 text-[var(--muted)]">
            轮询频率保持原有行为：有运行中任务时每 2.5 秒刷新，否则每 10 秒刷新。保存调度与终止任务失败时会给出基础反馈。
          </div>
        </aside>
      </section>

      {feedback ? (
        <StatusBanner className="rounded-[1.75rem] px-5 py-4" tone={feedback.tone}>
          {feedback.text}
        </StatusBanner>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
        <section aria-labelledby="monitor-schedule-heading" className={cx(surfaceCardClassName, "p-6 sm:p-7")}>
          <div className="flex flex-col gap-4 border-b border-[color:var(--line)] pb-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-mono text-[11px] font-medium uppercase tracking-[0.24em] text-[var(--accent-strong)]">
                  Default Ingestion
                </p>
                <h2 id="monitor-schedule-heading" className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-[var(--foreground)]">
                  调度设置
                </h2>
              </div>
              <TaskToneBadge tone={snapshot.schedule.enabled ? "success" : "muted"}>
                {snapshot.schedule.enabled ? "启用中" : "已停用"}
              </TaskToneBadge>
            </div>

            <p className="text-sm leading-7 text-[var(--muted)]">
              控制默认抓取任务的频率与开关，同时查看调度器健康、最近执行结果和下次运行时间。
            </p>
          </div>

          <div className="mt-6 grid gap-4">
            <label className={cx(subtleCardClassName, "flex flex-col gap-3 p-4")}>
              <span className="font-mono text-[11px] font-medium uppercase tracking-[0.22em] text-[var(--muted)]">
                Interval
              </span>
              <span className="text-base font-medium text-[var(--foreground)]">抓取频率（分钟）</span>
              <input
                aria-label="抓取频率（分钟）"
                className={inputClassName}
                min={5}
                type="number"
                value={intervalMinutes}
                onChange={(event) => setIntervalMinutes(event.target.value)}
              />
            </label>

            <label className={cx(subtleCardClassName, "flex cursor-pointer flex-col gap-4 p-4")}>
              <span className="font-mono text-[11px] font-medium uppercase tracking-[0.22em] text-[var(--muted)]">Scheduler</span>
              <div className="space-y-2">
                <p className="text-base font-medium text-[var(--foreground)]">启用默认抓取任务</p>
                <p className="text-sm leading-7 text-[var(--muted)]">停用后不会继续自动拉取新内容，但历史任务记录仍会保留。</p>
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
                <span className="text-sm font-medium text-[var(--foreground)]">{enabled ? "当前已启用" : "当前已停用"}</span>
              </span>
            </label>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <TaskFact label="Health" value={snapshot.schedule.isHeartbeatStale ? "调度器离线" : "调度器在线"} />
            <TaskFact label="Last Status" value={snapshot.schedule.lastRunStatus ? statusLabels[snapshot.schedule.lastRunStatus] : "暂无"} />
            <TaskFact label="Next Run" value={formatDateTime(snapshot.schedule.nextRunAt)} />
            <TaskFact label="Timezone" value={snapshot.schedule.timezone} />
          </div>

          <div className="mt-6 flex flex-col gap-3">
            <button className={primaryButtonClassName} type="button" disabled={isPending} onClick={saveSchedule}>
              保存调度设置
            </button>
          </div>
        </section>

        <section
          aria-labelledby="monitor-running-heading"
          className={cx(
            surfaceCardClassName,
            "border-[color:var(--line-strong)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(239,246,255,0.9))] p-6 sm:p-7",
          )}
        >
          <div className="flex flex-col gap-4 border-b border-[color:var(--line)] pb-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-mono text-[11px] font-medium uppercase tracking-[0.24em] text-[var(--accent-strong)]">
                  Live Queue
                </p>
                <h2 id="monitor-running-heading" className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-[var(--foreground)]">
                  运行中任务
                </h2>
              </div>
              <TaskToneBadge tone={snapshot.runningTasks.length > 0 ? "accent" : "muted"}>
                {snapshot.runningTasks.length > 0 ? `${snapshot.runningTasks.length} 个活动任务` : "队列空闲"}
              </TaskToneBadge>
            </div>

            <p className="text-sm leading-7 text-[var(--muted)]">优先展示正在执行或等待终止的任务，保留终止入口与关键运行指标。</p>
          </div>

          <div className="mt-6 grid gap-4">
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
              <div className={cx(subtleCardClassName, "p-5 text-sm leading-7 text-[var(--muted)]")}>当前没有运行中的后台任务。</div>
            )}
          </div>
        </section>
      </div>

      <section aria-labelledby="monitor-recent-heading" className={cx(surfaceCardClassName, "p-6 sm:p-7")}>
        <div className="flex flex-col gap-4 border-b border-[color:var(--line)] pb-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-mono text-[11px] font-medium uppercase tracking-[0.24em] text-[var(--accent-strong)]">Recent Runs</p>
              <h2 id="monitor-recent-heading" className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-[var(--foreground)]">
                最近任务
              </h2>
            </div>
            <TaskToneBadge tone="muted">{snapshot.recentTasks.length} 条记录</TaskToneBadge>
          </div>

          <p className="text-sm leading-7 text-[var(--muted)]">最近任务沿用与运行中任务一致的状态、触发方式、AI 调用数和错误摘要样式。</p>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
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
            <div className={cx(subtleCardClassName, "p-5 text-sm leading-7 text-[var(--muted)]")}>当前还没有后台任务记录。</div>
          )}
        </div>
      </section>
    </PageShell>
  );
}
