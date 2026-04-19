"use client";

import { useEffect, useState, useTransition } from "react";

import { PageShell } from "@/components/ui/page-shell";
import { StatusBanner } from "@/components/ui/status-banner";
import { FilterInput } from "@/components/ui/filter-input";
import { FilterSelect } from "@/components/ui/filter-select";
import { FilterSummary } from "@/components/ui/filter-summary";
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
  key: ReviewTab;
  label: string;
}> = [
  {
    key: "filtered",
    label: "过滤内容",
  },
  {
    key: "clusters",
    label: "聚合管理",
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
  "rounded-[1.1rem] border border-[color:var(--line)] bg-white/96 shadow-[var(--shadow-sm)]";
const subtleCardClassName =
  "rounded-[0.95rem] border border-[color:var(--line)] bg-[var(--surface-muted)]/82 shadow-[var(--shadow-sm)]";
const secondaryButtonClassName =
  "inline-flex min-h-8 items-center justify-center rounded-[0.8rem] border border-[color:var(--line)] bg-white px-2.5 py-1.5 text-[13px] font-medium text-[var(--foreground)] shadow-[var(--shadow-sm)] transition hover:bg-[var(--surface)] disabled:cursor-not-allowed disabled:opacity-55";
const primaryButtonClassName =
  "inline-flex min-h-8 items-center justify-center rounded-[0.8rem] bg-[var(--accent)] px-2.5 py-1.5 text-[13px] font-semibold text-white shadow-[0_14px_24px_rgba(37,99,235,0.16)] transition hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:bg-[var(--accent)]";

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

function truncateText(value: string | null | undefined, maxLength: number) {
  if (!value) {
    return "暂无摘要。";
  }

  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength).trimEnd()}...`;
}

function ContentReviewContent() {
  const [activeTab, setActiveTab] = useState<ReviewTab>("filtered");
  const [filteredItems, setFilteredItems] = useState<ReviewItemDTO[]>([]);
  const [clusters, setClusters] = useState<ClusterDTO[]>([]);
  const [filteredSearch, setFilteredSearch] = useState("");
  const [filteredSource, setFilteredSource] = useState("");
  const [filteredReason, setFilteredReason] = useState("");
  const [clusterSearch, setClusterSearch] = useState("");
  const [clusterStatus, setClusterStatus] = useState<ClusterDTO["status"] | "">("");
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
  const filteredSources = Array.from(new Set(filteredItems.map((item) => item.sourceName))).sort((left, right) =>
    left.localeCompare(right),
  );
  const visibleFilteredItems = filteredItems.filter((item) => {
    const keyword = filteredSearch.trim().toLowerCase();
    const matchesKeyword =
      !keyword ||
      item.title.toLowerCase().includes(keyword) ||
      (item.summary ?? "").toLowerCase().includes(keyword) ||
      (item.moderationDetail ?? "").toLowerCase().includes(keyword);
    const matchesSource = !filteredSource || item.sourceName === filteredSource;
    const matchesReason = !filteredReason || item.moderationReason === filteredReason;

    return matchesKeyword && matchesSource && matchesReason;
  });
  const visibleClusters = clusters.filter((cluster) => {
    const keyword = clusterSearch.trim().toLowerCase();
    const matchesKeyword =
      !keyword ||
      cluster.title.toLowerCase().includes(keyword) ||
      (cluster.summary ?? "").toLowerCase().includes(keyword) ||
      cluster.items.some(
        (item) =>
          item.title.toLowerCase().includes(keyword) ||
          (item.summary ?? "").toLowerCase().includes(keyword) ||
          item.sourceName.toLowerCase().includes(keyword),
      );
    const matchesStatus = !clusterStatus || cluster.status === clusterStatus;

    return matchesKeyword && matchesStatus;
  });
  const currentResultCount = activeTab === "filtered" ? visibleFilteredItems.length : visibleClusters.length;
  const activeFilterSummary =
    activeTab === "filtered"
      ? [
          filteredSearch.trim() ? `关键词：${filteredSearch.trim()}` : null,
          filteredSource ? `来源：${filteredSource}` : null,
          filteredReason ? `原因：${reviewReasonLabels[filteredReason as keyof typeof reviewReasonLabels]}` : null,
        ].filter((item): item is string => Boolean(item))
      : [
          clusterSearch.trim() ? `关键词：${clusterSearch.trim()}` : null,
          clusterStatus ? `状态：${clusterStatusLabels[clusterStatus]}` : null,
        ].filter((item): item is string => Boolean(item));
  const clearActiveFilters = () => {
    if (activeTab === "filtered") {
      setFilteredSearch("");
      setFilteredSource("");
      setFilteredReason("");
      return;
    }

    setClusterSearch("");
    setClusterStatus("");
  };

  return (
    <>
      {feedback ? (
        <StatusBanner className="rounded-[1.25rem] px-4 py-3" tone={feedback.tone}>
          {feedback.text}
        </StatusBanner>
      ) : null}

      <section className={cx(surfaceCardClassName, "px-3 py-2.5")}>
        <div role="toolbar" aria-label="审核工具条" className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <div
              role="tablist"
              aria-label="内容审核视图"
              className="inline-flex flex-wrap gap-1.5 rounded-[0.9rem] border border-[color:var(--line)] bg-[var(--surface-muted)]/80 p-1"
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
                      "inline-flex min-h-8 items-center justify-center rounded-[0.75rem] px-2.5 py-1.5 text-sm font-medium transition",
                      isActive
                        ? "bg-[var(--accent)] text-white shadow-[0_10px_18px_rgba(37,99,235,0.14)]"
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

          <div className="flex flex-wrap items-center gap-1.5 text-xs text-[var(--muted)]">
            <span className="rounded-full border border-[color:var(--line)] bg-[var(--surface-muted)]/72 px-2.5 py-1">
              过滤 {filteredCount}
            </span>
            <span className="rounded-full border border-[color:var(--line)] bg-[var(--surface-muted)]/72 px-2.5 py-1">
              聚合 {clusterCount}
            </span>
          </div>
        </div>
      </section>

      <section
        role="region"
        aria-label="审核筛选"
        className="panel-raised rounded-sm border border-[color:var(--line)] p-4 sm:p-6"
      >
        <div className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.9fr)]">
            <FilterInput
              id="content-review-keyword"
              label="关键词"
              ariaLabel="审核关键词"
              placeholder={activeTab === "filtered" ? "搜索标题、摘要或复核说明" : "搜索聚合标题、摘要或子项"}
              value={activeTab === "filtered" ? filteredSearch : clusterSearch}
              onChange={(value) => {
                if (activeTab === "filtered") {
                  setFilteredSearch(value);
                } else {
                  setClusterSearch(value);
                }
              }}
            />

            {activeTab === "filtered" ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <FilterSelect
                  id="content-review-source"
                  label="来源"
                  ariaLabel="审核来源"
                  value={filteredSource}
                  onChange={setFilteredSource}
                  showSearch={false}
                  options={[
                    { value: "", label: "全部来源" },
                    ...filteredSources.map((source) => ({
                      value: source,
                      label: source,
                    })),
                  ]}
                />

                <FilterSelect
                  id="content-review-reason"
                  label="原因"
                  ariaLabel="过滤原因"
                  value={filteredReason}
                  onChange={setFilteredReason}
                  showSearch={false}
                  options={[
                    { value: "", label: "全部原因" },
                    ...Object.entries(reviewReasonLabels).map(([reason, label]) => ({
                      value: reason,
                      label,
                    })),
                  ]}
                />
              </div>
            ) : (
              <FilterSelect
                id="content-review-status"
                label="状态"
                ariaLabel="聚合状态"
                value={clusterStatus}
                onChange={(value) => setClusterStatus(value as ClusterDTO["status"] | "")}
                showSearch={false}
                options={[
                  { value: "", label: "全部状态" },
                  { value: "active", label: "显示中" },
                  { value: "hidden", label: "已隐藏" },
                ]}
              />
            )}
          </div>

          <FilterSummary
            items={activeFilterSummary}
            onClear={clearActiveFilters}
            canClear={activeFilterSummary.length > 0}
            clearLabel="清空筛选"
            details={<span>结果 {currentResultCount}</span>}
          />
        </div>
      </section>

      {activeTab === "filtered" ? (
        <section
          id="content-review-panel-filtered"
          role="tabpanel"
          aria-labelledby="content-review-tab-filtered"
          aria-busy={isPending}
          className="space-y-2.5"
        >
          <section role="region" aria-label="过滤内容列表" className="grid gap-2">
            {visibleFilteredItems.map((item) => (
              <article key={item.id} className={cx(surfaceCardClassName, "overflow-hidden px-3.5 py-3")}>
                <div className="flex flex-col gap-2.5 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="rounded-full border border-[color:var(--line)] bg-[var(--surface-muted)] px-2.5 py-1 text-xs font-medium text-[var(--foreground)]">
                        {item.sourceName}
                      </span>
                      <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--muted)]">
                        {formatDateTime(item.publishedAt)}
                      </span>
                      <span className="rounded-full border border-[color:var(--line-strong)] bg-[var(--accent-soft)] px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--accent-strong)]">
                        {getReviewReasonLabel(item.moderationReason)}
                      </span>
                      <span className="rounded-full border border-[color:var(--line)] bg-[var(--surface-muted)] px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--muted)]">
                        质量 {item.qualityScore}
                      </span>
                      <span className="rounded-full border border-[color:var(--line)] bg-white px-2.5 py-1 text-xs text-[var(--muted)]">
                        {item.topicLabel ?? "未归类主题"}
                      </span>
                    </div>

                    <div className="space-y-1">
                      <h3 className="text-[1rem] font-semibold tracking-[-0.03em] text-[var(--foreground)]">{item.title}</h3>
                      <p className="text-sm leading-6 text-[var(--foreground)]/84">{truncateText(item.summary, 88)}</p>
                    </div>

                    <div className="grid gap-2 text-sm leading-6 text-[var(--muted)] xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
                      <p>{item.moderationDetail || item.qualityRationale || "暂无复核说明。"}</p>
                      <a
                        aria-label={`查看原文：${item.title}`}
                        className="inline-flex max-w-full truncate text-[var(--accent)] underline decoration-[rgba(37,99,235,0.28)] underline-offset-4"
                        href={item.originalUrl}
                        rel="noreferrer"
                        target="_blank"
                      >
                        查看原文
                      </a>
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center gap-1.5 rounded-[0.95rem] border border-[color:var(--line)] bg-[var(--surface-muted)]/72 p-1 lg:w-auto lg:justify-end">
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
              <div className="rounded-[1.25rem] border border-dashed border-[color:var(--line)] bg-[var(--surface)] px-4 py-6 text-sm leading-6 text-[var(--muted)]">
                当前没有待处理的过滤内容。
              </div>
            ) : visibleFilteredItems.length === 0 ? (
              <div className="rounded-[1.25rem] border border-dashed border-[color:var(--line)] bg-[var(--surface)] px-4 py-6 text-sm leading-6 text-[var(--muted)]">
                当前筛选条件下没有匹配内容。
              </div>
            ) : null}
          </section>
        </section>
      ) : (
        <section
          id="content-review-panel-clusters"
          role="tabpanel"
          aria-labelledby="content-review-tab-clusters"
          aria-busy={isPending}
          className="space-y-2.5"
        >
          <section role="region" aria-label="聚合管理列表" className="grid gap-2">
            {visibleClusters.map((cluster) => (
              <article key={cluster.id} className={cx(surfaceCardClassName, "px-3.5 py-3")}>
                <div className="flex flex-col gap-2.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="rounded-full border border-[color:var(--line)] bg-[var(--surface-muted)] px-2.5 py-1 text-xs font-medium text-[var(--foreground)]">
                      {cluster.itemCount} 条内容
                    </span>
                    <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--muted)]">
                      {formatDateTime(cluster.latestPublishedAt)}
                    </span>
                    <span className="rounded-full border border-[color:var(--line-strong)] bg-[var(--accent-soft)] px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--accent-strong)]">
                      {clusterStatusLabels[cluster.status]}
                    </span>
                    <span className="rounded-full border border-[color:var(--line)] bg-[var(--surface-muted)] px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--muted)]">
                      质量 {cluster.score}
                    </span>
                  </div>

                  <div className="space-y-1">
                    <h3 className="text-[1rem] font-semibold tracking-[-0.03em] text-[var(--foreground)]">{cluster.title}</h3>
                    <p className="text-sm leading-6 text-[var(--foreground)]/84">{truncateText(cluster.summary, 96)}</p>
                  </div>

                  <div className="grid gap-2">
                    {cluster.items.map((item) => (
                      <div key={item.id} className={cx(subtleCardClassName, "grid gap-2 p-3")}>
                        <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                          <div className="min-w-0 space-y-1">
                            <strong className="block text-sm font-semibold text-[var(--foreground)]">{item.title}</strong>
                            <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
                              <span>{item.sourceName}</span>
                              <span className="font-mono uppercase tracking-[0.16em]">{formatDateTime(item.publishedAt)}</span>
                            </div>
                            <p className="text-sm leading-6 text-[var(--muted)]">{truncateText(item.summary, 72)}</p>
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
                      </div>
                    ))}

                    {cluster.items.length === 0 ? (
                      <div className={cx(subtleCardClassName, "px-3 py-3 text-sm leading-6 text-[var(--muted)]")}>
                        聚合组当前没有子项预览。
                      </div>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 rounded-[0.95rem] border border-[color:var(--line)] bg-[var(--surface-muted)]/72 p-1">
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
                    <button
                      className={secondaryButtonClassName}
                      type="button"
                      disabled={isPending}
                      onClick={() =>
                        postAction(
                          `/api/admin/clusters/${cluster.id}/${cluster.status === "hidden" ? "restore" : "hide"}`,
                          cluster.status === "hidden" ? "聚合组已恢复。" : "聚合组已隐藏。",
                          {
                            requiredField: "cluster",
                            onSuccess: (payload) => {
                              setClusters((current) =>
                                current.map((entry) => (entry.id === cluster.id ? payload.cluster ?? entry : entry)),
                              );
                            },
                          },
                        )
                      }
                    >
                      {cluster.status === "hidden" ? "恢复聚合组" : "隐藏聚合组"}
                    </button>
                  </div>
                </div>
              </article>
            ))}

            {clusterCount === 0 ? (
              <div className="rounded-[1.25rem] border border-dashed border-[color:var(--line)] bg-[var(--surface)] px-4 py-6 text-sm leading-6 text-[var(--muted)]">
                当前没有可管理的聚合结果。
              </div>
            ) : visibleClusters.length === 0 ? (
              <div className="rounded-[1.25rem] border border-dashed border-[color:var(--line)] bg-[var(--surface)] px-4 py-6 text-sm leading-6 text-[var(--muted)]">
                当前筛选条件下没有匹配内容。
              </div>
            ) : null}
          </section>
        </section>
      )}
    </>
  );
}

export function ContentReviewPanel({ embedMode }: { embedMode?: boolean }) {
  if (embedMode) {
    return <ContentReviewContent />;
  }

  return (
    <PageShell header={{ activeNav: null, isAdmin: true }} contentClassName="gap-3">
      <ContentReviewContent />
    </PageShell>
  );
}
