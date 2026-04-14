"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";

import styles from "@/components/admin/admin.module.css";
import type { BackgroundTaskMonitorSnapshot } from "@/lib/tasks/types";

type AdminMonitorPanelProps = {
  initialSnapshot: BackgroundTaskMonitorSnapshot;
};

function getAiCallLabel(task: BackgroundTaskMonitorSnapshot["recentTasks"][number]) {
  if (task.aiCallCountActual <= 0 && task.aiCallCountEstimated <= 0) {
    return null;
  }

  if (task.aiCallCountEstimated > 0) {
    return `AI 调用：${task.aiCallCountActual} / ${task.aiCallCountEstimated}`;
  }

  return `AI 调用：${task.aiCallCountActual}`;
}

export function AdminMonitorPanel({ initialSnapshot }: AdminMonitorPanelProps) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [enabled, setEnabled] = useState(initialSnapshot.schedule.enabled);
  const [intervalMinutes, setIntervalMinutes] = useState(String(initialSnapshot.schedule.intervalMinutes));
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [cancellingTaskId, setCancellingTaskId] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setInterval(async () => {
      const response = await fetch("/api/admin/monitor");
      const payload = (await response.json()) as BackgroundTaskMonitorSnapshot;
      setSnapshot(payload);
      setEnabled(payload.schedule.enabled);
      setIntervalMinutes(String(payload.schedule.intervalMinutes));
    }, snapshot.runningTasks.length > 0 ? 2_500 : 10_000);

    return () => window.clearInterval(timer);
  }, [snapshot.runningTasks.length]);

  const saveSchedule = () => {
    startTransition(async () => {
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
      const payload = (await response.json()) as { schedule?: BackgroundTaskMonitorSnapshot["schedule"]; error?: string };

      if (!response.ok || payload.error || !payload.schedule) {
        setMessage(payload.error ?? "调度配置保存失败。");
        return;
      }

      setSnapshot((current) => ({
        ...current,
        schedule: payload.schedule!,
      }));
      setMessage("调度配置已保存。");
    });
  };

  const cancelTask = async (taskId: string) => {
    setCancellingTaskId(taskId);

    try {
      const response = await fetch(`/api/admin/monitor/tasks/${taskId}/cancel`, {
        method: "POST",
      });
      const payload = (await response.json()) as { task?: BackgroundTaskMonitorSnapshot["runningTasks"][number]; error?: string };

      if (!response.ok || payload.error || !payload.task) {
        setMessage(payload.error ?? "终止任务失败。");
        return;
      }

      setSnapshot((current) => ({
        ...current,
        runningTasks: current.runningTasks.map((task) => (task.id === payload.task!.id ? payload.task! : task)),
        recentTasks: current.recentTasks.map((task) => (task.id === payload.task!.id ? payload.task! : task)),
      }));
      setMessage("终止请求已提交。");
    } finally {
      setCancellingTaskId(null);
    }
  };

  return (
    <div className={styles.settingsShell}>
      <div className={styles.toolbar}>
        <div>
          <div className={styles.kicker}>Task Monitor</div>
          <h1 className={styles.title}>任务监控</h1>
          <p className={styles.description}>查看默认抓取调度状态、当前运行中任务以及最近的后台任务执行记录。</p>
        </div>
        <div className={styles.toolbarActions}>
          <Link className={styles.linkButton} href="/">
            返回首页
          </Link>
          <Link className={styles.linkButton} href="/admin/settings">
            后台设置
          </Link>
          <Link className={styles.linkButton} href="/admin/content">
            内容审核
          </Link>
        </div>
      </div>

      {message ? <p className={styles.message}>{message}</p> : null}

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>默认抓取任务</h2>
        <div className={styles.formGrid}>
          <label className={styles.field}>
            <span>抓取频率（分钟）</span>
            <input
              aria-label="抓取频率（分钟）"
              className={styles.input}
              min={5}
              type="number"
              value={intervalMinutes}
              onChange={(event) => setIntervalMinutes(event.target.value)}
            />
          </label>
          <label className={styles.checkbox}>
            <input
              aria-label="启用默认抓取任务"
              checked={enabled}
              type="checkbox"
              onChange={(event) => setEnabled(event.target.checked)}
            />
            启用默认抓取任务
          </label>
        </div>
        <div className={styles.list}>
          <div className={styles.row}>调度状态：{snapshot.schedule.enabled ? "启用" : "停用"}</div>
          <div className={styles.row}>调度器健康：{snapshot.schedule.isHeartbeatStale ? "离线" : "在线"}</div>
          <div className={styles.row}>最近执行状态：{snapshot.schedule.lastRunStatus ?? "暂无"}</div>
          <div className={styles.row}>下次执行时间：{snapshot.schedule.nextRunAt}</div>
        </div>
        <div className={styles.inlineActions}>
          <button className={styles.primaryButton} type="button" disabled={isPending} onClick={saveSchedule}>
            保存调度设置
          </button>
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>当前运行中任务</h2>
        <div className={styles.list}>
          {snapshot.runningTasks.length > 0 ? (
            snapshot.runningTasks.map((task) => (
              <article key={task.id} className={styles.reviewCard}>
                <div className={styles.reviewHeader}>
                  <div>
                    <h3 className={styles.reviewTitle}>{task.label}</h3>
                    <p className={styles.reviewMeta}>
                      {task.triggerType} · {task.status}
                    </p>
                  </div>
                  {task.kind === "ingestion" ? (
                    <button
                      className={styles.secondaryButton}
                      type="button"
                      disabled={Boolean(task.cancelRequestedAt) || cancellingTaskId === task.id}
                      onClick={() => void cancelTask(task.id)}
                    >
                      {task.cancelRequestedAt ? "终止中" : "终止任务"}
                    </button>
                  ) : null}
                </div>
                <p className={styles.reviewSummary}>{task.progressLabel ?? "等待处理"}</p>
                {getAiCallLabel(task) ? <p className={styles.reviewDetail}>{getAiCallLabel(task)}</p> : null}
                {task.errorSummary ? <p className={styles.reviewDetail}>{task.errorSummary}</p> : null}
              </article>
            ))
          ) : (
            <div className={styles.emptyState}>当前没有运行中的后台任务。</div>
          )}
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>最近任务</h2>
        <div className={styles.list}>
          {snapshot.recentTasks.length > 0 ? (
            snapshot.recentTasks.map((task) => (
              <article key={task.id} className={styles.reviewCard}>
                <div className={styles.reviewHeader}>
                  <div>
                    <h3 className={styles.reviewTitle}>{task.label}</h3>
                    <p className={styles.reviewMeta}>
                      {task.triggerType} · {task.status}
                    </p>
                  </div>
                </div>
                <p className={styles.reviewSummary}>{task.progressLabel ?? "暂无进度信息"}</p>
                {getAiCallLabel(task) ? <p className={styles.reviewDetail}>{getAiCallLabel(task)}</p> : null}
                {task.errorSummary ? <p className={styles.reviewDetail}>{task.errorSummary}</p> : null}
              </article>
            ))
          ) : (
            <div className={styles.emptyState}>当前还没有后台任务记录。</div>
          )}
        </div>
      </section>
    </div>
  );
}
