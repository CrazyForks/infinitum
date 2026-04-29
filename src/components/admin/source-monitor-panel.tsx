"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterSelect } from "@/components/ui/filter-select";
import { IconExternalLink } from "@/components/ui/icons";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { StatusTag } from "@/components/ui/status-tag";
import { useToast } from "@/components/ui/toast";
import type {
  SourceInactivityBucketKey,
  SourceMonitorEntry,
  SourceMonitorSnapshot,
} from "@/lib/source-monitor/types";
import { cx } from "@/lib/ui/cx";

type SourceMonitorPanelProps = {
  initialSnapshot?: SourceMonitorSnapshot;
  hideStats?: boolean;
};

type InactivityFilter = "all" | SourceInactivityBucketKey;
type HealthStatusFilter = "all" | SourceMonitorEntry["healthStatus"];
type GroupFilter = "all" | string;

const healthLabels: Record<SourceMonitorEntry["healthStatus"], string> = {
  failed: "异常",
  healthy: "正常",
  unknown: "未巡检",
};

const healthTone: Record<SourceMonitorEntry["healthStatus"], "danger" | "neutral" | "success"> = {
  failed: "danger",
  healthy: "success",
  unknown: "neutral",
};

function isSourceMonitorSnapshot(value: unknown): value is SourceMonitorSnapshot {
  if (!value || typeof value !== "object") {
    return false;
  }

  return (
    "generatedAt" in value &&
    "health" in value &&
    "inactivityBuckets" in value &&
    "sources" in value &&
    "pagination" in value &&
    "groups" in value
  );
}

function getSafeRssHref(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:"
      ? parsed.toString()
      : null;
  } catch {
    return null;
  }
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Shanghai",
  }).format(new Date(value));
}

function formatInactiveDays(value: number | null) {
  if (value === null) {
    return "从未更新";
  }

  if (value === 0) {
    return "今天有更新";
  }

  return `${value} 天未更新`;
}

function StatCard({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number;
  tone?: "danger" | "neutral" | "success" | "warning";
}) {
  const toneClassName = {
    danger: "border-[var(--danger-line)] bg-[var(--danger-surface)]",
    neutral: "border-[color:var(--line)] bg-[var(--bg-muted)]",
    success: "border-[var(--success-line)] bg-[var(--success-surface)]",
    warning: "border-[var(--warning-line)] bg-[var(--warning-surface)]",
  } as const;

  return (
    <div className={cx("rounded-sm border p-4", toneClassName[tone])}>
      <div className="text-xs font-medium uppercase tracking-[0.16em] text-[var(--muted)]">
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold text-[var(--foreground)]">
        {value}
      </div>
    </div>
  );
}

function SourceTable({
  emptyText,
  sources,
}: {
  emptyText: string;
  sources: SourceMonitorEntry[];
}) {
  if (sources.length === 0) {
    return <EmptyState>{emptyText}</EmptyState>;
  }

  return (
    <div className="w-full overflow-hidden">
      <table className="w-full table-fixed text-sm">
        <thead className="bg-[var(--bg-muted)] text-[var(--muted)]">
          <tr>
            <th className="w-[22%] text-left px-3 py-3">信息源</th>
            <th className="w-[74px] whitespace-nowrap text-left px-3 py-3">状态</th>
            <th className="w-[140px] whitespace-nowrap text-left px-3 py-3">最后巡检</th>
            <th className="w-[140px] whitespace-nowrap text-left px-3 py-3">最后入库</th>
            <th className="w-[92px] whitespace-nowrap text-left px-3 py-3">无更新</th>
            <th className="w-[64px] whitespace-nowrap text-left px-3 py-3">文章数</th>
            <th className="text-left px-3 py-3">问题</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[color:var(--line)]">
          {sources.map((source) => (
            (() => {
              const safeRssHref = getSafeRssHref(source.rssUrl);

              return (
                <tr key={source.id} className="hover:bg-[var(--bg-muted)] transition-colors">
                  <td className="min-w-0 px-3 py-3">
                    <div className="truncate font-medium text-[var(--foreground)]">
                      {source.name}
                    </div>
                    <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--muted)]">
                      <span className="max-w-full truncate">{source.groupName ?? "未分组"}</span>
                      {safeRssHref ? (
                        <button
                          type="button"
                          onClick={() => window.open(safeRssHref, "_blank", "noopener,noreferrer")}
                          className="inline-flex shrink-0 items-center gap-1 text-[var(--accent)] hover:underline cursor-pointer"
                        >
                          RSS
                          <IconExternalLink className="h-3 w-3" />
                        </button>
                      ) : (
                        <span className="inline-flex shrink-0 items-center text-[var(--text-3)]">
                          RSS
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    <StatusTag
                      className="whitespace-nowrap"
                      tone={healthTone[source.healthStatus]}
                    >
                      {healthLabels[source.healthStatus]}
                    </StatusTag>
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap text-xs text-[var(--text-3)]">
                    {formatDateTime(source.healthCheckedAt)}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap text-xs text-[var(--text-3)]">
                    {formatDateTime(source.lastItemCreatedAt)}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap text-xs text-[var(--text-2)]">
                    {formatInactiveDays(source.inactiveDays)}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap text-xs text-[var(--text-2)]">
                    {source.itemCount}
                  </td>
                  <td className="break-words px-3 py-3 text-xs leading-5 text-[var(--danger-ink)]">
                    {source.healthMessage ?? (source.healthStatus === "unknown" ? "尚未完成首次巡检" : "-")}
                  </td>
                </tr>
              );
            })()
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SourceMonitorPanel({ initialSnapshot, hideStats = false }: SourceMonitorPanelProps) {
  const { showToast } = useToast();
  const [snapshot, setSnapshot] = useState<SourceMonitorSnapshot | null>(initialSnapshot ?? null);
  const [inactivityFilter, setInactivityFilter] = useState<InactivityFilter>("all");
  const [healthStatusFilter, setHealthStatusFilter] = useState<HealthStatusFilter>("all");
  const [groupFilter, setGroupFilter] = useState<GroupFilter>("all");
  const [page, setPage] = useState(initialSnapshot?.pagination.page ?? 1);
  const [pageSize, setPageSize] = useState(initialSnapshot?.pagination.pageSize ?? 10);
  const [isRefreshing, setIsRefreshing] = useState(!initialSnapshot);

  const inactivityFilterOptions = useMemo(
    () => [
      { value: "all", label: `全部（${snapshot?.totalEnabledSourceCount ?? 0}）` },
      ...(snapshot?.inactivityBuckets ?? []).map((bucket) => ({
        value: bucket.key,
        label: `${bucket.label}无更新（${bucket.count}）`,
      })),
    ],
    [snapshot?.totalEnabledSourceCount, snapshot?.inactivityBuckets],
  );
  const groupFilterOptions = useMemo(
    () => (snapshot?.groups ?? []).map((group) => ({
      value: group.value,
      label: `${group.label}（${group.count}）`,
    })),
    [snapshot?.groups],
  );
  const healthStatusFilterOptions = useMemo(
    () => [
      { value: "all", label: "全部" },
      { value: "failed", label: "异常" },
      { value: "unknown", label: "未巡检" },
      { value: "healthy", label: "正常" },
    ],
    [],
  );
  const hasActiveFilters =
    inactivityFilter !== "all" ||
    healthStatusFilter !== "all" ||
    groupFilter !== "all";

  const fetchSources = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });

      if (healthStatusFilter !== "all") {
        params.set("healthStatus", healthStatusFilter);
      }
      if (inactivityFilter !== "all") {
        params.set("inactivity", inactivityFilter);
      }
      if (groupFilter !== "all") {
        params.set("groupName", groupFilter);
      }

      const response = await fetch(`/api/admin/monitor/sources?${params.toString()}`);
      const payload = (await response.json()) as SourceMonitorSnapshot | { error?: string };

      if (!response.ok || !isSourceMonitorSnapshot(payload)) {
        showToast(
          "error" in payload && payload.error ? payload.error : "刷新信息源监控失败",
          "error",
        );
        return;
      }

      setSnapshot(payload);
      if (payload.pagination.page !== page) {
        setPage(payload.pagination.page);
      }
      if (payload.pagination.pageSize !== pageSize) {
        setPageSize(payload.pagination.pageSize);
      }
    } catch {
      showToast("刷新信息源监控失败", "error");
    } finally {
      setIsRefreshing(false);
    }
  }, [groupFilter, healthStatusFilter, inactivityFilter, page, pageSize, showToast]);

  const initialParams = useRef(
    initialSnapshot
      ? { page: initialSnapshot.pagination.page, pageSize: initialSnapshot.pagination.pageSize }
      : { page: 1, pageSize: 10 },
  );

  // Fetch on mount when no initial data was provided via SSR
  const didInitialFetch = useRef(!!initialSnapshot);
  useEffect(() => {
    if (!didInitialFetch.current) {
      didInitialFetch.current = true;
      void fetchSources();
      return;
    }
    // Skip if params haven't changed from initial values
    if (
      page === initialParams.current.page &&
      pageSize === initialParams.current.pageSize &&
      inactivityFilter === "all" &&
      healthStatusFilter === "all" &&
      groupFilter === "all"
    ) {
      return;
    }
    void fetchSources();
  }, [fetchSources, page, pageSize, inactivityFilter, healthStatusFilter, groupFilter]);

  const refreshSnapshot = () => {
    void fetchSources();
  };

  const clearFilters = () => {
    setInactivityFilter("all");
    setHealthStatusFilter("all");
    setGroupFilter("all");
    setPage(1);
  };

  const handleInactivityFilterChange = (value: string) => {
    setInactivityFilter(value as InactivityFilter);
    setPage(1);
  };

  const handleHealthStatusFilterChange = (value: string) => {
    setHealthStatusFilter(value as HealthStatusFilter);
    setPage(1);
  };

  const handleGroupFilterChange = (value: string) => {
    setGroupFilter(value);
    setPage(1);
  };

  const handlePageSizeChange = (nextPageSize: number) => {
    setPageSize(nextPageSize);
    setPage(1);
  };

  if (!snapshot) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 w-48 rounded bg-[var(--bg-muted)]" />
        {!hideStats ? (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-[88px] rounded-sm bg-[var(--bg-muted)]" />
            ))}
          </div>
        ) : null}
        <div className="h-64 rounded-sm bg-[var(--bg-muted)]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-[var(--foreground)]">
            信息源详情
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={clearFilters}
            variant="secondary"
            disabled={!hasActiveFilters}
          >
            清空筛选
          </Button>
          <Button
            onClick={() => void refreshSnapshot()}
            variant="secondary"
            disabled={isRefreshing}
          >
            刷新
          </Button>
        </div>
      </div>

      {!hideStats ? (
        <section className="space-y-3" aria-label="健康度检查">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="启用源" value={snapshot.totalEnabledSourceCount} />
            <StatCard label="正常" value={snapshot.health.healthyCount} tone="success" />
            <StatCard label="异常" value={snapshot.health.failedCount} tone="danger" />
            <StatCard label="未巡检" value={snapshot.health.unknownCount} tone="warning" />
          </div>
        </section>
      ) : null}

      <section className="space-y-4" aria-label="信息源列表">
        <div className="grid gap-4 md:grid-cols-3">
          <FilterSelect
            label="无更新周期"
            value={inactivityFilter}
            onChange={handleInactivityFilterChange}
            options={inactivityFilterOptions}
            showSearch={false}
          />
          <FilterSelect
            label="健康状态"
            value={healthStatusFilter}
            onChange={handleHealthStatusFilterChange}
            options={healthStatusFilterOptions}
            showSearch={false}
          />
          <FilterSelect
            label="分组"
            value={groupFilter}
            onChange={handleGroupFilterChange}
            options={groupFilterOptions}
            showSearch={false}
          />
        </div>

        <div>
          <SourceTable
            emptyText="暂无匹配信息源"
            sources={snapshot.sources}
          />
        </div>

        {snapshot.pagination.totalItems > 0 ? (
          <PaginationControls
            totalItems={snapshot.pagination.totalItems}
            page={snapshot.pagination.page}
            totalPages={snapshot.pagination.totalPages}
            pageSize={snapshot.pagination.pageSize}
            onPageChange={setPage}
            onPageSizeChange={handlePageSizeChange}
            disabled={isRefreshing}
          />
        ) : null}
      </section>
    </div>
  );
}
