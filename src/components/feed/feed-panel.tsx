"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";

import { PageHeader } from "@/components/ui/page-header";
import { PageShell } from "@/components/ui/page-shell";
import { StatusBanner } from "@/components/ui/status-banner";
import { RANGE_OPTIONS, SORT_OPTIONS } from "@/lib/feed/range";
import type {
  FeedClusterPreviewItemDTO,
  FeedEntryDTO,
  FeedGroupOption,
  FeedRange,
  FeedSourceOption,
  FeedSort,
  FetchRunSnapshot,
} from "@/lib/feed/types";
import { cx } from "@/lib/ui/cx";

const STATUS_POLL_INTERVAL_MS = 2_000;
const DISPLAY_TIME_ZONE = "Asia/Shanghai";

type FeedPanelProps = {
  initialItems: FeedEntryDTO[];
  initialRange: FeedRange;
  initialSort: FeedSort;
  initialStartDate: string | null;
  initialEndDate: string | null;
  initialNextCursor: string | null;
  initialStatus: FetchRunSnapshot | null;
  isAdmin: boolean;
  initialGroupId?: string | null;
  initialSourceId?: string | null;
  availableGroups?: FeedGroupOption[];
  availableSources?: FeedSourceOption[];
};

type FeedQueryState = {
  range: FeedRange;
  sort: FeedSort;
  startDate: string | null;
  endDate: string | null;
  groupId: string | null;
  sourceId: string | null;
};

type FeedbackTone = "info" | "success" | "error";

type FeedFeedback = {
  tone: FeedbackTone;
  message: string;
};

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: DISPLAY_TIME_ZONE,
  }).format(new Date(value));
}

function formatRunStatus(status: FetchRunSnapshot | null): string {
  if (!status) {
    return "尚未执行";
  }

  const timestamp = formatDate(status.finishedAt ?? status.startedAt);
  const progress = status.itemCount > 0 ? ` · ${status.successCount + status.failureCount}/${status.itemCount}` : "";

  return `${status.status}${progress} · ${timestamp}`;
}

function formatScore(score: number): string {
  if (score >= 80) {
    return `高质量 ${score}`;
  }

  if (score >= 60) {
    return `一般 ${score}`;
  }

  return `较低 ${score}`;
}

function formatRangeLabel(range: FeedRange, startDate: string | null, endDate: string | null): string {
  if (startDate || endDate) {
    return `${startDate ?? "最早"} 至 ${endDate ?? "最新"}`;
  }

  return RANGE_OPTIONS.find((option) => option.value === range)?.label ?? "7天";
}

function normalizeOptionalId(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function buildFeedSearch({ range, sort, startDate, endDate, groupId, sourceId }: FeedQueryState, cursor?: string | null): string {
  const search = new URLSearchParams({
    range,
    sort,
  });
  const normalizedGroupId = normalizeOptionalId(groupId);
  const normalizedSourceId = normalizeOptionalId(sourceId);

  if (startDate) {
    search.set("start", startDate);
  }

  if (endDate) {
    search.set("end", endDate);
  }

  if (normalizedGroupId) {
    search.set("groupId", normalizedGroupId);
  }

  if (normalizedSourceId) {
    search.set("sourceId", normalizedSourceId);
  }

  if (cursor) {
    search.set("cursor", cursor);
  }

  return search.toString();
}

export function FeedPanel({
  initialItems,
  initialRange,
  initialSort,
  initialStartDate,
  initialEndDate,
  initialNextCursor,
  initialStatus,
  isAdmin,
  initialGroupId = null,
  initialSourceId = null,
  availableGroups = [],
  availableSources = [],
}: FeedPanelProps) {
  const [items, setItems] = useState(initialItems);
  const [range, setRange] = useState<FeedRange>(initialRange);
  const [sort, setSort] = useState<FeedSort>(initialSort);
  const [startDate, setStartDate] = useState<string | null>(initialStartDate);
  const [endDate, setEndDate] = useState<string | null>(initialEndDate);
  const [groupId, setGroupId] = useState<string | null>(normalizeOptionalId(initialGroupId));
  const [sourceId, setSourceId] = useState<string | null>(normalizeOptionalId(initialSourceId));
  const [nextCursor, setNextCursor] = useState<string | null>(initialNextCursor);
  const [status, setStatus] = useState<FetchRunSnapshot | null>(initialStatus);
  const [queuedRefreshAt, setQueuedRefreshAt] = useState<string | null>(null);
  const [expandedClusters, setExpandedClusters] = useState<Record<string, FeedClusterPreviewItemDTO[]>>({});
  const [openClusters, setOpenClusters] = useState<Record<string, boolean>>({});
  const [isPending, startTransition] = useTransition();
  const [refreshFeedback, setRefreshFeedback] = useState<FeedFeedback | null>(null);
  const visibleSources = useMemo(
    () => availableSources.filter((source) => (!groupId ? true : source.groupId === groupId)),
    [availableSources, groupId],
  );

  const summary = useMemo(
    () => ({
      count: items.length,
      rangeLabel: formatRangeLabel(range, startDate, endDate),
      sortLabel: SORT_OPTIONS.find((option) => option.value === sort)?.label ?? "按时间倒序",
    }),
    [endDate, items.length, range, sort, startDate],
  );

  async function fetchFeed(query: FeedQueryState, cursor?: string | null) {
    const response = await fetch(`/api/feed?${buildFeedSearch(query, cursor)}`);
    return (await response.json()) as {
      items: FeedEntryDTO[];
      nextCursor: string | null;
      range: FeedRange;
      sort: FeedSort;
      start: string | null;
      end: string | null;
      groupId: string | null;
      sourceId: string | null;
    };
  }

  async function fetchClusterItems(clusterId: string, query: FeedQueryState) {
    const response = await fetch(`/api/feed/clusters/${clusterId}?${buildFeedSearch(query)}`);
    const payload = (await response.json()) as {
      items: FeedClusterPreviewItemDTO[];
    };

    return payload.items;
  }

  const loadFeed = (query: FeedQueryState) => {
    startTransition(async () => {
      const payload = await fetchFeed(query);
      setRange(payload.range);
      setSort(payload.sort);
      setStartDate(payload.start);
      setEndDate(payload.end);
      setGroupId(payload.groupId);
      setSourceId(payload.sourceId);
      setItems(payload.items);
      setNextCursor(payload.nextCursor);
      setExpandedClusters({});
      setOpenClusters({});
      setRefreshFeedback(null);
    });
  };

  const loadRange = (nextRange: FeedRange) => {
    loadFeed({
      range: nextRange,
      sort,
      startDate: null,
      endDate: null,
      groupId,
      sourceId,
    });
  };

  const applyCustomRange = () => {
    loadFeed({
      range,
      sort,
      startDate,
      endDate,
      groupId,
      sourceId,
    });
  };

  const clearCustomRange = () => {
    loadFeed({
      range,
      sort,
      startDate: null,
      endDate: null,
      groupId,
      sourceId,
    });
  };

  const changeSort = (nextSort: FeedSort) => {
    loadFeed({
      range,
      sort: nextSort,
      startDate,
      endDate,
      groupId,
      sourceId,
    });
  };

  const changeGroup = (nextGroupId: string) => {
    const normalizedGroupId = normalizeOptionalId(nextGroupId);
    const nextSourceId =
      normalizedGroupId && sourceId && !availableSources.some((source) => source.id === sourceId && source.groupId === normalizedGroupId)
        ? null
        : sourceId;

    loadFeed({
      range,
      sort,
      startDate,
      endDate,
      groupId: normalizedGroupId,
      sourceId: nextSourceId,
    });
  };

  const changeSource = (nextSourceId: string) => {
    loadFeed({
      range,
      sort,
      startDate,
      endDate,
      groupId,
      sourceId: normalizeOptionalId(nextSourceId),
    });
  };

  const refresh = () => {
    if (!isAdmin) {
      return;
    }

    startTransition(async () => {
      const queuedAt = new Date().toISOString();
      const response = await fetch("/api/ingest/run", { method: "POST" });
      const payload = (await response.json()) as {
        taskRun?: {
          id: string;
        } | null;
        error?: string;
      };

      if (payload.error) {
        setRefreshFeedback({ tone: "error", message: payload.error });
        return;
      }

      if (!payload.taskRun) {
        setRefreshFeedback({ tone: "error", message: "未返回后台任务信息。" });
        return;
      }

      setQueuedRefreshAt(queuedAt);
      setRefreshFeedback({ tone: "success", message: "抓取任务已进入队列，等待后台执行。" });
    });
  };

  const regenerateItem = (itemId: string, target: "translation" | "summary") => {
    startTransition(async () => {
      const response = await fetch(`/api/admin/items/${itemId}/regenerate`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ target }),
      });
      const payload = (await response.json()) as {
        taskRun?: {
          id: string;
        } | null;
        error?: string;
      };

      if (payload.error) {
        setRefreshFeedback({ tone: "error", message: payload.error });
        return;
      }

      if (!payload.taskRun) {
        setRefreshFeedback({ tone: "error", message: "未返回后台任务信息。" });
        return;
      }

      setRefreshFeedback({ tone: "success", message: "已创建后台任务，正在处理中。" });
    });
  };

  const toggleCluster = (clusterId: string) => {
    startTransition(async () => {
      const nextOpen = !openClusters[clusterId];

      if (nextOpen && !expandedClusters[clusterId]) {
        const clusterItems = await fetchClusterItems(clusterId, {
          range,
          sort,
          startDate,
          endDate,
          groupId,
          sourceId,
        });
        setExpandedClusters((current) => ({
          ...current,
          [clusterId]: clusterItems,
        }));
      }

      setOpenClusters((current) => ({
        ...current,
        [clusterId]: nextOpen,
      }));
    });
  };

  useEffect(() => {
    if (status?.status !== "running" && !queuedRefreshAt) {
      return;
    }

    const timer = window.setInterval(() => {
      startTransition(async () => {
        const response = await fetch("/api/ingest/status");
        const payload = (await response.json()) as {
          run?: FetchRunSnapshot | null;
        };

        if (!payload.run) {
          return;
        }

        if (queuedRefreshAt) {
          const runStartedAt = new Date(payload.run.startedAt).getTime();
          const queuedAt = new Date(queuedRefreshAt).getTime();

          if (runStartedAt < queuedAt) {
            return;
          }
        }

        setStatus(payload.run);

        if (payload.run.status === "running") {
          setQueuedRefreshAt(null);
          return;
        }

        setQueuedRefreshAt(null);
        const feedPayload = await fetchFeed({
          range,
          sort,
          startDate,
          endDate,
          groupId,
          sourceId,
        });
        setItems(feedPayload.items);
        setNextCursor(feedPayload.nextCursor);
        setExpandedClusters({});
        setOpenClusters({});
        setRefreshFeedback({
          tone: payload.run.status === "succeeded" || payload.run.status === "partial" ? "success" : "error",
          message:
            payload.run.status === "succeeded" || payload.run.status === "partial"
              ? "抓取完成，已重新载入当前时间范围。"
              : "抓取失败，请稍后重试。",
        });
      });
    }, STATUS_POLL_INTERVAL_MS);

    return () => {
      window.clearInterval(timer);
    };
  }, [endDate, groupId, queuedRefreshAt, range, sort, sourceId, startDate, startTransition, status]);

  const loadMore = () => {
    if (!nextCursor) {
      return;
    }

    startTransition(async () => {
      const payload = await fetchFeed(
        {
          range,
          sort,
          startDate,
          endDate,
          groupId,
          sourceId,
        },
        nextCursor,
      );

      setItems((current) => [...current, ...payload.items]);
      setNextCursor(payload.nextCursor);
    });
  };

  const controlFieldClassName = "flex min-w-[10rem] flex-1 flex-col gap-2";
  const controlLabelClassName = "text-[11px] font-medium uppercase tracking-[0.22em] text-[var(--muted)]";
  const controlInputClassName =
    "min-h-11 rounded-2xl border border-[color:var(--line)] bg-white px-4 py-3 text-sm text-[var(--foreground)] shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] outline-none transition focus:border-[color:var(--accent)] focus:ring-4 focus:ring-[rgba(37,99,235,0.14)] disabled:cursor-not-allowed disabled:bg-[var(--surface-muted)] disabled:text-[color:rgba(15,23,42,0.45)]";
  const secondaryButtonClassName =
    "inline-flex min-h-11 items-center justify-center rounded-2xl border border-[color:var(--line)] bg-white px-4 py-3 text-sm font-medium text-[var(--foreground)] shadow-[var(--shadow-sm)] transition hover:border-[color:var(--line-strong)] hover:bg-[var(--surface-muted)] disabled:cursor-not-allowed disabled:opacity-55";

  return (
    <PageShell chromeLabel={null} contentClassName="gap-6">
      <section className="grid gap-6">
        <div className="rounded-[2rem] border border-[color:var(--line)] bg-[linear-gradient(135deg,rgba(255,255,255,0.98),rgba(244,248,255,0.95))] p-6 shadow-[var(--shadow-lg)] sm:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <PageHeader
              eyebrow="Infinitum Feed"
              title="信息流控制台"
              description="用 AI 清理营销噪音、折叠同主题内容，并保留可展开的原始条目，让首页更像一套现代化的信息流工作台。"
              className="max-w-3xl"
            />
            <div className="flex flex-wrap items-center gap-3 lg:max-w-sm lg:justify-end">
              {isAdmin ? (
                <>
                  <Link
                    className="inline-flex min-h-11 items-center rounded-2xl border border-[color:var(--line)] bg-white px-4 py-3 text-sm font-medium text-[var(--foreground)] shadow-[var(--shadow-sm)] transition hover:border-[color:var(--line-strong)] hover:bg-[var(--surface-muted)]"
                    href="/admin/content"
                  >
                    内容审核
                  </Link>
                  <Link
                    className="inline-flex min-h-11 items-center rounded-2xl border border-[color:var(--line)] bg-white px-4 py-3 text-sm font-medium text-[var(--foreground)] shadow-[var(--shadow-sm)] transition hover:border-[color:var(--line-strong)] hover:bg-[var(--surface-muted)]"
                    href="/admin/settings"
                  >
                    管理设置
                  </Link>
                </>
              ) : (
                <Link
                  className="inline-flex min-h-11 items-center rounded-2xl border border-[color:var(--line)] bg-white px-4 py-3 text-sm font-medium text-[var(--foreground)] shadow-[var(--shadow-sm)] transition hover:border-[color:var(--line-strong)] hover:bg-[var(--surface-muted)]"
                  href="/admin/login"
                >
                  管理员登录
                </Link>
              )}
              {isAdmin ? (
                <button
                  className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-white shadow-[0_16px_32px_rgba(37,99,235,0.2)] transition hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:bg-[var(--accent)]"
                  type="button"
                  onClick={refresh}
                  disabled={isPending}
                >
                  {isPending ? "处理中..." : "立即刷新"}
                </button>
              ) : null}
            </div>
          </div>
        </div>

        <section
          role="region"
          aria-label="信息流筛选"
          className="rounded-[2rem] border border-[color:var(--line)] bg-white p-5 shadow-[var(--shadow-sm)] sm:p-6"
        >
          <div className="flex flex-col gap-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-[var(--muted)]">筛选工具栏</p>
                <h2 className="mt-2 text-lg font-semibold tracking-[-0.02em] text-[var(--foreground)]">范围、来源与排序</h2>
              </div>
              <div className="rounded-full border border-[color:var(--line)] bg-[var(--surface-muted)] px-3 py-1 font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">
                {summary.count} 条结果
              </div>
            </div>

            <div
              role="tablist"
              aria-label="时间范围"
              className="flex flex-wrap gap-2 rounded-3xl border border-[color:var(--line)] bg-[var(--surface-muted)] p-2"
            >
              {RANGE_OPTIONS.map((option) => {
                const active = !startDate && !endDate && option.value === range;
                return (
                  <button
                    key={option.value}
                    className={cx(
                      "inline-flex min-h-10 items-center justify-center rounded-2xl px-4 py-2 text-sm font-medium transition",
                      active
                        ? "bg-[var(--accent)] text-white shadow-[0_12px_24px_rgba(37,99,235,0.18)]"
                        : "bg-white text-[var(--foreground)] shadow-[var(--shadow-sm)] hover:bg-[var(--surface)]",
                      isPending && "cursor-not-allowed opacity-55",
                    )}
                    type="button"
                    aria-pressed={active}
                    onClick={() => loadRange(option.value)}
                    disabled={isPending}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>

            <div className="flex flex-col gap-4 xl:flex-row xl:items-end">
              <div className="grid flex-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                <label className={controlFieldClassName}>
                  <span className={controlLabelClassName}>排序方式</span>
                  <select
                    className={controlInputClassName}
                    aria-label="排序方式"
                    value={sort}
                    onChange={(event) => changeSort(event.target.value as FeedSort)}
                    disabled={isPending}
                  >
                    {SORT_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={controlFieldClassName}>
                  <span className={controlLabelClassName}>分组</span>
                  <select
                    className={controlInputClassName}
                    aria-label="分组"
                    value={groupId ?? ""}
                    onChange={(event) => changeGroup(event.target.value)}
                    disabled={isPending}
                  >
                    <option value="">全部分组</option>
                    {availableGroups.map((group) => (
                      <option key={group.id} value={group.id}>
                        {group.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={controlFieldClassName}>
                  <span className={controlLabelClassName}>信息源</span>
                  <select
                    className={controlInputClassName}
                    aria-label="信息源"
                    value={sourceId ?? ""}
                    onChange={(event) => changeSource(event.target.value)}
                    disabled={isPending}
                  >
                    <option value="">全部信息源</option>
                    {visibleSources.map((source) => (
                      <option key={source.id} value={source.id}>
                        {source.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 xl:min-w-[28rem] xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                <label className={controlFieldClassName}>
                  <span className={controlLabelClassName}>开始日期</span>
                  <input
                    className={controlInputClassName}
                    aria-label="开始日期"
                    type="date"
                    value={startDate ?? ""}
                    onChange={(event) => setStartDate(event.target.value || null)}
                    disabled={isPending}
                  />
                </label>
                <label className={controlFieldClassName}>
                  <span className={controlLabelClassName}>结束日期</span>
                  <input
                    className={controlInputClassName}
                    aria-label="结束日期"
                    type="date"
                    value={endDate ?? ""}
                    onChange={(event) => setEndDate(event.target.value || null)}
                    disabled={isPending}
                  />
                </label>
                <div className="flex flex-wrap items-end gap-3 sm:col-span-2 xl:col-span-1">
                  <button className={secondaryButtonClassName} type="button" onClick={applyCustomRange} disabled={isPending}>
                    应用时间范围
                  </button>
                  {startDate || endDate ? (
                    <button className={secondaryButtonClassName} type="button" onClick={clearCustomRange} disabled={isPending}>
                      清空自定义
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </section>

        {isAdmin ? (
          <StatusBanner className="rounded-[2rem] px-5 py-4 sm:px-6" tone="info">
            已启用管理员模式，可刷新数据、进入内容审核页，并对单条内容重新生成翻译或摘要。
          </StatusBanner>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "当前范围", value: summary.rangeLabel },
            { label: "当前条数", value: `${summary.count} 条` },
            { label: "当前排序", value: summary.sortLabel },
            { label: "最近抓取", value: formatRunStatus(status) },
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-[1.75rem] border border-[color:var(--line)] bg-white p-5 shadow-[var(--shadow-sm)]"
            >
              <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-[var(--muted)]">{item.label}</p>
              <p className="mt-3 text-base font-semibold leading-7 text-[var(--foreground)]">{item.value}</p>
            </div>
          ))}
        </div>

        {refreshFeedback ? (
          <StatusBanner className="rounded-[1.75rem]" tone={refreshFeedback.tone}>
            {refreshFeedback.message}
          </StatusBanner>
        ) : null}

        <div className="grid gap-4">
          {items.length === 0 ? (
            <div className="rounded-[2rem] border border-dashed border-[color:var(--line-strong)] bg-white/75 px-6 py-10 text-sm leading-7 text-[var(--muted)] shadow-[var(--shadow-sm)]">
              当前时间范围内还没有可展示内容，可以先点击“立即刷新”拉取数据。
            </div>
          ) : (
            items.map((entry) =>
              entry.type === "cluster" ? (
                <article
                  key={entry.id}
                  className="rounded-[2rem] border border-[color:var(--line)] bg-white p-5 shadow-[var(--shadow-sm)] transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-lg)] sm:p-6"
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-[var(--accent-soft)] px-3 py-1 text-[11px] font-medium uppercase tracking-[0.22em] text-[var(--accent-strong)]">
                          聚合事件
                        </span>
                        <span className="rounded-full border border-[color:var(--line)] px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--muted)]">
                          {entry.itemCount} 条相关内容
                        </span>
                      </div>
                      <div className="space-y-3">
                        <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[var(--foreground)] sm:text-[1.75rem]">
                          {entry.title}
                        </h2>
                        <div className="flex flex-wrap gap-2 text-sm text-[var(--muted)]">
                          <span className="rounded-full bg-[var(--surface-muted)] px-3 py-1">{formatDate(entry.latestPublishedAt)}</span>
                          <span className="rounded-full bg-[var(--surface-muted)] px-3 py-1">{entry.sourceCount} 个来源</span>
                          <span className="rounded-full bg-[var(--surface-muted)] px-3 py-1">{formatScore(entry.score)}</span>
                        </div>
                      </div>
                    </div>
                    <button
                      className={secondaryButtonClassName}
                      type="button"
                      onClick={() => toggleCluster(entry.id)}
                      disabled={isPending}
                    >
                      {openClusters[entry.id] ? "收起相关内容" : "展开相关内容"}
                    </button>
                  </div>

                  <p className="mt-5 max-w-4xl text-sm leading-7 text-[var(--muted)] sm:text-[15px]">{entry.summary}</p>

                  <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {entry.itemsPreview.map((preview) => (
                      <div
                        key={preview.id}
                        className="rounded-[1.5rem] border border-[color:var(--line)] bg-[var(--surface-muted)] p-4"
                      >
                        <p className="text-sm font-semibold leading-6 text-[var(--foreground)]">{preview.title}</p>
                        <p className="mt-2 text-xs uppercase tracking-[0.16em] text-[var(--muted)]">{preview.sourceName}</p>
                      </div>
                    ))}
                  </div>

                  {openClusters[entry.id] ? (
                    <div className="mt-5 rounded-[1.75rem] border border-[color:var(--line)] bg-[var(--surface-muted)] p-4 sm:p-5">
                      <div className="mb-4 flex items-center justify-between gap-3">
                        <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">展开条目</h3>
                        <span className="text-xs text-[var(--muted)]">保留原始来源、时间与作者信息</span>
                      </div>
                      <div className="grid gap-3">
                        {(expandedClusters[entry.id] ?? entry.itemsPreview).map((clusterItem) => (
                          <div key={clusterItem.id} className="rounded-[1.5rem] border border-[color:var(--line)] bg-white p-4 shadow-[var(--shadow-sm)]">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                              <a
                                className="text-base font-semibold leading-7 text-[var(--foreground)] underline decoration-transparent underline-offset-4 transition hover:decoration-[var(--accent)]"
                                href={clusterItem.originalUrl}
                                target="_blank"
                                rel="noreferrer"
                              >
                                {clusterItem.title}
                              </a>
                              <span className="rounded-full bg-[var(--accent-soft)] px-3 py-1 text-xs font-medium text-[var(--accent-strong)]">
                                {formatScore(clusterItem.score)}
                              </span>
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2 text-sm text-[var(--muted)]">
                              <span className="rounded-full bg-[var(--surface-muted)] px-3 py-1">{formatDate(clusterItem.publishedAt)}</span>
                              <span className="rounded-full bg-[var(--surface-muted)] px-3 py-1">{clusterItem.sourceName}</span>
                              <span className="rounded-full bg-[var(--surface-muted)] px-3 py-1">{clusterItem.author || "未知作者"}</span>
                            </div>
                            <p className="mt-3 text-sm leading-7 text-[var(--muted)]">{clusterItem.summary}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </article>
              ) : (
                <article
                  key={entry.id}
                  className="rounded-[2rem] border border-[color:var(--line)] bg-white p-5 shadow-[var(--shadow-sm)] transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-lg)] sm:p-6"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-[var(--surface-muted)] px-3 py-1 text-[11px] font-medium uppercase tracking-[0.2em] text-[var(--muted)]">
                      单条条目
                    </span>
                    <span className="rounded-full bg-[var(--accent-soft)] px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--accent-strong)]">
                      {formatScore(entry.score)}
                    </span>
                  </div>
                  <h2 className="mt-4 text-2xl font-semibold tracking-[-0.03em] text-[var(--foreground)] sm:text-[1.75rem]">
                    <a
                      className="underline decoration-transparent underline-offset-4 transition hover:decoration-[var(--accent)]"
                      href={entry.originalUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {entry.title}
                    </a>
                  </h2>
                  <div className="mt-4 flex flex-wrap gap-2 text-sm text-[var(--muted)]">
                    <span className="rounded-full bg-[var(--surface-muted)] px-3 py-1">{formatDate(entry.publishedAt)}</span>
                    <span className="rounded-full bg-[var(--surface-muted)] px-3 py-1">{entry.sourceName}</span>
                    <span className="rounded-full bg-[var(--surface-muted)] px-3 py-1">{entry.author || "未知作者"}</span>
                  </div>
                  <p className="mt-5 max-w-4xl text-sm leading-7 text-[var(--muted)] sm:text-[15px]">{entry.summary}</p>
                  {isAdmin ? (
                    <div className="mt-5 flex flex-wrap gap-3">
                      {entry.canRegenerateTranslation ? (
                        <button
                          className={secondaryButtonClassName}
                          type="button"
                          onClick={() => regenerateItem(entry.id, "translation")}
                          disabled={isPending}
                        >
                          重新生成翻译
                        </button>
                      ) : null}
                      <button
                        className={secondaryButtonClassName}
                        type="button"
                        onClick={() => regenerateItem(entry.id, "summary")}
                        disabled={isPending}
                      >
                        重新生成摘要
                      </button>
                    </div>
                  ) : null}
                </article>
              ),
            )
          )}
        </div>

        {nextCursor ? (
          <div className="flex justify-center pt-2">
            <button className={secondaryButtonClassName} type="button" onClick={loadMore} disabled={isPending}>
              {isPending ? "载入中..." : "加载更多"}
            </button>
          </div>
        ) : null}
      </section>
    </PageShell>
  );
}
