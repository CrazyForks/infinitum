"use client";

import dayjs, { type Dayjs } from "dayjs";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";

import { PageShell } from "@/components/ui/page-shell";
import { StatusBanner } from "@/components/ui/status-banner";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { FilterInput } from "@/components/ui/filter-input";
import { FilterSelect } from "@/components/ui/filter-select";
import { FilterSelectInline } from "@/components/ui/filter-select-inline";
import { FilterSummary } from "@/components/ui/filter-summary";
import { FormField } from "@/components/ui/form-field";
import { IconFilter, IconPlus, IconTrash } from "@/components/ui/icons";
import { ModalShell } from "@/components/ui/modal-shell";
import { SelectField } from "@/components/ui/select-field";
import { TextInput } from "@/components/ui/text-input";
import { RANGE_OPTIONS, SORT_OPTIONS } from "@/lib/feed/range";
import type {
  ClusterDTO,
  FeedPagination,
  FeedClusterPreviewItemDTO,
  FeedEntryDTO,
  FeedGroupOption,
  FeedRange,
  FeedSourceOption,
  FeedSort,
  FetchRunSnapshot,
} from "@/lib/feed/types";
import { DEFAULT_FEED_PAGE_SIZE, FEED_PAGE_SIZE_OPTIONS } from "@/lib/feed/types";
import { cx } from "@/lib/ui/cx";
import { Button } from "@/components/ui/button";

const STATUS_POLL_INTERVAL_MS = 30_000;
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
  initialNextCursor?: string | null;
  initialPagination?: FeedPagination | null;
  initialStatus: FetchRunSnapshot | null;
  isAdmin: boolean;
  initialGroupId?: string | null;
  initialSourceId?: string | null;
  initialTitle?: string | null;
  availableGroups?: FeedGroupOption[];
  initialGroupTotalCount?: number;
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

type RegenerateDialogState = {
  itemId: string;
  canRegenerateTranslation: boolean;
  shouldAnnounceClusterRefresh?: boolean;
} | null;

type RegenerateMode = "summary" | "translation" | "both";

type AssignClusterDialogState = {
  itemId: string;
  itemTitle: string;
  currentClusterId?: string | null;
} | null;

type ManualFilterDialogState = {
  itemId: string;
  itemTitle: string;
} | null;

type DeleteItemDialogState = {
  itemId: string;
  itemTitle: string;
} | null;

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
  const addedInfo = status.itemsAdded > 0 ? ` · 新增${status.itemsAdded}条` : "";

  return `最近抓取：${statusLabel}${addedInfo} · ${timestamp}`;
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

function formatClusterSourceLabel(entry: FeedEntryDTO): string {
  if (entry.type === "single") {
    return entry.sourceName;
  }

  if (entry.sourceCount <= 1) {
    return entry.itemsPreview[0]?.sourceName ?? "未知来源";
  }

  return `${entry.sourceCount} 个来源`;
}

function formatClusterAuthorLabel(entry: FeedEntryDTO): string {
  if (entry.type === "single") {
    return entry.author || "未知作者";
  }

  const uniqueAuthors = Array.from(
    new Set(
      entry.itemsPreview
        .map((item) => item.author?.trim())
        .filter((author): author is string => Boolean(author)),
    ),
  );

  if (uniqueAuthors.length === 1) {
    return uniqueAuthors[0];
  }

  if (uniqueAuthors.length > 1) {
    return `${uniqueAuthors.length} 位作者`;
  }

  return "未知作者";
}

function formatMetaLabel(label: string, value: string): string {
  return `${label}：${value}`;
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

function buildFeedSearch(
  { range, sort, startDate, endDate, groupId, sourceId, title }: FeedQueryState,
  pagination?: {
    page?: number;
    size?: number;
  },
): string {
  const search = new URLSearchParams({
    range,
    sort,
  });
  const normalizedGroupId = normalizeOptionalId(groupId);
  const normalizedSourceId = normalizeOptionalId(sourceId);
  const normalizedTitle = normalizeSearchText(title);
  const page = pagination?.page ?? 1;
  const size = pagination?.size ?? DEFAULT_FEED_PAGE_SIZE;

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

  if (page > 1) {
    search.set("page", String(page));
  }

  if (size !== DEFAULT_FEED_PAGE_SIZE) {
    search.set("size", String(size));
  }

  const timeZoneOffsetMinutes = getBrowserTimeZoneOffsetMinutes();
  if (timeZoneOffsetMinutes !== 0) {
    search.set("tzOffsetMinutes", String(timeZoneOffsetMinutes));
  }

  return search.toString();
}

async function requestFeed(
  query: FeedQueryState,
  pagination?: {
    page?: number;
    size?: number;
  },
) {
  const requestedPage = pagination?.page ?? 1;
  const requestedSize = pagination?.size ?? DEFAULT_FEED_PAGE_SIZE;
  const response = await fetch(`/api/feed?${buildFeedSearch(query, pagination)}`);
  const payload = (await response.json()) as {
    items: FeedEntryDTO[];
    groups?: FeedGroupOption[];
    groupTotalCount?: number;
    nextCursor?: string | null;
    pagination?: FeedPagination;
    range: FeedRange;
    sort: FeedSort;
    start: string | null;
    end: string | null;
    groupId: string | null;
    sourceId: string | null;
    title: string | null;
  };

  return {
    ...payload,
    pagination: payload.pagination ?? {
      page: requestedPage,
      size: requestedSize,
      total: payload.items.length,
      totalPages: 1,
    },
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

function ChevronIcon({ expanded, className }: { expanded: boolean; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={cx("h-4 w-4 transition", expanded ? "rotate-180" : "", className)}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function formatGroupOptionLabel(name: string, count: number): string {
  return `${name} (${count})`;
}

function GroupFilterSidebar({
  groups,
  totalCount,
  selectedGroupId,
  expanded,
  onToggle,
  onSelect,
}: {
  groups: FeedGroupOption[];
  totalCount: number;
  selectedGroupId: string | null;
  expanded: boolean;
  onToggle: () => void;
  onSelect: (groupId: string) => void;
}) {
  const optionClassName =
    "flex w-full items-center justify-between rounded-sm px-3 py-2 text-left text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(59,130,246,0.28)]";

  return (
    <aside
      role="complementary"
      aria-label="分组筛选侧栏"
      className="w-full lg:h-full"
    >
      <div className="panel-raised rounded-sm border border-[color:var(--line)] p-4 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto">
        <div className="mb-4 flex items-center justify-between">
          {expanded ? (
            <h2 className="inline-flex items-center gap-2 font-semibold text-[var(--foreground)]">
              <span>分组筛选</span>
            </h2>
          ) : null}
          <button
            type="button"
            aria-expanded={expanded}
            aria-label={expanded ? "收起分组筛选" : "展开分组筛选"}
            onClick={onToggle}
            className="text-[var(--text-3)] transition hover:text-[var(--text-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(59,130,246,0.28)]"
          >
            {expanded ? "«" : "»"}
          </button>
        </div>

        {expanded ? (
          <div className="space-y-2">
            <button
              type="button"
              aria-pressed={selectedGroupId === null}
              aria-label={formatGroupOptionLabel("全部内容", totalCount)}
              onClick={() => onSelect("")}
              className={cx(
                optionClassName,
                selectedGroupId === null
                  ? "bg-[var(--accent-soft)] text-[var(--accent-strong)]"
                  : "text-[var(--text-2)] hover:bg-[var(--bg-muted)]",
              )}
            >
              <span>{formatGroupOptionLabel("全部内容", totalCount)}</span>
            </button>

            {groups.map((group) => {
              const isActive = selectedGroupId === group.id;

              return (
                <button
                  key={group.id}
                  type="button"
                  aria-pressed={isActive}
                  aria-label={formatGroupOptionLabel(group.name, group.count)}
                  onClick={() => onSelect(group.id)}
                  className={cx(
                    optionClassName,
                    isActive
                      ? "bg-[var(--accent-soft)] text-[var(--accent-strong)]"
                      : "text-[var(--text-2)] hover:bg-[var(--bg-muted)]",
                  )}
                >
                  <span>{formatGroupOptionLabel(group.name, group.count)}</span>
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
    </aside>
  );
}

export function FeedPanel({
  initialItems,
  initialRange,
  initialSort,
  initialStartDate,
  initialEndDate,
  initialNextCursor = null,
  initialPagination = null,
  initialStatus,
  isAdmin,
  initialGroupId = null,
  initialSourceId = null,
  initialTitle = null,
  availableGroups = [],
  initialGroupTotalCount,
  availableSources = [],
}: FeedPanelProps) {
  const router = useRouter();
  const fallbackInitialPagination: FeedPagination = initialPagination ?? {
    page: 1,
    size: DEFAULT_FEED_PAGE_SIZE,
    total: initialItems.length + (initialNextCursor ? 1 : 0),
    totalPages: initialNextCursor ? 2 : 1,
  };
  const [items, setItems] = useState(initialItems);
  const [pagination, setPagination] = useState<FeedPagination>(fallbackInitialPagination);
  const [jumpToPage, setJumpToPage] = useState(String(fallbackInitialPagination.page));
  const [range, setRange] = useState<FeedRange>(initialRange);
  const [sort, setSort] = useState<FeedSort>(initialSort);
  const [startDate, setStartDate] = useState<string | null>(initialStartDate);
  const [endDate, setEndDate] = useState<string | null>(initialEndDate);
  const [groupId, setGroupId] = useState<string | null>(normalizeOptionalId(initialGroupId));
  const [sourceId, setSourceId] = useState<string | null>(normalizeOptionalId(initialSourceId));
  const [titleInput, setTitleInput] = useState<string>(normalizeSearchText(initialTitle) ?? "");
  const [titleFilter, setTitleFilter] = useState<string | null>(normalizeSearchText(initialTitle));
  const [status, setStatus] = useState<FetchRunSnapshot | null>(initialStatus);
  const [groups, setGroups] = useState<FeedGroupOption[]>(availableGroups);
  const [groupTotalCount, setGroupTotalCount] = useState<number>(
    initialGroupTotalCount ?? fallbackInitialPagination.total,
  );
  const [queuedRefreshAt, setQueuedRefreshAt] = useState<string | null>(null);
  const [expandedClusters, setExpandedClusters] = useState<Record<string, FeedClusterPreviewItemDTO[]>>({});
  const [openClusters, setOpenClusters] = useState<Record<string, boolean>>({});
  const [isPending, startTransition] = useTransition();
  const [refreshFeedback, setRefreshFeedback] = useState<FeedFeedback | null>(null);
  const [regenerateDialog, setRegenerateDialog] = useState<RegenerateDialogState>(null);
  const [regenerateMode, setRegenerateMode] = useState<RegenerateMode>("summary");
  const [assignClusterDialog, setAssignClusterDialog] = useState<AssignClusterDialogState>(null);
  const [manualFilterDialog, setManualFilterDialog] = useState<ManualFilterDialogState>(null);
  const [deleteItemDialog, setDeleteItemDialog] = useState<DeleteItemDialogState>(null);
  const [clusterOptions, setClusterOptions] = useState<ClusterDTO[]>([]);
  const [clusterSearch, setClusterSearch] = useState("");
  const [selectedClusterId, setSelectedClusterId] = useState<string | null>(null);
  const [isLoadingClusterOptions, setIsLoadingClusterOptions] = useState(false);
  const [advancedFiltersOpen, setAdvancedFiltersOpen] = useState(
    Boolean(initialStartDate || initialEndDate || initialSourceId || initialTitle),
  );
  const [groupSidebarExpanded, setGroupSidebarExpanded] = useState(true);
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
  const currentPage = pagination.page;
  const pageSize = pagination.size;
  const total = pagination.total;
  const totalPages = pagination.totalPages;
  const canGoPreviousPage = currentPage > 1;
  const canGoNextPage = currentPage < totalPages;
  const shouldShowPagination = total > 0;

  const summary = useMemo(
    () => ({
      rangeLabel: formatRangeLabel(range, startDate, endDate),
      sortLabel: SORT_OPTIONS.find((option) => option.value === sort)?.label ?? "按时间倒序",
    }),
    [endDate, range, sort, startDate],
  );
  const activeFilterSummary = useMemo(() => {
    const filters = [`创建时间：${summary.rangeLabel}`, `排序：${summary.sortLabel}`];

    if (titleFilter) {
      filters.push(`标题：${titleFilter}`);
    }

    if (groupId) {
      filters.push(`分组：${availableGroups.find((group) => group.id === groupId)?.name ?? groupId}`);
    }

    if (sourceId) {
      filters.push(`信息源：${availableSources.find((source) => source.id === sourceId)?.name ?? sourceId}`);
    }

    return filters;
  }, [availableGroups, availableSources, groupId, sourceId, summary.rangeLabel, summary.sortLabel, titleFilter]);
  const visibleClusterOptions = useMemo(() => {
    const normalizedSearch = clusterSearch.trim().toLocaleLowerCase();

    return clusterOptions.filter((cluster) => {
      if (cluster.status !== "active") {
        return false;
      }

      if (assignClusterDialog?.currentClusterId && cluster.id === assignClusterDialog.currentClusterId) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      return cluster.title.toLocaleLowerCase().includes(normalizedSearch);
    });
  }, [assignClusterDialog?.currentClusterId, clusterOptions, clusterSearch]);

  const resetExpandedClusterState = () => {
    setExpandedClusters({});
    setOpenClusters({});
  };

  const replaceFeedData = (nextItems: FeedEntryDTO[], nextPagination: FeedPagination) => {
    setItems(nextItems);
    setPagination(nextPagination);
    resetExpandedClusterState();
  };

  const loadFeed = (
    query: FeedQueryState,
    page = 1,
    size = pageSize,
  ) => {
    startTransition(async () => {
      const payload = await requestFeed(query, { page, size });
      replaceFeedData(payload.items, payload.pagination);
      setGroups(payload.groups ?? availableGroups);
      setGroupTotalCount(payload.groupTotalCount ?? payload.pagination.total);
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
    title: titleFilter,
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
      1,
    );
  };

  const changeSort = (nextSort: FeedSort) => {
    setSort(nextSort);
    loadFeed(
      buildQuery({
        sort: nextSort,
      }),
      1,
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
      1,
    );
  };

  const changeSource = (nextSourceId: string) => {
    const normalizedSourceId = normalizeOptionalId(nextSourceId);
    setSourceId(normalizedSourceId);
    loadFeed(
      buildQuery({
        sourceId: normalizedSourceId,
      }),
      1,
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
      1,
    );
  };

  const clearFilters = () => {
    setRange("today");
    setSort("time_desc");
    setStartDate(null);
    setEndDate(null);
    setGroupId(null);
    setSourceId(null);
    setTitleInput("");
    setTitleFilter(null);
    setAdvancedFiltersOpen(false);
    loadFeed({
      range: "today",
      sort: "time_desc",
      startDate: null,
      endDate: null,
      groupId: null,
      sourceId: null,
      title: null,
    }, 1);
  };

  const refresh = () => {
    if (!isAdmin || status?.status === "running" || queuedRefreshAt) {
      return;
    }

    startTransition(async () => {
      try {
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
        router.push(
          `/admin?tab=monitoring&section=tasks&task=${encodeURIComponent(payload.taskRun.id)}`,
        );
      } catch {
        setRefreshFeedback({ tone: "error", message: "创建抓取任务失败，请稍后重试。" });
      }
    });
  };

  const requestRegeneration = async (itemId: string, target: "translation" | "summary") => {
    const response = await fetch(`/api/admin/items/${itemId}/regenerate`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ target }),
    });
    return (await response.json()) as {
      taskRun?: {
        id: string;
      } | null;
      error?: string;
    };
  };

  const reloadCurrentFeed = () => {
    startTransition(async () => {
      const payload = await requestFeed(latestQueryRef.current, { page: currentPage, size: pageSize });
      replaceFeedData(payload.items, payload.pagination);
      setGroups(payload.groups ?? availableGroups);
      setGroupTotalCount(payload.groupTotalCount ?? payload.pagination.total);
    });
  };

  const openAssignClusterDialog = (itemId: string, itemTitle: string, currentClusterId?: string | null) => {
    setAssignClusterDialog({
      itemId,
      itemTitle,
      currentClusterId: currentClusterId ?? null,
    });
    setClusterSearch("");
    setSelectedClusterId(null);
    setIsLoadingClusterOptions(true);

    startTransition(async () => {
      try {
        const response = await fetch("/api/admin/clusters");
        const payload = (await response.json()) as {
          clusters?: ClusterDTO[];
          error?: string;
        };

        if (!response.ok || payload.error) {
          setRefreshFeedback({
            tone: "error",
            message: payload.error ?? "加载聚合组选项失败，请稍后重试。",
          });
          setAssignClusterDialog(null);
          return;
        }

        setClusterOptions(payload.clusters ?? []);
      } catch {
        setRefreshFeedback({
          tone: "error",
          message: "加载聚合组选项失败，请稍后重试。",
        });
        setAssignClusterDialog(null);
      } finally {
        setIsLoadingClusterOptions(false);
      }
    });
  };

  const confirmAssignCluster = () => {
    if (!assignClusterDialog || !selectedClusterId) {
      return;
    }

    const { itemId } = assignClusterDialog;
    setAssignClusterDialog(null);

    startTransition(async () => {
      try {
        const response = await fetch(`/api/admin/items/${itemId}/join-cluster`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({ clusterId: selectedClusterId }),
        });
        const payload = (await response.json()) as {
          error?: string;
        };

        if (!response.ok || payload.error) {
          setRefreshFeedback({
            tone: "error",
            message: payload.error ?? "加入聚合组失败，请稍后重试。",
          });
          return;
        }

        reloadCurrentFeed();
        setRefreshFeedback({
          tone: "success",
          message: "已加入聚合组。",
        });
      } catch {
        setRefreshFeedback({
          tone: "error",
          message: "加入聚合组失败，请稍后重试。",
        });
      }
    });
  };

  const confirmManualFilter = () => {
    if (!manualFilterDialog) {
      return;
    }

    const { itemId } = manualFilterDialog;
    setManualFilterDialog(null);

    startTransition(async () => {
      try {
        const response = await fetch(`/api/admin/items/${itemId}/filter`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
        });
        const payload = (await response.json()) as {
          error?: string;
        };

        if (!response.ok || payload.error) {
          setRefreshFeedback({
            tone: "error",
            message: payload.error ?? "手动过滤失败，请稍后重试。",
          });
          return;
        }

        reloadCurrentFeed();
        setRefreshFeedback({
          tone: "success",
          message: "已手动过滤该内容。",
        });
      } catch {
        setRefreshFeedback({
          tone: "error",
          message: "手动过滤失败，请稍后重试。",
        });
      }
    });
  };

  const confirmDeleteItem = () => {
    if (!deleteItemDialog) {
      return;
    }

    const { itemId } = deleteItemDialog;
    setDeleteItemDialog(null);

    startTransition(async () => {
      try {
        const response = await fetch(`/api/admin/items/${itemId}`, {
          method: "DELETE",
          headers: {
            "content-type": "application/json",
          },
        });
        const payload = (await response.json()) as {
          error?: string;
        };

        if (!response.ok || payload.error) {
          setRefreshFeedback({
            tone: "error",
            message: payload.error ?? "删除内容失败，请稍后重试。",
          });
          return;
        }

        reloadCurrentFeed();
        setRefreshFeedback({
          tone: "success",
          message: "已删除该内容。",
        });
      } catch {
        setRefreshFeedback({
          tone: "error",
          message: "删除内容失败，请稍后重试。",
        });
      }
    });
  };

  const runRegeneration = (targets: Array<"translation" | "summary">) => {
    if (!regenerateDialog) {
      return;
    }

    const { itemId, shouldAnnounceClusterRefresh } = regenerateDialog;
    setRegenerateDialog(null);

    startTransition(async () => {
      const createdTaskRunIds: string[] = [];

      for (const target of targets) {
        const payload = await requestRegeneration(itemId, target);

        if (payload.error) {
          setRefreshFeedback({ tone: "error", message: payload.error });
          return;
        }

        if (!payload.taskRun) {
          setRefreshFeedback({ tone: "error", message: "未返回后台任务信息。" });
          return;
        }

        createdTaskRunIds.push(payload.taskRun.id);
      }

      const primaryTaskRunId = createdTaskRunIds[0];
      if (!primaryTaskRunId) {
        setRefreshFeedback({ tone: "error", message: "未返回后台任务信息。" });
        return;
      }

      router.push(`/admin?tab=monitoring&section=tasks&task=${encodeURIComponent(primaryTaskRunId)}`);

      if (shouldAnnounceClusterRefresh) {
        setRefreshFeedback(null);
      }
    });
  };

  const openRegenerateDialog = (
    itemId: string,
    canRegenerateTranslation: boolean,
    options?: {
      shouldAnnounceClusterRefresh?: boolean;
    },
  ) => {
    setRegenerateDialog({
      itemId,
      canRegenerateTranslation,
      shouldAnnounceClusterRefresh: options?.shouldAnnounceClusterRefresh ?? false,
    });
    setRegenerateMode("summary");
  };

  const confirmRegeneration = () => {
    if (!regenerateDialog) {
      return;
    }

    if (regenerateMode === "translation") {
      runRegeneration(["translation"]);
      return;
    }

    if (regenerateMode === "both") {
      runRegeneration(["translation", "summary"]);
      return;
    }

    runRegeneration(["summary"]);
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
      title: titleFilter,
    };
  }, [endDate, groupId, range, sort, sourceId, startDate, titleFilter]);

  useEffect(() => {
    if (didHydrateTimeZoneRef.current) {
      return;
    }

    didHydrateTimeZoneRef.current = true;

    if (getBrowserTimeZoneOffsetMinutes() === 0 || !isTimeZoneSensitiveQuery(range, startDate, endDate)) {
      return;
    }

    startTransition(async () => {
      const payload = await requestFeed({
        range,
        sort,
        startDate,
        endDate,
        groupId,
        sourceId,
        title: titleFilter,
      }, { page: 1, size: pageSize });
      setItems(payload.items);
      setPagination(payload.pagination);
      setGroups(payload.groups ?? availableGroups);
      resetExpandedClusterState();
      setRefreshFeedback(null);
    });
  }, [availableGroups, endDate, groupId, pageSize, range, sort, sourceId, startDate, titleFilter]);

  useEffect(() => {
    if (skipTitleEffectRef.current) {
      skipTitleEffectRef.current = false;
      return;
    }

    const timer = window.setTimeout(() => {
      const normalizedTitle = normalizeSearchText(titleInput);

      if (normalizedTitle === latestQueryRef.current.title) {
        setTitleFilter(normalizedTitle);
        return;
      }

      setTitleFilter(normalizedTitle);

      startTransition(async () => {
        const payload = await requestFeed({
          ...latestQueryRef.current,
          title: normalizedTitle,
        }, { page: 1, size: pageSize });
        setItems(payload.items);
        setPagination(payload.pagination);
        setGroups(payload.groups ?? availableGroups);
        resetExpandedClusterState();
        setRefreshFeedback(null);
      });
    }, TITLE_SEARCH_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [availableGroups, pageSize, titleInput]);

  useEffect(() => {
    if (!isAdmin) {
      return;
    }

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
          title: titleFilter,
        }, { page: 1, size: pageSize });
        setItems(feedPayload.items);
        setPagination(feedPayload.pagination);
        setGroups(feedPayload.groups ?? availableGroups);
        resetExpandedClusterState();
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
  }, [availableGroups, endDate, groupId, isAdmin, pageSize, queuedRefreshAt, range, sort, sourceId, startDate, startTransition, status, titleFilter]);

  useEffect(() => {
    setJumpToPage(String(currentPage));
  }, [currentPage]);

  const goToPreviousPage = () => {
    if (!canGoPreviousPage) {
      return;
    }

    loadFeed(buildQuery(), currentPage - 1, pageSize);
  };

  const goToNextPage = () => {
    if (!canGoNextPage) {
      return;
    }

    loadFeed(buildQuery(), currentPage + 1, pageSize);
  };

  const handlePageSizeChange = (value: unknown) => {
    const nextSize = Number(value);
    if (!FEED_PAGE_SIZE_OPTIONS.includes(nextSize as (typeof FEED_PAGE_SIZE_OPTIONS)[number])) {
      return;
    }

    loadFeed(buildQuery(), 1, nextSize);
  };

  const handleJumpToPage = () => {
    const nextPage = Number.parseInt(jumpToPage, 10);
    if (!Number.isFinite(nextPage)) {
      setJumpToPage(String(currentPage));
      return;
    }

    const normalizedPage = Math.min(Math.max(1, nextPage), totalPages);
    if (normalizedPage === currentPage) {
      setJumpToPage(String(normalizedPage));
      return;
    }

    loadFeed(buildQuery(), normalizedPage, pageSize);
  };

  const neutralBadgeClassName =
    "inline-flex items-center rounded-sm border border-[color:var(--line)] bg-[var(--surface-muted)] px-2 py-1 text-xs text-[var(--muted)]";
  const denseCardClassName =
    "w-full rounded-lg border border-[color:var(--line)] bg-white px-4 py-4 shadow-[var(--shadow-sm)] transition hover:border-[color:var(--line-strong)] hover:shadow-md sm:px-6 sm:py-5";
  const cardMetaRowClassName = "flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-[var(--muted)]";
  const cardSummaryClassName = "text-sm leading-6 text-[var(--muted)]";
  const cardTitleClassName = "text-xl font-semibold leading-7 text-[var(--foreground)]";
  const metaTextClassName = "inline-flex items-center";
  const iconButtonClassName =
    "feed-card-icon-button inline-flex items-center justify-center rounded-sm border border-transparent bg-transparent p-1.5 text-[var(--text-2)] transition hover:bg-[var(--bg-muted)] hover:text-[var(--text-1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/35 disabled:cursor-not-allowed disabled:opacity-50";
  const clusterToggleClassName =
    "inline-flex shrink-0 items-center gap-1 bg-transparent px-0 py-0 text-left text-[11px] leading-none text-[var(--muted)] transition hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(59,130,246,0.28)] focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:cursor-not-allowed disabled:opacity-55";
  const paginationButtonClassName =
    "inline-flex items-center justify-center rounded-sm px-3 py-1.5 text-sm font-medium border border-[color:var(--line)] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(59,130,246,0.35)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface)]";
  const paginationBadgeClassName =
    "px-4 py-2 text-sm rounded-sm border border-[color:var(--line)] bg-[var(--surface)] text-[var(--muted)]";
  const hasClearableFilters = activeFilterSummary.length > 0;
  const latestRunSummary = formatRunSummary(status);
  const latestRunDetail = formatRunDetail(status);
  const isRefreshDisabled =
    isPending || status?.status === "running" || Boolean(queuedRefreshAt);
  return (
    <PageShell
      header={{
        activeNav: "home",
        isAdmin,
      }}
      contentClassName="gap-5 sm:gap-6"
      contentPaddingClassName="px-4 pt-3 pb-6 sm:px-6 sm:pt-4 sm:pb-8 lg:px-8 lg:pt-4 lg:pb-10"
      sidebarContainerClassName={cx(
        "flex-shrink-0 transition-all duration-300",
        groupSidebarExpanded ? "lg:w-56" : "lg:w-12",
      )}
      sidebarVisibility="lg"
      sidebar={
        <GroupFilterSidebar
          groups={groups}
          totalCount={groupTotalCount}
          selectedGroupId={groupId}
          expanded={groupSidebarExpanded}
          onToggle={() => setGroupSidebarExpanded((current) => !current)}
          onSelect={changeGroup}
        />
      }
    >
      <section className="w-full grid gap-4">
        <section
          role="region"
          aria-label="信息流筛选"
          className="panel-raised w-full rounded-sm border border-[color:var(--line)] p-4 sm:p-6"
        >
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex min-w-0 flex-wrap items-center gap-2 lg:flex-1 lg:flex-nowrap">
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
                    disabled={isRefreshDisabled}
                    className="lumina-home-action-button lumina-home-action-button--primary inline-flex items-center justify-center whitespace-nowrap rounded-sm bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-white transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(59,130,246,0.35)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface)] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <span className="inline-flex items-center gap-2">
                      <RefreshIcon />
                      <span>立即刷新</span>
                    </span>
                  </button>
                ) : null}
                {isAdmin ? (
                  <span className="min-w-0 text-sm text-[var(--text-2)] lg:truncate">
                    {latestRunSummary}
                  </span>
                ) : null}
              </div>

              <div className="flex items-center gap-3 lg:flex-nowrap lg:justify-end lg:pl-4">
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

            <div className="lg:hidden">
              <div className="rounded-sm border border-[color:var(--line)] bg-white px-3 py-3 shadow-[var(--shadow-sm)]">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <span className="text-sm font-medium text-[var(--foreground)]">分组筛选</span>
                  <FilterSelectInline
                    label="分组："
                    ariaLabel="移动端分组筛选"
                    value={groupId ?? ""}
                    onChange={changeGroup}
                    options={[
                      { value: "", label: formatGroupOptionLabel("全部内容", groupTotalCount) },
                      ...groups.map((group) => ({
                        value: group.id,
                        label: formatGroupOptionLabel(group.name, group.count),
                      })),
                    ]}
                    showSearch={false}
                  />
                </div>
              </div>
            </div>

            {advancedFiltersOpen ? (
              <div className="border-t border-[color:var(--line)] pt-4">
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  <FilterInput
                    id="feed-title-filter"
                    label="标题模糊搜索"
                    value={titleInput}
                    onChange={setTitleInput}
                    placeholder="输入标题关键词"
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
              details={isAdmin && latestRunDetail ? <span>{latestRunDetail}</span> : null}
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
                  <div className="space-y-3">
                    <h2 className={cardTitleClassName}>{entry.title}</h2>
                    <div className={cardMetaRowClassName}>
                      <span className="rounded-sm bg-[var(--accent-soft)] px-2 py-1 text-[11px] text-[var(--accent-strong)]">聚合</span>
                      <span className={neutralBadgeClassName}>{formatScore(entry.score)}</span>
                      <span className={metaTextClassName}>{formatMetaLabel("来源", formatClusterSourceLabel(entry))}</span>
                      <span className={metaTextClassName}>{formatMetaLabel("作者", formatClusterAuthorLabel(entry))}</span>
                      <span className={metaTextClassName}>{formatMetaLabel("发表", formatDate(entry.latestPublishedAt))}</span>
                    </div>
                    <p className={cardSummaryClassName}>{entry.summary}</p>
                    <div className="mt-4">
                      <div className="flex items-center gap-3">
                        <button
                          aria-label={openClusters[entry.id] ? "收起相关内容" : "展开相关内容"}
                          aria-expanded={Boolean(openClusters[entry.id])}
                          className={clusterToggleClassName}
                          type="button"
                          onClick={() => toggleCluster(entry.id)}
                          disabled={isPending}
                        >
                          <ChevronIcon expanded={Boolean(openClusters[entry.id])} className="h-3.5 w-3.5" />
                          <span>{entry.itemCount} 条</span>
                        </button>
                        <div aria-hidden="true" className="h-px flex-1 bg-[color:var(--line)]" />
                      </div>
                    </div>
                  </div>

                  {openClusters[entry.id] ? (
                    <div className="mt-3 space-y-2">
                      {(expandedClusters[entry.id] ?? entry.itemsPreview).map((clusterItem) => (
                        <div
                          key={clusterItem.id}
                          className="rounded-sm border border-[color:var(--line)] bg-[var(--surface)] px-3 py-3"
                        >
                          <div className="space-y-2">
                            <div className="flex items-start justify-between gap-3">
                              <a
                                className="block min-w-0 flex-1 text-base font-medium leading-6 text-[var(--foreground)] underline decoration-transparent underline-offset-4 transition hover:decoration-[var(--accent)]"
                                href={clusterItem.originalUrl}
                                target="_blank"
                                rel="noreferrer"
                              >
                                {clusterItem.title}
                              </a>
                              {isAdmin ? (
                                <div className="flex shrink-0 items-center gap-0.5">
                                  <button
                                    aria-label={`加入聚合组：${clusterItem.title}`}
                                    title="加入聚合组"
                                    className={iconButtonClassName}
                                    type="button"
                                    onClick={() => openAssignClusterDialog(clusterItem.id, clusterItem.title, entry.id)}
                                    disabled={isPending}
                                  >
                                    <IconPlus className="h-4 w-4" />
                                  </button>
                                  <button
                                    aria-label={`手动过滤：${clusterItem.title}`}
                                    title="手动过滤"
                                    className={iconButtonClassName}
                                    type="button"
                                    onClick={() =>
                                      setManualFilterDialog({ itemId: clusterItem.id, itemTitle: clusterItem.title })
                                    }
                                    disabled={isPending}
                                  >
                                    <IconFilter className="h-4 w-4" />
                                  </button>
                                  <button
                                    aria-label={`重新生成内容：${clusterItem.title}`}
                                    title="重新生成内容"
                                    className={iconButtonClassName}
                                    type="button"
                                    onClick={() =>
                                      openRegenerateDialog(clusterItem.id, Boolean(clusterItem.canRegenerateTranslation), {
                                        shouldAnnounceClusterRefresh: true,
                                      })
                                    }
                                    disabled={isPending}
                                  >
                                    <RefreshIcon />
                                  </button>
                                  <button
                                    aria-label={`删除内容：${clusterItem.title}`}
                                    title="删除内容"
                                    className={iconButtonClassName}
                                    type="button"
                                    onClick={() =>
                                      setDeleteItemDialog({ itemId: clusterItem.id, itemTitle: clusterItem.title })
                                    }
                                    disabled={isPending}
                                  >
                                    <IconTrash className="h-4 w-4" />
                                  </button>
                                </div>
                              ) : null}
                            </div>
                            <div className={cardMetaRowClassName}>
                              <span className={neutralBadgeClassName}>{formatScore(clusterItem.score)}</span>
                              <span className={metaTextClassName}>{formatMetaLabel("来源", clusterItem.sourceName)}</span>
                              <span className={metaTextClassName}>{formatMetaLabel("作者", clusterItem.author || "未知作者")}</span>
                              <span className={metaTextClassName}>{formatMetaLabel("发表", formatDate(clusterItem.publishedAt))}</span>
                            </div>
                            <p className={cardSummaryClassName}>{clusterItem.summary}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </article>
              ) : (
                <article key={entry.id} className={denseCardClassName}>
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <h2 className={cx(cardTitleClassName, "min-w-0 flex-1")}>
                        <a
                          className="underline decoration-transparent underline-offset-4 transition hover:decoration-[var(--accent)]"
                          href={entry.originalUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {entry.title}
                        </a>
                      </h2>
                      {isAdmin ? (
                        <div className="flex shrink-0 items-center gap-0.5">
                          <button
                            aria-label={`加入聚合组：${entry.title}`}
                            title="加入聚合组"
                            className={iconButtonClassName}
                            type="button"
                            onClick={() => openAssignClusterDialog(entry.id, entry.title)}
                            disabled={isPending}
                          >
                            <IconPlus className="h-4 w-4" />
                          </button>
                          <button
                            aria-label={`手动过滤：${entry.title}`}
                            title="手动过滤"
                            className={iconButtonClassName}
                            type="button"
                            onClick={() => setManualFilterDialog({ itemId: entry.id, itemTitle: entry.title })}
                            disabled={isPending}
                          >
                            <IconFilter className="h-4 w-4" />
                          </button>
                          <button
                            aria-label="重新生成内容"
                            title="重新生成内容"
                            className={iconButtonClassName}
                            type="button"
                            onClick={() => openRegenerateDialog(entry.id, Boolean(entry.canRegenerateTranslation))}
                            disabled={isPending}
                          >
                            <RefreshIcon />
                          </button>
                          <button
                            aria-label={`删除内容：${entry.title}`}
                            title="删除内容"
                            className={iconButtonClassName}
                            type="button"
                            onClick={() => setDeleteItemDialog({ itemId: entry.id, itemTitle: entry.title })}
                            disabled={isPending}
                          >
                            <IconTrash className="h-4 w-4" />
                          </button>
                        </div>
                      ) : null}
                    </div>
                    <div className={cardMetaRowClassName}>
                      <span className={neutralBadgeClassName}>{formatScore(entry.score)}</span>
                      <span className={metaTextClassName}>{formatMetaLabel("来源", entry.sourceName)}</span>
                      <span className={metaTextClassName}>{formatMetaLabel("作者", entry.author || "未知作者")}</span>
                      <span className={metaTextClassName}>{formatMetaLabel("发表", formatDate(entry.publishedAt))}</span>
                    </div>
                    <p className={cardSummaryClassName}>{entry.summary}</p>
                  </div>
                </article>
              ),
            )
          )}
        </section>

        {shouldShowPagination ? (
          <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2 text-sm text-[var(--muted)]">
              <span>每页显示</span>
              <SelectField
                aria-label="每页显示"
                value={pageSize}
                onChange={handlePageSizeChange}
                className="w-20"
                options={FEED_PAGE_SIZE_OPTIONS.map((option) => ({
                  value: option,
                  label: String(option),
                }))}
              />
              <span>条，共 {total} 条</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={goToPreviousPage}
                disabled={!canGoPreviousPage || isPending}
                className={cx(
                  paginationButtonClassName,
                  canGoPreviousPage && !isPending
                    ? "bg-[var(--surface)] text-[var(--muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--foreground)]"
                    : "cursor-not-allowed bg-[var(--surface-muted)] text-[var(--muted)]/70",
                )}
              >
                上一页
              </button>
              <span className={paginationBadgeClassName}>
                第 {currentPage} / {totalPages} 页
              </span>
              <button
                type="button"
                onClick={goToNextPage}
                disabled={!canGoNextPage || isPending}
                className={cx(
                  paginationButtonClassName,
                  canGoNextPage && !isPending
                    ? "bg-[var(--surface)] text-[var(--muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--foreground)]"
                    : "cursor-not-allowed bg-[var(--surface-muted)] text-[var(--muted)]/70",
                )}
              >
                {isPending ? "加载中..." : "下一页"}
              </button>
              <div className="ml-2 flex flex-none items-center gap-1 whitespace-nowrap">
                <TextInput
                  aria-label="跳转页码"
                  type="number"
                  value={jumpToPage}
                  onChange={(event) => setJumpToPage(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      handleJumpToPage();
                    }
                  }}
                  className="w-16 text-center"
                  compact
                  min={1}
                  max={totalPages}
                />
                <Button onClick={handleJumpToPage} variant="primary" size="sm" className="whitespace-nowrap">
                  跳转
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        <ModalShell
          isOpen={Boolean(assignClusterDialog)}
          onClose={() => setAssignClusterDialog(null)}
          title="手动加入聚合组"
          widthClassName="max-w-2xl"
          bodyClassName="space-y-4 p-4"
          footer={
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setAssignClusterDialog(null)} disabled={isPending}>
                取消
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={confirmAssignCluster}
                disabled={isPending || !selectedClusterId}
              >
                确认加入
              </Button>
            </div>
          }
        >
          <div className="space-y-4">
            <p className="text-sm text-[var(--muted)]">
              为“{assignClusterDialog?.itemTitle ?? ""}”搜索并选择目标聚合组。
            </p>
            <FormField label="搜索聚合标题" htmlFor="assign-cluster-search">
              <TextInput
                id="assign-cluster-search"
                aria-label="搜索聚合标题"
                value={clusterSearch}
                onChange={(event) => setClusterSearch(event.target.value)}
                placeholder="输入聚合标题关键词"
              />
            </FormField>
            <div className="max-h-72 space-y-2 overflow-y-auto rounded-sm border border-[color:var(--line)] p-2">
              {isLoadingClusterOptions ? (
                <p className="px-2 py-3 text-sm text-[var(--muted)]">正在加载聚合组选项...</p>
              ) : visibleClusterOptions.length ? (
                visibleClusterOptions.map((cluster) => {
                  const isSelected = selectedClusterId === cluster.id;

                  return (
                    <button
                      key={cluster.id}
                      type="button"
                      aria-pressed={isSelected}
                      aria-label={`选择聚合组：${cluster.title}`}
                      onClick={() => setSelectedClusterId(cluster.id)}
                      className={cx(
                        "w-full rounded-sm border px-3 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(59,130,246,0.28)]",
                        isSelected
                          ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-strong)]"
                          : "border-[color:var(--line)] bg-[var(--surface)] hover:bg-[var(--surface-muted)]",
                      )}
                    >
                      <div className="text-sm font-medium">{cluster.title}</div>
                      <div className="mt-1 text-xs text-[var(--muted)]">{cluster.itemCount} 条内容</div>
                    </button>
                  );
                })
              ) : (
                <p className="px-2 py-3 text-sm text-[var(--muted)]">没有匹配的聚合组。</p>
              )}
            </div>
          </div>
        </ModalShell>

        <ModalShell
          isOpen={Boolean(manualFilterDialog)}
          onClose={() => setManualFilterDialog(null)}
          title="确认手动过滤"
          widthClassName="max-w-md"
          bodyClassName="space-y-3 p-4"
          footer={
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setManualFilterDialog(null)} disabled={isPending}>
                取消
              </Button>
              <Button type="button" variant="primary" onClick={confirmManualFilter} disabled={isPending}>
                确认过滤
              </Button>
            </div>
          }
        >
          <div className="space-y-3 text-sm text-[var(--muted)]">
            <p>将“{manualFilterDialog?.itemTitle ?? ""}”标记为手动过滤。</p>
            <p>过滤后该内容会立即从主页列表中移除。</p>
          </div>
        </ModalShell>

        <ModalShell
          isOpen={Boolean(deleteItemDialog)}
          onClose={() => setDeleteItemDialog(null)}
          title="确认删除内容"
          widthClassName="max-w-md"
          bodyClassName="space-y-3 p-4"
          footer={
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setDeleteItemDialog(null)} disabled={isPending}>
                取消
              </Button>
              <Button type="button" variant="danger" onClick={confirmDeleteItem} disabled={isPending}>
                确认删除
              </Button>
            </div>
          }
        >
          <div className="space-y-3 text-sm text-[var(--muted)]">
            <p>将永久删除“{deleteItemDialog?.itemTitle ?? ""}”。</p>
            <p>删除后会立即从主页列表移除，并自动重算所属聚合。</p>
          </div>
        </ModalShell>

        <ModalShell
          isOpen={Boolean(regenerateDialog)}
          onClose={() => setRegenerateDialog(null)}
          title="选择重新生成内容"
          widthClassName="max-w-sm"
          showCloseButton={false}
          bodyClassName="space-y-4 p-4"
          footer={
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setRegenerateDialog(null)} disabled={isPending}>
                取消
              </Button>
              <Button type="button" variant="primary" onClick={confirmRegeneration} disabled={isPending}>
                确认
              </Button>
            </div>
          }
        >
          <div className="space-y-4">
            <p className="text-sm text-[var(--muted)]">请选择要重新生成的内容范围。</p>
            <FormField label="重新生成范围" className="w-full">
              <SelectField
                aria-label="重新生成范围"
                value={regenerateMode}
                onChange={(value) => setRegenerateMode((value as RegenerateMode | null) ?? "summary")}
                showSearch={false}
                className="w-full"
                options={[
                  { value: "summary", label: "仅摘要" },
                  ...(regenerateDialog?.canRegenerateTranslation
                    ? [
                        { value: "translation", label: "仅翻译" },
                        { value: "both", label: "全部重新生成" },
                      ]
                    : []),
                ]}
              />
            </FormField>
          </div>
        </ModalShell>
      </section>
    </PageShell>
  );
}
