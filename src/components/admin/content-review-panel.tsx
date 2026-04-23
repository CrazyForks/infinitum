"use client";

import type { Dispatch, SetStateAction } from "react";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";

import { PageShell } from "@/components/ui/page-shell";
import { FilterInput } from "@/components/ui/filter-input";
import { FilterSelect } from "@/components/ui/filter-select";
import { ModalShell } from "@/components/ui/modal-shell";
import { IconButton } from "@/components/ui/icon-button";
import { Button } from "@/components/ui/button";
import { StatusTag } from "@/components/ui/status-tag";
import { useToast } from "@/components/ui/toast";
import {
  IconRotateCw,
  IconCheck,
  IconX,
  IconExternalLink,
  IconTrash,
  IconMerge,
} from "@/components/ui/icons";
import type { ClusterDTO, ReviewItemDTO } from "@/lib/feed/types";
import { cx } from "@/lib/ui/cx";

type ReviewTab = "filtered" | "clusters";
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

const reviewReasonLabels: Record<NonNullable<ReviewItemDTO["moderationReason"]>, string> = {
  marketing: "营销内容",
  low_quality: "低质量",
  duplicate_noise: "重复噪音",
  rule_blacklist: "规则黑名单",
  other: "其他原因",
};

const reviewReasonTone: Record<NonNullable<ReviewItemDTO["moderationReason"]>, "neutral" | "warning" | "danger"> = {
  marketing: "warning",
  low_quality: "neutral",
  duplicate_noise: "neutral",
  rule_blacklist: "danger",
  other: "neutral",
};

const clusterStatusLabels: Record<ClusterDTO["status"], string> = {
  active: "显示中",
  hidden: "已隐藏",
};

const clusterStatusTone: Record<ClusterDTO["status"], "success" | "neutral"> = {
  active: "success",
  hidden: "neutral",
};

// Time range filter options
const timeRangeOptions: Array<{ value: TimeRangeFilter; label: string }> = [
  { value: "", label: "全部时间" },
  { value: "today", label: "今天" },
  { value: "week", label: "最近7天" },
  { value: "month", label: "最近30天" },
];

type TimeRangeFilter = "" | "today" | "week" | "month";

const subtleCardClassName =
  "rounded-[0.95rem] border border-[color:var(--line)] bg-[var(--surface-muted)]/82 shadow-[var(--shadow-sm)]";
const secondaryButtonClassName =
  "inline-flex min-h-8 items-center justify-center rounded-[0.8rem] border border-[color:var(--line)] bg-white px-2.5 py-1.5 text-[13px] font-medium text-[var(--foreground)] shadow-[var(--shadow-sm)] transition hover:bg-[var(--surface)] disabled:cursor-not-allowed disabled:opacity-55";

const dateTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Shanghai",
});

const dateFormatter = new Intl.DateTimeFormat("zh-CN", {
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Shanghai",
});

function formatDateTime(value: string) {
  return dateTimeFormatter.format(new Date(value));
}

function formatDate(value: string) {
  return dateFormatter.format(new Date(value));
}

function getLocalDateString(date: Date): string {
  // Use browser's local timezone and return YYYY-MM-DD format
  return date.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function isWithinTimeRange(dateValue: string, timeRange: TimeRangeFilter): boolean {
  if (!timeRange) return true;

  const date = new Date(dateValue);
  const now = new Date();

  // Get local timezone dates
  const dateLocalDate = getLocalDateString(date);
  const nowLocalDate = getLocalDateString(now);

  // Parse dates for comparison
  const [dateYear, dateMonth, dateDay] = dateLocalDate.split("/").map(Number);
  const [nowYear, nowMonth, nowDay] = nowLocalDate.split("/").map(Number);

  // Calculate days difference based on local dates
  const dateLocalTime = new Date(dateYear, dateMonth - 1, dateDay).getTime();
  const nowLocalTime = new Date(nowYear, nowMonth - 1, nowDay).getTime();
  const diffDays = (nowLocalTime - dateLocalTime) / (1000 * 60 * 60 * 24);

  if (timeRange === "today") return diffDays === 0;
  if (timeRange === "week") return diffDays >= 0 && diffDays <= 6;
  if (timeRange === "month") return diffDays >= 0 && diffDays <= 29;
  return true;
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

async function executeWithPendingId(
  id: string,
  setPendingId: Dispatch<SetStateAction<string | null>>,
  action: () => Promise<void>,
) {
  setPendingId(id);

  try {
    await action();
  } finally {
    setPendingId((current) => (current === id ? null : current));
  }
}

// Filtered Item Detail Modal
interface FilteredItemDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: ReviewItemDTO | null;
  onRestore?: () => void;
  onReanalyze?: () => void;
  isRestoring?: boolean;
  isReanalyzing?: boolean;
}

function FilteredItemDetailModal({
  isOpen,
  onClose,
  item,
  onRestore,
  onReanalyze,
  isRestoring,
  isReanalyzing,
}: FilteredItemDetailModalProps) {
  if (!item) return null;

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title="过滤内容详情"
      widthClassName="max-w-2xl"
      headerClassName="border-b border-[color:var(--line)] p-6"
      bodyClassName="space-y-4 p-6"
      footerClassName="border-t border-[color:var(--line)] bg-[var(--bg-muted)] p-6"
      footer={
        <div className="flex justify-end gap-2">
          {onRestore && (
            <Button onClick={onRestore} variant="primary" disabled={isRestoring}>
              <IconCheck className={cx("h-4 w-4 mr-1", isRestoring && "animate-pulse")} />
              恢复内容
            </Button>
          )}
          {onReanalyze && (
            <Button onClick={onReanalyze} variant="secondary" disabled={isReanalyzing}>
              <IconRotateCw className={cx("h-4 w-4 mr-1", isReanalyzing && "animate-spin")} />
              重新 AI 判定
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
          <div className="font-medium text-[var(--text-1)] mb-2">{item.title}</div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="text-[var(--text-3)]">来源:</span> {item.sourceName}
            </div>
            <div>
              <span className="text-[var(--text-3)]">发布时间:</span> {formatDateTime(item.publishedAt)}
            </div>
            <div>
              <span className="text-[var(--text-3)]">过滤原因:</span>{" "}
              <StatusTag tone={reviewReasonTone[item.moderationReason ?? "other"]}>
                {getReviewReasonLabel(item.moderationReason)}
              </StatusTag>
            </div>
            <div>
              <span className="text-[var(--text-3)]">质量分:</span> {item.qualityScore}
            </div>
          </div>
        </div>

        {/* Summary */}
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-[var(--text-1)]">内容摘要</h4>
          <p className="text-sm text-[var(--text-2)] leading-6">{item.summary || "暂无摘要"}</p>
        </div>

        {/* Moderation Detail */}
        {(item.moderationDetail || item.qualityRationale) && (
          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-[var(--text-1)]">审核说明</h4>
            <p className="text-sm text-[var(--text-2)] leading-6">
              {item.moderationDetail || item.qualityRationale}
            </p>
          </div>
        )}

        {/* External Link */}
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-[var(--text-1)]">原文链接</h4>
          <a
            href={item.originalUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-sm text-[var(--accent)] hover:underline"
          >
            {item.originalUrl}
            <IconExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>
    </ModalShell>
  );
}

// Cluster Detail Modal
interface ClusterDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  cluster: ClusterDTO | null;
  onRegenerateSummary?: () => void;
  onToggleStatus?: () => void;
  onDetachItem?: (itemId: string) => void;
  onMerge?: () => void;
  isRegenerating?: boolean;
  isTogglingStatus?: boolean;
}

function ClusterDetailModal({
  isOpen,
  onClose,
  cluster,
  onRegenerateSummary,
  onToggleStatus,
  onDetachItem,
  onMerge,
  isRegenerating,
  isTogglingStatus,
}: ClusterDetailModalProps) {
  if (!cluster) return null;

  const isHidden = cluster.status === "hidden";

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title="聚合详情"
      widthClassName="max-w-3xl"
      headerClassName="border-b border-[color:var(--line)] p-6"
      bodyClassName="space-y-4 p-6 max-h-[70vh] overflow-y-auto"
      footerClassName="border-t border-[color:var(--line)] bg-[var(--bg-muted)] p-6"
      footer={
        <div className="flex justify-end gap-2">
          {onMerge && (
            <Button onClick={onMerge} variant="secondary">
              <IconMerge className="h-4 w-4 mr-1" />
              合并聚合组
            </Button>
          )}
          {onRegenerateSummary && (
            <Button onClick={onRegenerateSummary} variant="secondary" disabled={isRegenerating}>
              <IconRotateCw className={cx("h-4 w-4 mr-1", isRegenerating && "animate-spin")} />
              重新生成摘要
            </Button>
          )}
          {onToggleStatus && (
            <Button
              onClick={onToggleStatus}
              variant={isHidden ? "primary" : "secondary"}
              disabled={isTogglingStatus}
            >
              {isHidden ? (
                <>
                  <IconCheck className="h-4 w-4 mr-1" />
                  恢复显示
                </>
              ) : (
                <>
                  <IconX className="h-4 w-4 mr-1" />
                  隐藏聚合
                </>
              )}
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
          <div className="font-medium text-[var(--text-1)] mb-2">{cluster.title}</div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="text-[var(--text-3)]">内容数:</span> {cluster.itemCount} 条
            </div>
            <div>
              <span className="text-[var(--text-3)]">最新发布:</span>{" "}
              {formatDateTime(cluster.latestPublishedAt)}
            </div>
            <div>
              <span className="text-[var(--text-3)]">状态:</span>{" "}
              <StatusTag tone={clusterStatusTone[cluster.status]}>
                {clusterStatusLabels[cluster.status]}
              </StatusTag>
            </div>
            <div>
              <span className="text-[var(--text-3)]">质量分:</span> {cluster.score}
            </div>
          </div>
        </div>

        {/* Summary */}
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-[var(--text-1)]">聚合摘要</h4>
          <p className="text-sm text-[var(--text-2)] leading-6">
            {cluster.summary || "暂无摘要"}
          </p>
        </div>

        {/* Items List */}
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-[var(--text-1)]">
            包含内容 ({cluster.items.length})
          </h4>
          <div className="space-y-2 max-h-[300px] overflow-y-auto">
            {cluster.items.map((item) => (
              <div
                key={item.id}
                className={cx(subtleCardClassName, "p-3 flex items-start justify-between gap-3")}
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="font-medium text-sm text-[var(--foreground)] truncate">
                    {item.title}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
                    <span>{item.sourceName}</span>
                    <span>{formatDate(item.publishedAt)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <IconButton
                    onClick={() => window.open(item.originalUrl, "_blank")}
                    variant="ghost"
                    size="sm"
                    title="查看原文"
                  >
                    <IconExternalLink className="h-4 w-4" />
                  </IconButton>
                  {onDetachItem && (
                    <IconButton
                      onClick={() => onDetachItem(item.id)}
                      variant="ghost"
                      size="sm"
                      title="移出聚合"
                    >
                      <IconTrash className="h-4 w-4" />
                    </IconButton>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </ModalShell>
  );
}

interface ContentReviewContentProps {
  initialTab?: ReviewTab;
}

function ContentReviewContent({ initialTab = "filtered" }: ContentReviewContentProps) {
  const { showToast } = useToast();
  const activeTab = initialTab;
  const [filteredItems, setFilteredItems] = useState<ReviewItemDTO[]>([]);
  const [clusters, setClusters] = useState<ClusterDTO[]>([]);
  const [filteredSearch, setFilteredSearch] = useState("");
  const [filteredSource, setFilteredSource] = useState("");
  const [filteredReason, setFilteredReason] = useState("");
  const [clusterSearch, setClusterSearch] = useState("");
  const [clusterStatus, setClusterStatus] = useState<ClusterDTO["status"] | "">("");
  const [clusterTimeRange, setClusterTimeRange] = useState<TimeRangeFilter>("");
  const [isPending, startTransition] = useTransition();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Detail modal states
  const [selectedFilteredItem, setSelectedFilteredItem] = useState<ReviewItemDTO | null>(null);
  const [selectedCluster, setSelectedCluster] = useState<ClusterDTO | null>(null);
  const [isFilteredDetailOpen, setIsFilteredDetailOpen] = useState(false);
  const [isClusterDetailOpen, setIsClusterDetailOpen] = useState(false);

  // Action states
  const [restoringItemId, setRestoringItemId] = useState<string | null>(null);
  const [reanalyzingItemId, setReanalyzingItemId] = useState<string | null>(null);
  const [regeneratingClusterId, setRegeneratingClusterId] = useState<string | null>(null);
  const [togglingClusterId, setTogglingClusterId] = useState<string | null>(null);
  const [mergingClusterId, setMergingClusterId] = useState<string | null>(null);

  // Merge modal states
  const [isMergeModalOpen, setIsMergeModalOpen] = useState(false);
  const [mergeTargetId, setMergeTargetId] = useState<string | null>(null);
  const [mergeSourceIds, setMergeSourceIds] = useState<Set<string>>(new Set());
  const [mergeSearchQuery, setMergeSearchQuery] = useState("");

  // Confirmation modal states
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    confirmText?: string;
    variant?: "danger" | "primary";
  }>({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: () => {},
  });

  const fetchData = useCallback(() => {
    let cancelled = false;

    startTransition(async () => {
      try {
        // Only fetch data needed for current tab
        if (activeTab === "filtered") {
          const filteredResponse = await fetch("/api/admin/items?moderationStatus=filtered");
          const filteredPayload = (await filteredResponse.json()) as CollectionPayload;

          if (cancelled) {
            return;
          }

          const filteredError = getResponseError(filteredResponse, filteredPayload, "审核数据加载失败。");

          if (filteredError) {
            showToast(filteredError, "error");
          } else {
            setFilteredItems(filteredPayload.items ?? []);
          }
        } else {
          const clusterResponse = await fetch("/api/admin/clusters");
          const clusterPayload = (await clusterResponse.json()) as CollectionPayload;

          if (cancelled) {
            return;
          }

          const clusterError = getResponseError(clusterResponse, clusterPayload, "审核数据加载失败。");

          if (clusterError) {
            showToast(clusterError, "error");
          } else {
            setClusters(clusterPayload.clusters ?? []);
          }
        }
      } catch {
        if (!cancelled) {
          showToast("审核数据加载失败。", "error");
        }
      }
    });

    return () => {
      cancelled = true;
    };
  }, [activeTab, showToast]);

  useEffect(() => {
    const cleanup = fetchData();
    return cleanup;
  }, [fetchData]);

  const runTransition = useCallback((action: () => Promise<void>) => {
    startTransition(() => {
      void action();
    });
  }, []);

  const postAction = useCallback(async (
    url: string,
    successMessage: string,
    options?: {
      onSuccess?: (payload: ActionPayload) => void;
      requiredField?: RequiredActionField;
    },
  ) => {
    try {
      const response = await fetch(url, { method: "POST" });
      const payload = (await response.json()) as ActionPayload;
      const responseError = getResponseError(response, payload, "操作失败");

      if (responseError) {
        showToast(responseError, "error");
        return false;
      }

      if (options?.requiredField && !payload[options.requiredField]) {
        showToast("操作失败", "error");
        return false;
      }

      options?.onSuccess?.(payload);
      showToast(successMessage, "success");
      return true;
    } catch {
      showToast("操作失败", "error");
      return false;
    }
  }, [showToast]);

  const filteredSources = useMemo(
    () => Array.from(new Set(filteredItems.map((item) => item.sourceName))).sort((a, b) => a.localeCompare(b)),
    [filteredItems]
  );

  const filteredSourceOptions = useMemo(
    () => [
      { value: "", label: "全部来源" },
      ...filteredSources.map((source) => ({
        value: source,
        label: source,
      })),
    ],
    [filteredSources]
  );

  const reviewReasonOptions = useMemo(
    () => [
      { value: "", label: "全部原因" },
      ...Object.entries(reviewReasonLabels).map(([reason, label]) => ({
        value: reason,
        label,
      })),
    ],
    []
  );

  const visibleFilteredItems = useMemo(() => {
    const keyword = filteredSearch.trim().toLowerCase();
    return filteredItems.filter((item) => {
      const matchesKeyword =
        !keyword ||
        item.title.toLowerCase().includes(keyword) ||
        (item.summary ?? "").toLowerCase().includes(keyword) ||
        (item.moderationDetail ?? "").toLowerCase().includes(keyword);
      const matchesSource = !filteredSource || item.sourceName === filteredSource;
      const matchesReason = !filteredReason || item.moderationReason === filteredReason;
      return matchesKeyword && matchesSource && matchesReason;
    });
  }, [filteredItems, filteredSearch, filteredSource, filteredReason]);

  const visibleClusters = useMemo(() => {
    const keyword = clusterSearch.trim().toLowerCase();
    return clusters.filter((cluster) => {
      // Only show clusters with more than 1 item
      if (cluster.itemCount <= 1) return false;
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
      const matchesTimeRange = isWithinTimeRange(cluster.latestPublishedAt, clusterTimeRange);
      return matchesKeyword && matchesStatus && matchesTimeRange;
    });
  }, [clusters, clusterSearch, clusterStatus, clusterTimeRange]);

  // Available clusters for merge (exclude current cluster and filter by search)
  const availableClustersForMerge = useMemo(() => {
    const query = mergeSearchQuery.trim().toLowerCase();
    const filtered = clusters.filter((cluster: ClusterDTO) => {
      // Exclude target cluster
      if (cluster.id === mergeTargetId) return false;
      // Only show clusters with items
      if (cluster.itemCount < 1) return false;
      // Apply search filter
      if (!query) return true;
      return (
        cluster.title.toLowerCase().includes(query) ||
        (cluster.summary ?? "").toLowerCase().includes(query)
      );
    });
    // Limit to first 20 clusters to avoid overwhelming the UI
    return filtered.slice(0, 20);
  }, [clusters, mergeTargetId, mergeSearchQuery]);

  // Get target cluster info for merge modal
  const targetClusterForMerge = useMemo(() => {
    return clusters.find((c) => c.id === mergeTargetId) ?? null;
  }, [clusters, mergeTargetId]);

  // Pagination
  const { currentItems, totalPages, paginatedItems, currentPage } = useMemo(() => {
    const currentItems = activeTab === "filtered" ? visibleFilteredItems : visibleClusters;
    const totalPages = Math.ceil(currentItems.length / pageSize) || 1;
    const currentPage = Math.min(page, totalPages);
    const paginatedItems = currentItems.slice((currentPage - 1) * pageSize, currentPage * pageSize);
    return { currentItems, totalPages, paginatedItems, currentPage };
  }, [activeTab, visibleFilteredItems, visibleClusters, page, pageSize]);

  const hasFilters =
    activeTab === "filtered"
      ? filteredSearch || filteredSource || filteredReason
      : clusterSearch || clusterStatus || clusterTimeRange;

  const handleClearFilters = () => {
    if (activeTab === "filtered") {
      setFilteredSearch("");
      setFilteredSource("");
      setFilteredReason("");
    } else {
      setClusterSearch("");
      setClusterStatus("");
      setClusterTimeRange("");
    }
    setPage(1);
  };

  const handleOpenFilteredDetail = (item: ReviewItemDTO) => {
    setSelectedFilteredItem(item);
    setIsFilteredDetailOpen(true);
  };

  const handleCloseFilteredDetail = () => {
    setIsFilteredDetailOpen(false);
    setSelectedFilteredItem(null);
  };

  const handleOpenClusterDetail = async (cluster: ClusterDTO) => {
    // 从API获取完整聚合组详情（包含所有条目）
    try {
      const response = await fetch(`/api/admin/clusters/${cluster.id}`);
      const payload = await response.json();
      if (response.ok && payload.cluster) {
        setSelectedCluster(payload.cluster);
      } else {
        // 如果API调用失败，使用列表中的数据作为 fallback
        setSelectedCluster(cluster);
      }
    } catch {
      setSelectedCluster(cluster);
    }
    setIsClusterDetailOpen(true);
  };

  const handleCloseClusterDetail = () => {
    setIsClusterDetailOpen(false);
    setSelectedCluster(null);
  };

  const handleRestoreItem = (itemId: string) => {
    runTransition(async () => {
      await executeWithPendingId(itemId, setRestoringItemId, async () => {
        await postAction(`/api/admin/items/${itemId}/restore`, "内容已恢复。", {
          onSuccess: () => {
            setFilteredItems((current) => current.filter((entry) => entry.id !== itemId));
            handleCloseFilteredDetail();
          },
        });
      });
    });
  };

  const handleReanalyzeItem = (itemId: string) => {
    runTransition(async () => {
      await executeWithPendingId(itemId, setReanalyzingItemId, async () => {
        await postAction(`/api/admin/items/${itemId}/reanalyze`, "已创建后台任务，正在处理中。", {
          requiredField: "taskRun",
        });
      });
    });
  };

  const handleRegenerateSummary = (clusterId: string) => {
    runTransition(async () => {
      await executeWithPendingId(clusterId, setRegeneratingClusterId, async () => {
        await postAction(`/api/admin/clusters/${clusterId}/regenerate-summary`, "已创建后台任务，正在处理中。", {
          requiredField: "taskRun",
        });
      });
    });
  };

  const handleToggleClusterStatus = (clusterId: string, currentStatus: ClusterDTO["status"]) => {
    const action = currentStatus === "hidden" ? "restore" : "hide";
    const message = currentStatus === "hidden" ? "聚合组已恢复。" : "聚合组已隐藏。";
    runTransition(async () => {
      await executeWithPendingId(clusterId, setTogglingClusterId, async () => {
        await postAction(`/api/admin/clusters/${clusterId}/${action}`, message, {
          requiredField: "cluster",
          onSuccess: (payload) => {
            setClusters((current) =>
              current.map((entry) => (entry.id === clusterId ? payload.cluster ?? entry : entry)),
            );
            if (selectedCluster?.id === clusterId && payload.cluster) {
              setSelectedCluster(payload.cluster);
            }
          },
        });
      });
    });
  };

  const handleDetachItem = (clusterId: string, itemId: string) => {
    runTransition(async () => {
      await postAction(`/api/admin/clusters/${clusterId}/items/${itemId}/detach`, "已移出聚合组。", {
        requiredField: "cluster",
        onSuccess: (payload) => {
          setClusters((current) =>
            current.map((entry) => (entry.id === clusterId ? payload.cluster ?? entry : entry)),
          );
          if (selectedCluster?.id === clusterId && payload.cluster) {
            setSelectedCluster(payload.cluster);
          }
        },
      });
    });
  };

  // Confirmation handlers
  const openConfirmRestore = (itemId: string) => {
    const item = filteredItems.find((i) => i.id === itemId);
    setConfirmModal({
      isOpen: true,
      title: "确认恢复内容",
      message: `确定要恢复内容 "${item?.title ?? ""}" 吗？`,
      confirmText: "恢复",
      variant: "primary",
      onConfirm: () => {
        handleRestoreItem(itemId);
        setConfirmModal((prev) => ({ ...prev, isOpen: false }));
      },
    });
  };

  const openConfirmReanalyze = (itemId: string) => {
    const item = filteredItems.find((i) => i.id === itemId);
    setConfirmModal({
      isOpen: true,
      title: "确认重新 AI 判定",
      message: `确定要重新 AI 判定内容 "${item?.title ?? ""}" 吗？`,
      confirmText: "重新判定",
      variant: "primary",
      onConfirm: () => {
        handleReanalyzeItem(itemId);
        setConfirmModal((prev) => ({ ...prev, isOpen: false }));
      },
    });
  };

  const openConfirmRegenerate = (clusterId: string) => {
    const cluster = clusters.find((c) => c.id === clusterId);
    setConfirmModal({
      isOpen: true,
      title: "确认重新生成摘要",
      message: `确定要重新生成聚合 "${cluster?.title ?? ""}" 的摘要吗？`,
      confirmText: "重新生成",
      variant: "primary",
      onConfirm: () => {
        handleRegenerateSummary(clusterId);
        setConfirmModal((prev) => ({ ...prev, isOpen: false }));
      },
    });
  };

  const openConfirmToggleStatus = (clusterId: string, currentStatus: ClusterDTO["status"]) => {
    const cluster = clusters.find((c) => c.id === clusterId);
    const isHidden = currentStatus === "hidden";
    setConfirmModal({
      isOpen: true,
      title: isHidden ? "确认恢复聚合" : "确认隐藏聚合",
      message: isHidden
        ? `确定要恢复显示聚合 "${cluster?.title ?? ""}" 吗？`
        : `确定要隐藏聚合 "${cluster?.title ?? ""}" 吗？`,
      confirmText: isHidden ? "恢复" : "隐藏",
      variant: isHidden ? "primary" : "danger",
      onConfirm: () => {
        handleToggleClusterStatus(clusterId, currentStatus);
        setConfirmModal((prev) => ({ ...prev, isOpen: false }));
      },
    });
  };

  const openConfirmDetach = (clusterId: string, itemId: string) => {
    const cluster = clusters.find((c) => c.id === clusterId);
    const item = cluster?.items.find((i) => i.id === itemId);
    setConfirmModal({
      isOpen: true,
      title: "确认移出条目",
      message: `确定要将内容 "${item?.title ?? ""}" 移出聚合组吗？`,
      confirmText: "移出",
      variant: "danger",
      onConfirm: () => {
        handleDetachItem(clusterId, itemId);
        setConfirmModal((prev) => ({ ...prev, isOpen: false }));
      },
    });
  };

  const closeConfirmModal = () => {
    setConfirmModal((prev) => ({ ...prev, isOpen: false }));
  };

  // Merge handlers
  const handleOpenMergeModal = (targetClusterId: string) => {
    setMergeTargetId(targetClusterId);
    setMergeSearchQuery("");
    setMergeSourceIds(new Set());
    setIsMergeModalOpen(true);
  };

  const handleCloseMergeModal = () => {
    setIsMergeModalOpen(false);
    setMergeTargetId(null);
    setMergeSourceIds(new Set());
  };

  const handleToggleMergeSource = (clusterId: string) => {
    setMergeSourceIds((prev) => {
      const next = new Set(prev);
      if (next.has(clusterId)) {
        next.delete(clusterId);
      } else {
        next.add(clusterId);
      }
      return next;
    });
  };

  const handleExecuteMerge = async () => {
    if (!mergeTargetId || mergeSourceIds.size === 0) {
      showToast("请至少选择一个要合并的聚合组", "error");
      return;
    }

    setMergingClusterId(mergeTargetId);
    try {
      const response = await fetch("/api/admin/clusters/merge", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          targetClusterId: mergeTargetId,
          sourceClusterIds: Array.from(mergeSourceIds),
        }),
      });

      const payload = await response.json();

      if (!response.ok || payload.error) {
        showToast(payload.error ?? "合并失败", "error");
        return;
      }

      showToast(`成功合并 ${payload.result.itemsMoved} 个条目`, "success");
      handleCloseMergeModal();
      handleCloseClusterDetail();
      fetchData();
    } catch {
      showToast("合并请求失败", "error");
    } finally {
      setMergingClusterId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-[var(--foreground)]">
            {activeTab === "filtered" ? "过滤内容" : "聚合管理"}
          </h2>
          <p className="text-sm text-[var(--muted)]">
            {activeTab === "filtered"
              ? "查看和管理被过滤的内容"
              : "管理内容聚合组"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={handleClearFilters} variant="secondary" disabled={!hasFilters}>
            清空筛选
          </Button>
          <Button onClick={fetchData} variant="secondary" disabled={isPending}>
            刷新
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
            setPage(1);
          }}
        />

        {activeTab === "filtered" ? (
          <>
            <FilterSelect
              id="content-review-source"
              label="来源"
              ariaLabel="审核来源"
              value={filteredSource}
              onChange={(value) => {
                setFilteredSource(value);
                setPage(1);
              }}
              showSearch={false}
              options={filteredSourceOptions}
            />

            <FilterSelect
              id="content-review-reason"
              label="原因"
              ariaLabel="过滤原因"
              value={filteredReason}
              onChange={(value) => {
                setFilteredReason(value);
                setPage(1);
              }}
              showSearch={false}
              options={reviewReasonOptions}
            />
          </>
        ) : (
          <>
            <FilterSelect
              id="content-review-status"
              label="状态"
              ariaLabel="聚合状态"
              value={clusterStatus}
              onChange={(value) => {
                setClusterStatus(value as ClusterDTO["status"] | "");
                setPage(1);
              }}
              showSearch={false}
              options={[
                { value: "", label: "全部状态" },
                { value: "active", label: "显示中" },
                { value: "hidden", label: "已隐藏" },
              ]}
            />

            <FilterSelect
              id="content-review-time-range"
              label="最新发布时间"
              ariaLabel="最新发布时间范围"
              value={clusterTimeRange}
              onChange={(value) => {
                setClusterTimeRange(value as TimeRangeFilter);
                setPage(1);
              }}
              showSearch={false}
              options={timeRangeOptions}
            />
          </>
        )}
      </div>

      {/* List */}
      {isPending ? (
        <div className="rounded-sm border border-[color:var(--line)] bg-[var(--bg-muted)] px-4 py-8 text-center text-sm text-[var(--muted)]">
          加载中...
        </div>
      ) : paginatedItems.length === 0 ? (
        <div className="rounded-sm border border-[color:var(--line)] bg-[var(--bg-muted)] px-4 py-8 text-center text-sm text-[var(--muted)]">
          {hasFilters ? "暂无匹配内容" : activeTab === "filtered" ? "当前没有待处理的过滤内容" : "当前没有可管理的聚合结果"}
        </div>
      ) : activeTab === "filtered" ? (
        <div className="w-full overflow-x-auto">
          <table className="w-full table-auto text-sm">
            <thead className="bg-[var(--bg-muted)] text-[var(--muted)]">
              <tr>
                <th className="w-[35%] text-left px-4 py-3">标题</th>
                <th className="w-[12%] whitespace-nowrap text-left px-4 py-3">来源</th>
                <th className="w-[12%] whitespace-nowrap text-left px-4 py-3">原因</th>
                <th className="w-[10%] whitespace-nowrap text-left px-4 py-3">质量</th>
                <th className="w-[15%] whitespace-nowrap text-left px-4 py-3">时间</th>
                <th className="w-[16%] whitespace-nowrap text-right px-4 py-3">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:var(--line)]">
              {(paginatedItems as ReviewItemDTO[]).map((item) => (
                <tr key={item.id} className="hover:bg-[var(--bg-muted)] transition-colors">
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => handleOpenFilteredDetail(item)}
                      className="w-full text-left group"
                    >
                      <div className="font-medium text-[var(--foreground)] group-hover:text-[var(--accent)] transition-colors truncate max-w-[280px]">
                        {item.title}
                      </div>
                      <div className="text-xs text-[var(--muted)] truncate max-w-[280px]">
                        {truncateText(item.summary, 50)}
                      </div>
                    </button>
                  </td>
                  <td className="px-4 py-3 text-[var(--text-2)]">{item.sourceName}</td>
                  <td className="px-4 py-3">
                    <StatusTag tone={reviewReasonTone[item.moderationReason ?? "other"]}>
                      {getReviewReasonLabel(item.moderationReason)}
                    </StatusTag>
                  </td>
                  <td className="px-4 py-3 text-[var(--text-2)]">{item.qualityScore}</td>
                  <td className="px-4 py-3 text-[var(--text-3)] text-xs">{formatDate(item.publishedAt)}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <IconButton
                        onClick={() => openConfirmRestore(item.id)}
                        variant="ghost"
                        size="sm"
                        title="恢复内容"
                        disabled={restoringItemId === item.id}
                      >
                        <IconCheck className={cx("h-4 w-4 text-[var(--success-ink)]", restoringItemId === item.id && "animate-pulse")} />
                      </IconButton>
                      <IconButton
                        onClick={() => openConfirmReanalyze(item.id)}
                        variant="ghost"
                        size="sm"
                        title="重新 AI 判定"
                        disabled={reanalyzingItemId === item.id}
                      >
                        <IconRotateCw className={cx("h-4 w-4", reanalyzingItemId === item.id && "animate-spin")} />
                      </IconButton>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="w-full overflow-x-auto">
          <table className="w-full table-auto text-sm">
            <thead className="bg-[var(--bg-muted)] text-[var(--muted)]">
              <tr>
                <th className="w-[35%] text-left px-4 py-3">标题</th>
                <th className="w-[10%] whitespace-nowrap text-left px-4 py-3">内容数</th>
                <th className="w-[12%] whitespace-nowrap text-left px-4 py-3">状态</th>
                <th className="w-[10%] whitespace-nowrap text-left px-4 py-3">质量</th>
                <th className="w-[15%] whitespace-nowrap text-left px-4 py-3">最新发布</th>
                <th className="w-[18%] whitespace-nowrap text-right px-4 py-3">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:var(--line)]">
              {(paginatedItems as ClusterDTO[]).map((cluster) => (
                <tr key={cluster.id} className="hover:bg-[var(--bg-muted)] transition-colors">
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => handleOpenClusterDetail(cluster)}
                      className="w-full text-left group"
                    >
                      <div className="font-medium text-[var(--foreground)] group-hover:text-[var(--accent)] transition-colors truncate max-w-[320px]">
                        {cluster.title}
                      </div>
                    </button>
                  </td>
                  <td className="px-4 py-3 text-[var(--text-2)]">{cluster.itemCount} 条</td>
                  <td className="px-4 py-3">
                    <StatusTag tone={clusterStatusTone[cluster.status]}>
                      {clusterStatusLabels[cluster.status]}
                    </StatusTag>
                  </td>
                  <td className="px-4 py-3 text-[var(--text-2)]">{cluster.score}</td>
                  <td className="px-4 py-3 text-[var(--text-3)] text-xs">
                    {formatDate(cluster.latestPublishedAt)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <IconButton
                        onClick={() => handleOpenMergeModal(cluster.id)}
                        variant="ghost"
                        size="sm"
                        title="合并其他聚合组"
                        disabled={false}
                      >
                        <IconMerge className="h-4 w-4" />
                      </IconButton>
                      <IconButton
                        onClick={() => openConfirmRegenerate(cluster.id)}
                        variant="ghost"
                        size="sm"
                        title="重新生成摘要"
                        disabled={regeneratingClusterId === cluster.id}
                      >
                        <IconRotateCw className={cx("h-4 w-4", regeneratingClusterId === cluster.id && "animate-spin")} />
                      </IconButton>
                      <IconButton
                        onClick={() => openConfirmToggleStatus(cluster.id, cluster.status)}
                        variant="ghost"
                        size="sm"
                        title={cluster.status === "hidden" ? "恢复显示" : "隐藏聚合"}
                        disabled={togglingClusterId === cluster.id}
                      >
                        {cluster.status === "hidden" ? (
                          <IconCheck className={cx("h-4 w-4 text-[var(--success-ink)]", togglingClusterId === cluster.id && "animate-pulse")} />
                        ) : (
                          <IconX className={cx("h-4 w-4 text-[var(--danger-ink)]", togglingClusterId === cluster.id && "animate-pulse")} />
                        )}
                      </IconButton>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {currentItems.length > 0 && (
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
            <span>条，共 {currentItems.length} 条</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              className={secondaryButtonClassName}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
            >
              上一页
            </button>
            <span className="min-w-[100px] px-4 py-2 text-center text-sm bg-[var(--surface)] border border-[color:var(--line)] rounded-sm text-[var(--muted)]">
              第 {currentPage} / {totalPages} 页
            </span>
            <button
              className={secondaryButtonClassName}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
            >
              下一页
            </button>
          </div>
        </div>
      )}

      {/* Detail Modals */}
      {selectedFilteredItem && (
        <FilteredItemDetailModal
          isOpen={isFilteredDetailOpen}
          onClose={handleCloseFilteredDetail}
          item={selectedFilteredItem}
          onRestore={() => openConfirmRestore(selectedFilteredItem.id)}
          onReanalyze={() => openConfirmReanalyze(selectedFilteredItem.id)}
          isRestoring={restoringItemId === selectedFilteredItem?.id}
          isReanalyzing={reanalyzingItemId === selectedFilteredItem?.id}
        />
      )}

      {selectedCluster && (
        <ClusterDetailModal
          isOpen={isClusterDetailOpen}
          onClose={handleCloseClusterDetail}
          cluster={selectedCluster}
          onRegenerateSummary={() => openConfirmRegenerate(selectedCluster.id)}
          onToggleStatus={() => openConfirmToggleStatus(selectedCluster.id, selectedCluster.status)}
          onDetachItem={(itemId) => openConfirmDetach(selectedCluster.id, itemId)}
          onMerge={() => handleOpenMergeModal(selectedCluster.id)}
          isRegenerating={regeneratingClusterId === selectedCluster?.id}
          isTogglingStatus={togglingClusterId === selectedCluster?.id}
        />
      )}

      {/* Confirmation Modal */}
      <ModalShell
        isOpen={confirmModal.isOpen}
        onClose={closeConfirmModal}
        title={confirmModal.title}
        widthClassName="max-w-md"
        headerClassName="border-b border-[color:var(--line)] p-4"
        bodyClassName="p-4"
        footerClassName="border-t border-[color:var(--line)] bg-[var(--bg-muted)] p-4"
        footer={
          <div className="flex justify-end gap-2">
            <Button onClick={closeConfirmModal} variant="secondary">
              取消
            </Button>
            <Button
              onClick={confirmModal.onConfirm}
              variant={confirmModal.variant === "danger" ? "danger" : "primary"}
            >
              {confirmModal.confirmText ?? "确认"}
            </Button>
          </div>
        }
      >
        <p className="text-sm text-[var(--text-2)]">{confirmModal.message}</p>
      </ModalShell>

      {/* Merge Clusters Modal */}
      <ModalShell
        isOpen={isMergeModalOpen}
        onClose={handleCloseMergeModal}
        title="合并聚合组"
        widthClassName="max-w-3xl"
        headerClassName="border-b border-[color:var(--line)] p-4"
        bodyClassName="p-4 space-y-4"
        footerClassName="border-t border-[color:var(--line)] bg-[var(--bg-muted)] p-4"
        footer={
          <div className="flex justify-end gap-2">
            <Button onClick={handleCloseMergeModal} variant="secondary">
              取消
            </Button>
            <Button
              onClick={handleExecuteMerge}
              variant="primary"
              disabled={mergeSourceIds.size === 0 || mergingClusterId === mergeTargetId}
            >
              {mergingClusterId === mergeTargetId ? (
                <>
                  <IconRotateCw className="h-4 w-4 mr-1 animate-spin" />
                  合并中...
                </>
              ) : (
                <>
                  <IconMerge className="h-4 w-4 mr-1" />
                  确认合并 ({mergeSourceIds.size} 个)
                </>
              )}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="rounded-lg border border-[color:var(--line)] bg-[var(--bg-muted)] p-4">
            <h4 className="text-sm font-semibold text-[var(--text-1)] mb-2">操作说明</h4>
            <ul className="text-sm text-[var(--text-2)] space-y-1 list-disc list-inside">
              <li>选中的聚合组条目将被合并到当前聚合组</li>
              <li>合并后，被合并的聚合组将被隐藏，其条目归属到当前聚合组</li>
              <li>系统会自动重新生成当前聚合组的摘要</li>
            </ul>
          </div>

          {/* Target Cluster Info */}
          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-[var(--text-1)]">目标聚合组（当前）</h4>
            <div className="rounded-lg border border-[color:var(--accent-soft)] bg-[var(--accent-soft)]/30 p-3">
              <div className="font-medium text-sm text-[var(--foreground)]">
                {targetClusterForMerge?.title ?? "加载中..."}
              </div>
              <div className="text-xs text-[var(--muted)] mt-1">
                {targetClusterForMerge ? `${targetClusterForMerge.itemCount} 条内容 · 质量分: ${targetClusterForMerge.score}` : ""}
              </div>
            </div>
          </div>

          {/* Source Selection with Search */}
          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-[var(--text-1)]">
              选择要合并的聚合组
              {mergeSourceIds.size > 0 && (
                <span className="ml-2 text-xs font-normal text-[var(--accent-strong)]">
                  已选择 {mergeSourceIds.size} 个
                </span>
              )}
            </h4>

            {/* Search Input */}
            <div className="relative">
              <input
                type="text"
                placeholder="搜索聚合组标题..."
                value={mergeSearchQuery}
                onChange={(e) => setMergeSearchQuery(e.target.value)}
                className={cx(
                  "w-full min-h-10 rounded-xl border border-[color:var(--line)] bg-white px-4 py-2.5 text-sm",
                  "text-[var(--foreground)] outline-none transition",
                  "placeholder:text-[var(--muted)]",
                  "focus:border-[color:var(--accent)] focus:ring-2 focus:ring-[color:var(--accent-soft)]"
                )}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--muted)]">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </span>
            </div>

            {/* Cluster List */}
            <div className="max-h-[280px] overflow-y-auto space-y-1 border border-[color:var(--line)] rounded-lg p-2">
              {availableClustersForMerge.length === 0 ? (
                <p className="text-sm text-[var(--muted)] text-center py-4">
                  {mergeSearchQuery.trim() ? "未找到匹配的聚合组" : "暂无可合并的聚合组"}
                </p>
              ) : (
                availableClustersForMerge.map((cluster) => (
                  <label
                    key={cluster.id}
                    className={cx(
                      "flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors",
                      mergeSourceIds.has(cluster.id)
                        ? "bg-[var(--accent-soft)] border border-[color:var(--accent)]"
                        : "hover:bg-[var(--surface)] border border-transparent"
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={mergeSourceIds.has(cluster.id)}
                      onChange={() => handleToggleMergeSource(cluster.id)}
                      className="h-4 w-4 text-[var(--accent)] rounded"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm text-[var(--foreground)] truncate">
                        {cluster.title}
                      </div>
                      <div className="text-xs text-[var(--muted)]">
                        {cluster.itemCount} 条内容 · 质量分: {cluster.score}
                      </div>
                    </div>
                  </label>
                ))
              )}
            </div>
          </div>
        </div>
      </ModalShell>
    </div>
  );
}

interface ContentReviewPanelProps {
  embedMode?: boolean;
  activeTab?: ReviewTab;
}

export function ContentReviewPanel({ embedMode, activeTab = "filtered" }: ContentReviewPanelProps) {
  if (embedMode) {
    return <ContentReviewContent key={activeTab} initialTab={activeTab} />;
  }

  return (
    <PageShell header={{ activeNav: null, isAdmin: true }} contentClassName="gap-3">
      <ContentReviewContent key={activeTab} initialTab={activeTab} />
    </PageShell>
  );
}
