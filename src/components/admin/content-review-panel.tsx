"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";

import { PageHeader } from "@/components/ui/page-header";
import { PageShell } from "@/components/ui/page-shell";
import { StatusBanner } from "@/components/ui/status-banner";
import type { ClusterDTO, ReviewItemDTO } from "@/lib/feed/types";
import { cx } from "@/lib/ui/cx";

type ReviewTab = "filtered" | "clusters";
type FeedbackTone = "error" | "info" | "success";
type FeedbackState = {
  tone: FeedbackTone;
  text: string;
} | null;
type RequiredActionField = "cluster" | "taskRun";

type ActionPayload = {
  item?: ReviewItemDTO;
  cluster?: ClusterDTO | null;
  taskRun?: { id: string; kind?: string };
  error?: string;
};

type CollectionPayload = {
  clusters?: ClusterDTO[];
  error?: string;
  items?: ReviewItemDTO[];
};

const tabConfig: Array<{
  description: string;
  key: ReviewTab;
  label: string;
}> = [
  {
    key: "filtered",
    label: "过滤内容",
    description: "重点处理 AI 过滤的单条内容，快速复核来源、时间、原因与质量分。",
  },
  {
    key: "clusters",
    label: "聚合管理",
    description: "检查聚合摘要、预览子条目，并控制聚合组显隐与重生成。",
  },
];

const reviewReasonLabels: Record<NonNullable<ReviewItemDTO["moderationReason"]>, string> = {
  marketing: "营销内容",
  low_quality: "低质量",
  duplicate_noise: "重复噪音",
  rule_blacklist: "规则黑名单",
  other: "其他原因",
};

const clusterStatusLabels: Record<ClusterDTO["status"], string> = {
  active: "显示中",
  hidden: "已隐藏",
};

const surfaceCardClassName =
  "rounded-[1.75rem] border border-[color:var(--line)] bg-white/95 shadow-[var(--shadow-sm)]";
const subtleCardClassName =
  "rounded-[1.5rem] border border-[color:var(--line)] bg-[var(--surface-muted)] shadow-[var(--shadow-sm)]";
const secondaryButtonClassName =
  "inline-flex min-h-11 items-center justify-center rounded-2xl border border-[color:var(--line)] bg-white px-4 py-3 text-sm font-medium text-[var(--foreground)] shadow-[var(--shadow-sm)] transition hover:bg-[var(--surface)] disabled:cursor-not-allowed disabled:opacity-55";
const primaryButtonClassName =
  "inline-flex min-h-11 items-center justify-center rounded-2xl bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-white shadow-[0_16px_32px_rgba(37,99,235,0.2)] transition hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:bg-[var(--accent)]";
const navLinkClassName =
  "inline-flex min-h-11 items-center justify-center rounded-2xl border border-[color:var(--line)] bg-white px-4 py-3 text-sm font-medium text-[var(--foreground)] shadow-[var(--shadow-sm)] transition hover:border-[color:var(--line-strong)] hover:bg-[var(--surface)]";

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Shanghai",
  }).format(new Date(value));
}

function getReviewReasonLabel(reason: ReviewItemDTO["moderationReason"]) {
  if (!reason) {
    return "待复核";
  }

  return reviewReasonLabels[reason];
}

function getResponseError(
  response: Response,
  payload: {
    error?: string;
  },
  fallbackMessage: string,
) {
  if (!response.ok) {
    return payload.error ?? fallbackMessage;
  }

  return payload.error ?? null;
}

export function ContentReviewPanel() {
  const [activeTab, setActiveTab] = useState<ReviewTab>("filtered");
  const [filteredItems, setFilteredItems] = useState<ReviewItemDTO[]>([]);
  const [clusters, setClusters] = useState<ClusterDTO[]>([]);
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;

    startTransition(async () => {
      try {
        const [filteredResponse, clusterResponse] = await Promise.all([
          fetch("/api/admin/items?moderationStatus=filtered"),
          fetch("/api/admin/clusters"),
        ]);

        const filteredPayload = (await filteredResponse.json()) as CollectionPayload;
        const clusterPayload = (await clusterResponse.json()) as CollectionPayload;

        if (cancelled) {
          return;
        }

        const filteredError = getResponseError(filteredResponse, filteredPayload, "审核数据加载失败。");
        const clusterError = getResponseError(clusterResponse, clusterPayload, "审核数据加载失败。");

        if (filteredError) {
          setFeedback({ tone: "error", text: filteredError });
        } else {
          setFilteredItems(filteredPayload.items ?? []);
        }

        if (clusterError) {
          setFeedback({ tone: "error", text: clusterError });
        } else {
          setClusters(clusterPayload.clusters ?? []);
        }
      } catch {
        if (!cancelled) {
          setFeedback({ tone: "error", text: "审核数据加载失败。" });
        }
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const postAction = (
    url: string,
    successMessage: string,
    options?: {
      onSuccess?: (payload: ActionPayload) => void;
      requiredField?: RequiredActionField;
    },
  ) => {
    startTransition(async () => {
      try {
        const response = await fetch(url, { method: "POST" });
        const payload = (await response.json()) as ActionPayload;
        const responseError = getResponseError(response, payload, "操作失败");

        if (responseError) {
          setFeedback({ tone: "error", text: responseError });
          return;
        }

        if (options?.requiredField && !payload[options.requiredField]) {
          setFeedback({ tone: "error", text: "操作失败" });
          return;
        }

        options?.onSuccess?.(payload);
        setFeedback({ tone: "success", text: successMessage });
      } catch {
        setFeedback({ tone: "error", text: "操作失败" });
      }
    });
  };

  const filteredCount = filteredItems.length;
  const clusterCount = clusters.length;
  const hiddenClusterCount = clusters.filter((cluster) => cluster.status === "hidden").length;

  return (
    <PageShell contentClassName="gap-6">
      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_340px]">
        <div className="space-y-6">
          <PageHeader
            eyebrow="Content Review"
            title="内容审核工作台"
            description="将被过滤的内容复核、恢复与聚合结果管理收拢到同一工作台，优先查看来源、时间、质量分和触发原因。"
          />

          <div className="grid gap-4 md:grid-cols-3">
            <article className={cx(subtleCardClassName, "p-5")}>
              <p className="font-mono text-[11px] font-medium uppercase tracking-[0.24em] text-[var(--muted)]">
                Filter Queue
              </p>
              <p className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-[var(--foreground)]">{filteredCount}</p>
              <p className="mt-2 text-sm leading-6 text-[var(--muted)]">等待人工复核的过滤内容数量。</p>
            </article>

            <article className={cx(subtleCardClassName, "p-5")}>
              <p className="font-mono text-[11px] font-medium uppercase tracking-[0.24em] text-[var(--muted)]">
                Cluster Queue
              </p>
              <p className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-[var(--foreground)]">{clusterCount}</p>
              <p className="mt-2 text-sm leading-6 text-[var(--muted)]">当前可操作的聚合结果与摘要工作区。</p>
            </article>

            <article className={cx(subtleCardClassName, "p-5")}>
              <p className="font-mono text-[11px] font-medium uppercase tracking-[0.24em] text-[var(--muted)]">
                Hidden Clusters
              </p>
              <p className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-[var(--foreground)]">{hiddenClusterCount}</p>
              <p className="mt-2 text-sm leading-6 text-[var(--muted)]">可在聚合管理中恢复的隐藏聚合组。</p>
            </article>
          </div>
        </div>

        <aside className={cx(surfaceCardClassName, "flex flex-col gap-5 p-6")}>
          <div>
            <p className="font-mono text-[11px] font-medium uppercase tracking-[0.24em] text-[var(--accent-strong)]">
              Review Toolkit
            </p>
            <h2 className="mt-3 text-xl font-semibold tracking-[-0.03em] text-[var(--foreground)]">后台快捷入口</h2>
            <p className="mt-3 text-sm leading-7 text-[var(--muted)]">
              内容审核页面已经切换到统一后台壳层，常用入口与反馈状态保持一致，方便在审核与监控之间切换。
            </p>
          </div>

          <div className="grid gap-3">
            <Link className={navLinkClassName} href="/">
              返回首页
            </Link>
            <Link className={navLinkClassName} href="/admin/settings">
              后台设置
            </Link>
            <Link className={navLinkClassName} href="/admin/monitor">
              任务监控
            </Link>
          </div>

          <div className="rounded-[1.5rem] border border-dashed border-[color:var(--line)] bg-[var(--surface)] p-4 text-sm leading-7 text-[var(--muted)]">
            过滤内容优先展示来源、发布时间、原因和质量分；聚合管理保留嵌套预览与操作按钮，便于逐条拆分处理。
          </div>
        </aside>
      </section>

      {feedback ? (
        <StatusBanner className="rounded-[1.75rem] px-5 py-4" tone={feedback.tone}>
          {feedback.text}
        </StatusBanner>
      ) : null}

      <section className={cx(surfaceCardClassName, "p-4 sm:p-5")}>
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <p className="font-mono text-[11px] font-medium uppercase tracking-[0.24em] text-[var(--muted)]">Workspace Views</p>
            <h2 className="text-xl font-semibold tracking-[-0.03em] text-[var(--foreground)]">审核视图切换</h2>
            <p className="max-w-2xl text-sm leading-7 text-[var(--muted)]">
              {tabConfig.find((tab) => tab.key === activeTab)?.description}
            </p>
          </div>

          <div
            role="tablist"
            aria-label="内容审核视图"
            className="inline-flex flex-wrap gap-2 rounded-[1.75rem] border border-[color:var(--line)] bg-[var(--surface-muted)] p-2"
          >
            {tabConfig.map((tab) => {
              const tabId = `content-review-tab-${tab.key}`;
              const panelId = `content-review-panel-${tab.key}`;
              const isActive = activeTab === tab.key;

              return (
                <button
                  key={tab.key}
                  id={tabId}
                  role="tab"
                  aria-controls={panelId}
                  aria-selected={isActive}
                  className={cx(
                    "inline-flex min-h-11 items-center justify-center rounded-2xl px-4 py-3 text-sm font-medium transition",
                    isActive
                      ? "bg-[var(--accent)] text-white shadow-[0_12px_24px_rgba(37,99,235,0.18)]"
                      : "bg-white text-[var(--foreground)] shadow-[var(--shadow-sm)] hover:bg-[var(--surface)]",
                  )}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {activeTab === "filtered" ? (
        <section
          id="content-review-panel-filtered"
          role="tabpanel"
          aria-labelledby="content-review-tab-filtered"
          aria-busy={isPending}
          className="space-y-4"
        >
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="font-mono text-[11px] font-medium uppercase tracking-[0.22em] text-[var(--muted)]">Filtered Items</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-[var(--foreground)]">待处理过滤内容</h2>
            </div>
            <div className="rounded-full border border-[color:var(--line)] bg-[var(--surface-muted)] px-3 py-1 font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">
              {filteredCount} items
            </div>
          </div>

          <div className="grid gap-4">
            {filteredItems.map((item) => (
              <article key={item.id} className={cx(surfaceCardClassName, "overflow-hidden p-5 sm:p-6")}>
                <div className="flex flex-col gap-5">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-[color:var(--line)] bg-[var(--surface-muted)] px-3 py-1 text-sm font-medium text-[var(--foreground)]">
                          {item.sourceName}
                        </span>
                        <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">
                          {formatDateTime(item.publishedAt)}
                        </span>
                      </div>
                      <div className="space-y-2">
                        <h3 className="text-xl font-semibold tracking-[-0.03em] text-[var(--foreground)] sm:text-2xl">{item.title}</h3>
                        <p className="text-base leading-7 text-[var(--foreground)]/84">{item.summary}</p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 xl:max-w-[280px] xl:justify-end">
                      <span className="rounded-full border border-[color:var(--line-strong)] bg-[var(--accent-soft)] px-3 py-1 font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--accent-strong)]">
                        原因 {getReviewReasonLabel(item.moderationReason)}
                      </span>
                      <span className="rounded-full border border-[color:var(--line)] bg-[var(--surface-muted)] px-3 py-1 font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--muted)]">
                        质量 {item.qualityScore}
                      </span>
                    </div>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(220px,280px)]">
                    <div className={cx(subtleCardClassName, "p-4")}>
                      <p className="font-mono text-[11px] font-medium uppercase tracking-[0.22em] text-[var(--muted)]">Review Notes</p>
                      <p className="mt-3 text-sm leading-7 text-[var(--muted)]">
                        {item.moderationDetail || item.qualityRationale}
                      </p>
                    </div>

                    <div className={cx(subtleCardClassName, "grid gap-3 p-4 text-sm leading-7 text-[var(--muted)]")}>
                      <div>
                        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.22em] text-[var(--muted)]">Topic</p>
                        <p className="mt-2 text-[var(--foreground)]">{item.topicLabel ?? "未归类主题"}</p>
                      </div>
                      <div>
                        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.22em] text-[var(--muted)]">Original Link</p>
                        <a
                          className="mt-2 inline-flex max-w-full truncate text-[var(--accent)] underline decoration-[rgba(37,99,235,0.28)] underline-offset-4"
                          href={item.originalUrl}
                          rel="noreferrer"
                          target="_blank"
                        >
                          {item.originalUrl}
                        </a>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <button
                      className={primaryButtonClassName}
                      type="button"
                      disabled={isPending}
                      onClick={() =>
                        postAction(`/api/admin/items/${item.id}/restore`, "内容已恢复。", {
                          onSuccess: () => {
                            setFilteredItems((current) => current.filter((entry) => entry.id !== item.id));
                          },
                        })
                      }
                    >
                      恢复内容
                    </button>
                    <button
                      className={secondaryButtonClassName}
                      type="button"
                      disabled={isPending}
                      onClick={() =>
                        postAction(`/api/admin/items/${item.id}/reanalyze`, "已创建后台任务，正在处理中。", {
                          requiredField: "taskRun",
                        })
                      }
                    >
                      重新 AI 判定
                    </button>
                    <button
                      className={secondaryButtonClassName}
                      type="button"
                      onClick={() => setFeedback({ tone: "info", text: "已保持当前过滤状态。" })}
                    >
                      保持过滤
                    </button>
                  </div>
                </div>
              </article>
            ))}

            {filteredCount === 0 ? (
              <div className="rounded-[1.75rem] border border-dashed border-[color:var(--line)] bg-[var(--surface)] px-5 py-8 text-sm leading-7 text-[var(--muted)]">
                当前没有待处理的过滤内容。
              </div>
            ) : null}
          </div>
        </section>
      ) : (
        <section
          id="content-review-panel-clusters"
          role="tabpanel"
          aria-labelledby="content-review-tab-clusters"
          aria-busy={isPending}
          className="space-y-4"
        >
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="font-mono text-[11px] font-medium uppercase tracking-[0.22em] text-[var(--muted)]">Cluster Management</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-[var(--foreground)]">聚合结果管理</h2>
            </div>
            <div className="rounded-full border border-[color:var(--line)] bg-[var(--surface-muted)] px-3 py-1 font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">
              {clusterCount} clusters
            </div>
          </div>

          <div className="grid gap-4">
            {clusters.map((cluster) => (
              <article key={cluster.id} className={cx(surfaceCardClassName, "p-5 sm:p-6")}>
                <div className="flex flex-col gap-5">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-[color:var(--line)] bg-[var(--surface-muted)] px-3 py-1 text-sm font-medium text-[var(--foreground)]">
                          {cluster.itemCount} 条内容
                        </span>
                        <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">
                          {formatDateTime(cluster.latestPublishedAt)}
                        </span>
                      </div>
                      <div className="space-y-2">
                        <h3 className="text-xl font-semibold tracking-[-0.03em] text-[var(--foreground)] sm:text-2xl">{cluster.title}</h3>
                        <p className="text-base leading-7 text-[var(--foreground)]/84">{cluster.summary}</p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 xl:max-w-[280px] xl:justify-end">
                      <span className="rounded-full border border-[color:var(--line-strong)] bg-[var(--accent-soft)] px-3 py-1 font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--accent-strong)]">
                        {clusterStatusLabels[cluster.status]}
                      </span>
                      <span className="rounded-full border border-[color:var(--line)] bg-[var(--surface-muted)] px-3 py-1 font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--muted)]">
                        质量 {cluster.score}
                      </span>
                    </div>
                  </div>

                  <div className="grid gap-3">
                    {cluster.items.map((item) => (
                      <div key={item.id} className={cx(subtleCardClassName, "grid gap-4 p-4")}>
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                          <div className="space-y-2">
                            <strong className="block text-base font-semibold text-[var(--foreground)]">{item.title}</strong>
                            <div className="flex flex-wrap items-center gap-2 text-sm text-[var(--muted)]">
                              <span>{item.sourceName}</span>
                              <span className="font-mono text-[11px] uppercase tracking-[0.18em]">{formatDateTime(item.publishedAt)}</span>
                            </div>
                          </div>
                          <button
                            className={secondaryButtonClassName}
                            type="button"
                            disabled={isPending}
                            onClick={() =>
                              postAction(`/api/admin/clusters/${cluster.id}/items/${item.id}/detach`, "已移出聚合组。", {
                                requiredField: "cluster",
                                onSuccess: (payload) => {
                                  setClusters((current) =>
                                    current.map((entry) => (entry.id === cluster.id ? payload.cluster ?? entry : entry)),
                                  );
                                },
                              })
                            }
                          >
                            移出条目
                          </button>
                        </div>
                        <p className="text-sm leading-7 text-[var(--muted)]">{item.summary}</p>
                      </div>
                    ))}
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <button
                      className={secondaryButtonClassName}
                      type="button"
                      disabled={isPending}
                      onClick={() =>
                        postAction(`/api/admin/clusters/${cluster.id}/regenerate-summary`, "已创建后台任务，正在处理中。", {
                          requiredField: "taskRun",
                        })
                      }
                    >
                      重新生成聚合摘要
                    </button>
                    {cluster.status === "hidden" ? (
                      <button
                        className={primaryButtonClassName}
                        type="button"
                        disabled={isPending}
                        onClick={() =>
                          postAction(`/api/admin/clusters/${cluster.id}/restore`, "聚合组已恢复。", {
                            requiredField: "cluster",
                            onSuccess: (payload) => {
                              setClusters((current) =>
                                current.map((entry) => (entry.id === cluster.id ? payload.cluster ?? entry : entry)),
                              );
                            },
                          })
                        }
                      >
                        恢复聚合组
                      </button>
                    ) : (
                      <button
                        className={primaryButtonClassName}
                        type="button"
                        disabled={isPending}
                        onClick={() =>
                          postAction(`/api/admin/clusters/${cluster.id}/hide`, "聚合组已隐藏。", {
                            requiredField: "cluster",
                            onSuccess: (payload) => {
                              setClusters((current) =>
                                current.map((entry) => (entry.id === cluster.id ? payload.cluster ?? entry : entry)),
                              );
                            },
                          })
                        }
                      >
                        隐藏聚合组
                      </button>
                    )}
                  </div>
                </div>
              </article>
            ))}

            {clusterCount === 0 ? (
              <div className="rounded-[1.75rem] border border-dashed border-[color:var(--line)] bg-[var(--surface)] px-5 py-8 text-sm leading-7 text-[var(--muted)]">
                当前没有可管理的聚合结果。
              </div>
            ) : null}
          </div>
        </section>
      )}
    </PageShell>
  );
}
