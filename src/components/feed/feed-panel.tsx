"use client";

import dayjs, { type Dayjs } from "dayjs";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";

import { PageShell } from "@/components/ui/page-shell";
import { StatusBanner } from "@/components/ui/status-banner";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { FilterInput } from "@/components/ui/filter-input";
import { FilterSelect } from "@/components/ui/filter-select";
import { FilterSelectInline } from "@/components/ui/filter-select-inline";
import { FilterSummary } from "@/components/ui/filter-summary";
import { FormField } from "@/components/ui/form-field";
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
const FETCH_STATUS_LABELS = {
  running: "运行中",
  succeeded: "已成功",
  failed: "失败",
  partial: "部分成功",
} as const;

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
  initialTitle?: string | null;
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
  title: string | null;
};

type FeedbackTone = "info" | "success" | "error";

type FeedFeedback = {
  tone: FeedbackTone;
  message: string;
};

type DateRangeValue = [Dayjs | null, Dayjs | null] | null;

const TITLE_SEARCH_DEBOUNCE_MS = 320;

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

function formatRunSummary(status: FetchRunSnapshot | null): string {
  if (!status) {
    return "最近抓取：尚未执行";
  }

  const timestamp = formatDate(status.finishedAt ?? status.startedAt);
  const statusLabel = FETCH_STATUS_LABELS[status.status];
  const progress = status.itemCount > 0 ? ` · ${status.successCount + status.failureCount}/${status.itemCount}` : "";

  return `最近抓取：${statusLabel}${progress} · ${timestamp}`;
}

function formatRunDetail(status: FetchRunSnapshot | null): string | null {
  const detail = status?.errorSummary?.trim();
  return detail ? `抓取说明：${detail}` : null;
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

  return RANGE_OPTIONS.find((option) => option.value === range)?.label ?? "当天";
}

function normalizeOptionalId(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function normalizeSearchText(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function toDayjsRange(startDate: string | null, endDate: string | null): [Dayjs | null, Dayjs | null] {
  return [startDate ? dayjs(startDate, "YYYY-MM-DD") : null, endDate ? dayjs(endDate, "YYYY-MM-DD") : null];
}

function getBrowserTimeZoneOffsetMinutes(): number {
  return new Date().getTimezoneOffset();
}

function isTimeZoneSensitiveQuery(range: FeedRange, startDate: string | null, endDate: string | null): boolean {
  return Boolean(startDate || endDate || range === "today" || range === "1m" || range === "1y");
}

function buildFeedSearch({ range, sort, startDate, endDate, groupId, sourceId, title }: FeedQueryState, cursor?: string | null): string {
  const search = new URLSearchParams({
    range,
    sort,
  });
  const normalizedGroupId = normalizeOptionalId(groupId);
  const normalizedSourceId = normalizeOptionalId(sourceId);
  const normalizedTitle = normalizeSearchText(title);

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

  if (normalizedTitle) {
    search.set("title", normalizedTitle);
  }

  if (cursor) {
    search.set("cursor", cursor);
  }

  const timeZoneOffsetMinutes = getBrowserTimeZoneOffsetMinutes();
  if (timeZoneOffsetMinutes !== 0) {
    search.set("tzOffsetMinutes", String(timeZoneOffsetMinutes));
  }

  return search.toString();
}

async function requestFeed(query: FeedQueryState, cursor?: string | null) {
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
    title: string | null;
  };
}

async function requestClusterItems(clusterId: string, query: FeedQueryState) {
  const response = await fetch(`/api/feed/clusters/${clusterId}?${buildFeedSearch(query)}`);
  const payload = (await response.json()) as {
    items: FeedClusterPreviewItemDTO[];
  };

  return payload.items;
}

function SearchIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 12a9 9 0 0 1-9 9 9 9 0 0 1-7.5-4" />
      <path d="M3 12a9 9 0 0 1 9-9 9 9 0 0 1 7.5 4" />
      <path d="M3 5v4h4" />
      <path d="M21 19v-4h-4" />
    </svg>
  );
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
  initialTitle = null,
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
  const [title, setTitle] = useState<string>(normalizeSearchText(initialTitle) ?? "");
  const [nextCursor, setNextCursor] = useState<string | null>(initialNextCursor);
  const [status, setStatus] = useState<FetchRunSnapshot | null>(initialStatus);
  const [queuedRefreshAt, setQueuedRefreshAt] = useState<string | null>(null);
  const [expandedClusters, setExpandedClusters] = useState<Record<string, FeedClusterPreviewItemDTO[]>>({});
  const [openClusters, setOpenClusters] = useState<Record<string, boolean>>({});
  const [isPending, startTransition] = useTransition();
  const [refreshFeedback, setRefreshFeedback] = useState<FeedFeedback | null>(null);
  const [advancedFiltersOpen, setAdvancedFiltersOpen] = useState(
    Boolean(initialStartDate || initialEndDate || initialGroupId || initialSourceId || initialTitle),
  );
  const skipTitleEffectRef = useRef(true);
  const didHydrateTimeZoneRef = useRef(false);
  const latestQueryRef = useRef<FeedQueryState>({
    range: initialRange,
    sort: initialSort,
    startDate: initialStartDate,
    endDate: initialEndDate,
    groupId: normalizeOptionalId(initialGroupId),
    sourceId: normalizeOptionalId(initialSourceId),
    title: normalizeSearchText(initialTitle),
  });
  const visibleSources = useMemo(
    () => availableSources.filter((source) => (!groupId ? true : source.groupId === groupId)),
    [availableSources, groupId],
  );

  const summary = useMemo(
    () => ({
      rangeLabel: formatRangeLabel(range, startDate, endDate),
      sortLabel: SORT_OPTIONS.find((option) => option.value === sort)?.label ?? "按时间倒序",
    }),
    [endDate, range, sort, startDate],
  );
  const activeFilterSummary = useMemo(() => {
    const filters = [`创建时间：${summary.rangeLabel}`, `排序：${summary.sortLabel}`];

    if (title.trim()) {
      filters.push(`标题：${title.trim()}`);
    }

    if (groupId) {
      filters.push(`分组：${availableGroups.find((group) => group.id === groupId)?.name ?? groupId}`);
    }

    if (sourceId) {
      filters.push(`信息源：${availableSources.find((source) => source.id === sourceId)?.name ?? sourceId}`);
    }

    return filters;
  }, [availableGroups, availableSources, groupId, sourceId, summary.rangeLabel, summary.sortLabel, title]);

  const loadFeed = (query: FeedQueryState) => {
    startTransition(async () => {
      const payload = await requestFeed(query);
      setItems(payload.items);
      setNextCursor(payload.nextCursor);
      setExpandedClusters({});
      setOpenClusters({});
      setRefreshFeedback(null);
    });
  };

  const buildQuery = (overrides: Partial<FeedQueryState> = {}): FeedQueryState => ({
    range,
    sort,
    startDate,
    endDate,
    groupId,
    sourceId,
    title: normalizeSearchText(title),
    ...overrides,
  });

  const updateRange = (nextRange: FeedRange) => {
    setRange(nextRange);
    setStartDate(null);
    setEndDate(null);
    loadFeed(
      buildQuery({
        range: nextRange,
        startDate: null,
        endDate: null,
      }),
    );
  };

  const changeSort = (nextSort: FeedSort) => {
    setSort(nextSort);
    loadFeed(
      buildQuery({
        sort: nextSort,
      }),
    );
  };

  const changeGroup = (nextGroupId: string) => {
    const normalizedGroupId = normalizeOptionalId(nextGroupId);
    const nextSourceId =
      normalizedGroupId && sourceId && !availableSources.some((source) => source.id === sourceId && source.groupId === normalizedGroupId)
        ? null
        : sourceId;

    setGroupId(normalizedGroupId);
    setSourceId(nextSourceId);
    loadFeed(
      buildQuery({
        groupId: normalizedGroupId,
        sourceId: nextSourceId,
      }),
    );
  };

  const changeSource = (nextSourceId: string) => {
    const normalizedSourceId = normalizeOptionalId(nextSourceId);
    setSourceId(normalizedSourceId);
    loadFeed(
      buildQuery({
        sourceId: normalizedSourceId,
      }),
    );
  };

  const changeDateRange = (nextRange: DateRangeValue) => {
    const [nextStartDate, nextEndDate] = nextRange ?? [null, null];
    const normalizedStartDate = nextStartDate ? nextStartDate.format("YYYY-MM-DD") : null;
    const normalizedEndDate = nextEndDate ? nextEndDate.format("YYYY-MM-DD") : null;

    setStartDate(normalizedStartDate);
    setEndDate(normalizedEndDate);
    loadFeed(
      buildQuery({
        startDate: normalizedStartDate,
        endDate: normalizedEndDate,
      }),
    );
  };

  const clearFilters = () => {
    setRange("today");
    setSort("time_desc");
    setStartDate(null);
    setEndDate(null);
    setGroupId(null);
    setSourceId(null);
    setTitle("");
    setAdvancedFiltersOpen(false);
    loadFeed({
      range: "today",
      sort: "time_desc",
      startDate: null,
      endDate: null,
      groupId: null,
      sourceId: null,
      title: null,
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
        const clusterItems = await requestClusterItems(clusterId, buildQuery());
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
    latestQueryRef.current = {
      range,
      sort,
      startDate,
      endDate,
      groupId,
      sourceId,
      title: normalizeSearchText(title),
    };
  }, [endDate, groupId, range, sort, sourceId, startDate, title]);

  useEffect(() => {
    if (didHydrateTimeZoneRef.current) {
      return;
    }

    didHydrateTimeZoneRef.current = true;

    if (getBrowserTimeZoneOffsetMinutes() === 0 || !isTimeZoneSensitiveQuery(range, startDate, endDate)) {
      return;
    }

    loadFeed({
      range,
      sort,
      startDate,
      endDate,
      groupId,
      sourceId,
      title: normalizeSearchText(title),
    });
  }, [endDate, groupId, range, sort, sourceId, startDate, title]);

  useEffect(() => {
    if (skipTitleEffectRef.current) {
      skipTitleEffectRef.current = false;
      return;
    }

    const timer = window.setTimeout(() => {
      startTransition(async () => {
        const payload = await requestFeed({
          ...latestQueryRef.current,
          title: normalizeSearchText(title),
        });
        setItems(payload.items);
        setNextCursor(payload.nextCursor);
        setExpandedClusters({});
        setOpenClusters({});
        setRefreshFeedback(null);
      });
    }, TITLE_SEARCH_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [title]);

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
        const feedPayload = await requestFeed({
          range,
          sort,
          startDate,
          endDate,
          groupId,
          sourceId,
          title: normalizeSearchText(title),
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
  }, [endDate, groupId, queuedRefreshAt, range, sort, sourceId, startDate, startTransition, status, title]);

  const loadMore = () => {
    if (!nextCursor) {
      return;
    }

    startTransition(async () => {
      const payload = await requestFeed(
        {
          range,
          sort,
          startDate,
          endDate,
          groupId,
          sourceId,
          title: normalizeSearchText(title),
        },
        nextCursor,
      );

      setItems((current) => [...current, ...payload.items]);
      setNextCursor(payload.nextCursor);
    });
  };

  const secondaryButtonClassName =
    "inline-flex items-center justify-center rounded-sm border border-[color:var(--line)] bg-white px-3 py-1 text-sm text-[var(--muted)] transition hover:bg-[var(--surface-muted)] hover:text-[var(--foreground)] disabled:cursor-not-allowed disabled:opacity-55";
  const neutralBadgeClassName =
    "inline-flex items-center rounded-sm border border-[color:var(--line)] bg-[var(--surface-muted)] px-2.5 py-1 text-sm text-[var(--muted)]";
  const denseCardClassName =
    "rounded-lg border border-[color:var(--line)] bg-white px-4 py-4 shadow-[var(--shadow-sm)] transition hover:border-[color:var(--line-strong)] sm:px-6 sm:py-5";
  const hasClearableFilters = activeFilterSummary.length > 0;
  const latestRunSummary = formatRunSummary(status);
  const latestRunDetail = formatRunDetail(status);

  return (
    <PageShell
      header={{
        activeNav: "home",
        isAdmin,
      }}
      contentClassName="gap-5 sm:gap-6"
    >
      <section className="grid gap-4">
        <section
          role="region"
          aria-label="信息流筛选"
          className="panel-raised rounded-sm border border-[color:var(--line)] p-4 sm:p-6"
        >
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  aria-expanded={advancedFiltersOpen}
                  className={cx(
                    "lumina-home-action-button inline-flex whitespace-nowrap px-4 py-1 text-sm rounded-sm transition",
                    advancedFiltersOpen
                      ? "lumina-home-action-button--active bg-[var(--accent-soft)] text-[var(--accent-strong)]"
                      : "bg-[var(--bg-muted)] text-[var(--text-2)] hover:bg-[var(--surface)]",
                  )}
                  type="button"
                  onClick={() => setAdvancedFiltersOpen((current) => !current)}
                >
                  <span className="inline-flex items-center gap-2">
                    <SearchIcon />
                    <span>高级筛选</span>
                  </span>
                </button>
                {isAdmin ? (
                  <button
                    type="button"
                    onClick={refresh}
                    disabled={isPending}
                    className="lumina-home-action-button lumina-home-action-button--primary inline-flex items-center justify-center whitespace-nowrap rounded-sm bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-white transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(59,130,246,0.35)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface)] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <span className="inline-flex items-center gap-2">
                      <RefreshIcon />
                      <span>立即刷新</span>
                    </span>
                  </button>
                ) : null}
                <span className="text-sm text-[var(--text-2)]">{latestRunSummary}</span>
              </div>

              <div className="flex flex-wrap items-center gap-4 lg:justify-end">
                <FilterSelectInline
                  label="创建时间："
                  ariaLabel="创建时间"
                  value={range}
                  onChange={(value) => updateRange(value as FeedRange)}
                  options={RANGE_OPTIONS.map((option) => ({
                    value: option.value,
                    label: option.label,
                  }))}
                  showSearch={false}
                />

                <FilterSelectInline
                  label="排序："
                  ariaLabel="排序方式"
                  value={sort}
                  onChange={(value) => changeSort(value as FeedSort)}
                  options={SORT_OPTIONS.map((option) => ({
                    value: option.value,
                    label: option.label,
                  }))}
                  showSearch={false}
                />
              </div>
            </div>

            {advancedFiltersOpen ? (
              <div className="border-t border-[color:var(--line)] pt-4">
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  <FilterInput
                    id="feed-title-filter"
                    label="标题模糊搜索"
                    value={title}
                    onChange={setTitle}
                    placeholder="输入标题关键词"
                  />

                  <FilterSelect
                    id="feed-group-filter"
                    label="分组"
                    ariaLabel="分组"
                    value={groupId ?? ""}
                    onChange={changeGroup}
                    showSearch={false}
                    options={[
                      { value: "", label: "全部分组" },
                      ...availableGroups.map((group) => ({
                        value: group.id,
                        label: group.name,
                      })),
                    ]}
                  />

                  <FilterSelect
                    id="feed-source-filter"
                    label="信息源"
                    ariaLabel="信息源"
                    value={sourceId ?? ""}
                    onChange={changeSource}
                    showSearch={false}
                    options={[
                      { value: "", label: "全部信息源" },
                      ...visibleSources.map((source) => ({
                        value: source.id,
                        label: source.name,
                      })),
                    ]}
                  />

                  <FormField label="创建时间" htmlFor="feed-created-date-range">
                    <DateRangePicker
                      id="feed-created-date-range"
                      value={toDayjsRange(startDate, endDate)}
                      onChange={changeDateRange}
                      className="w-full"
                    />
                  </FormField>
                </div>
              </div>
            ) : null}

            <FilterSummary
              items={activeFilterSummary}
              onClear={clearFilters}
              canClear={hasClearableFilters && !isPending}
              details={latestRunDetail ? <span>{latestRunDetail}</span> : null}
            />
          </div>
        </section>

        {refreshFeedback ? (
          <StatusBanner className="rounded-[1.1rem]" tone={refreshFeedback.tone}>
            {refreshFeedback.message}
          </StatusBanner>
        ) : null}

        <section role="region" aria-label="信息流结果" className="space-y-2.5">
          {items.length === 0 ? (
            <div className="rounded-[1.15rem] border border-dashed border-[color:var(--line-strong)] bg-white/80 px-5 py-8 text-sm leading-7 text-[var(--muted)] shadow-[var(--shadow-sm)]">
              {isAdmin
                ? "当前时间范围内还没有可展示内容，可以先点击“立即刷新”拉取数据。"
                : "当前时间范围内还没有可展示内容，请稍后再回来看看。"}
            </div>
          ) : (
            items.map((entry) =>
              entry.type === "cluster" ? (
                <article key={entry.id} className={denseCardClassName}>
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-sm bg-[var(--accent-soft)] px-2 py-1 text-xs text-[var(--accent-strong)]">
                          聚合事件
                        </span>
                        <span className={neutralBadgeClassName}>{entry.itemCount} 条条目</span>
                        <span className={neutralBadgeClassName}>{entry.sourceCount} 来源</span>
                        <span className={neutralBadgeClassName}>{formatScore(entry.score)}</span>
                      </div>
                      <h2 className="text-xl font-semibold text-[var(--foreground)]">
                        {entry.title}
                      </h2>
                      <div className="flex flex-wrap gap-2 text-sm text-[var(--muted)]">
                        <span className={neutralBadgeClassName}>{formatDate(entry.latestPublishedAt)}</span>
                      </div>
                      <p className="line-clamp-3 max-w-4xl text-sm text-[var(--muted)]">{entry.summary}</p>
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

                  <div className="mt-3 divide-y divide-[color:var(--line)] rounded-[1rem] border border-[color:var(--line)] bg-[var(--surface-muted)]/74">
                    {entry.itemsPreview.map((preview) => (
                      <div
                        key={preview.id}
                        className="flex flex-col gap-1.5 px-3 py-2.5 sm:flex-row sm:items-start sm:justify-between"
                      >
                        <p className="text-sm font-medium text-[var(--foreground)]">{preview.title}</p>
                        <div className="flex flex-wrap gap-2 text-xs text-[var(--muted)] sm:justify-end">
                          <span>{preview.sourceName}</span>
                          <span>{formatScore(preview.score)}</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {openClusters[entry.id] ? (
                    <div className="mt-3 rounded-[1rem] border border-[color:var(--line)] bg-[var(--surface-muted)]/82 p-3 sm:p-3.5">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <h3 className="text-sm font-semibold text-[var(--foreground)]">展开条目</h3>
                        <span className="text-xs text-[var(--muted)]">保留原始来源、时间与作者信息</span>
                      </div>
                      <div className="grid gap-2.5">
                        {(expandedClusters[entry.id] ?? entry.itemsPreview).map((clusterItem) => (
                          <div
                            key={clusterItem.id}
                            className="rounded-[0.95rem] border border-[color:var(--line)] bg-white px-3 py-2.5 shadow-[var(--shadow-sm)]"
                          >
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                              <a
                                className="text-base font-medium text-[var(--foreground)] underline decoration-transparent underline-offset-4 transition hover:decoration-[var(--accent)]"
                                href={clusterItem.originalUrl}
                                target="_blank"
                                rel="noreferrer"
                              >
                                {clusterItem.title}
                              </a>
                              <span className="rounded-sm bg-[var(--accent-soft)] px-2 py-1 text-xs text-[var(--accent-strong)]">
                                {formatScore(clusterItem.score)}
                              </span>
                            </div>
                            <div className="mt-2 flex flex-wrap gap-2 text-sm text-[var(--muted)]">
                              <span className={neutralBadgeClassName}>{formatDate(clusterItem.publishedAt)}</span>
                              <span className={neutralBadgeClassName}>{clusterItem.sourceName}</span>
                              <span className={neutralBadgeClassName}>{clusterItem.author || "未知作者"}</span>
                            </div>
                            <p className="mt-2 line-clamp-3 text-sm text-[var(--muted)]">{clusterItem.summary}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </article>
              ) : (
                <article key={entry.id} className={denseCardClassName}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-sm bg-[var(--surface-muted)] px-2 py-1 text-xs text-[var(--muted)]">
                      单条条目
                    </span>
                    <span className={neutralBadgeClassName}>{formatScore(entry.score)}</span>
                    <span className={neutralBadgeClassName}>{entry.sourceName}</span>
                    <span className={neutralBadgeClassName}>{formatDate(entry.publishedAt)}</span>
                  </div>
                  <h2 className="mt-3 text-xl font-semibold text-[var(--foreground)]">
                    <a
                      className="underline decoration-transparent underline-offset-4 transition hover:decoration-[var(--accent)]"
                      href={entry.originalUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {entry.title}
                    </a>
                  </h2>
                  <div className="mt-1.5 flex flex-wrap gap-2 text-sm text-[var(--muted)]">
                    <span className={neutralBadgeClassName}>{entry.author || "未知作者"}</span>
                  </div>
                  <p className="mt-2 line-clamp-3 max-w-4xl text-sm text-[var(--muted)]">{entry.summary}</p>
                  {isAdmin ? (
                    <div className="mt-3 flex flex-wrap gap-2">
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
        </section>

        {nextCursor ? (
          <div className="flex justify-center pt-1">
            <button className={secondaryButtonClassName} type="button" onClick={loadMore} disabled={isPending}>
              {isPending ? "载入中..." : "加载更多"}
            </button>
          </div>
        ) : null}
      </section>
    </PageShell>
  );
}
