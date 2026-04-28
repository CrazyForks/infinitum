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
  initialSnapshot: SourceMonitorSnapshot;
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

  return "generatedAt" in value && "health" in value && "inactivityBuckets" in value;
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
            <tr key={source.id} className="hover:bg-[var(--bg-muted)] transition-colors">
              <td className="min-w-0 px-3 py-3">
                <div className="truncate font-medium text-[var(--foreground)]">
                  {source.name}
                </div>
                <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--muted)]">
                  <span className="max-w-full truncate">{source.groupName ?? "未分组"}</span>
                  <a
                    href={source.rssUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex shrink-0 items-center gap-1 text-[var(--accent)] hover:underline"
                  >
                    RSS
                    <IconExternalLink className="h-3 w-3" />
                  </a>
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
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SourceMonitorPanel({ initialSnapshot, hideStats = false }: SourceMonitorPanelProps) {
  const { showToast } = useToast();
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [inactivityFilter, setInactivityFilter] = useState<InactivityFilter>("all");
  const [healthStatusFilter, setHealthStatusFilter] = useState<HealthStatusFilter>("all");
  const [groupFilter, setGroupFilter] = useState<GroupFilter>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Build the full source list from inactivity buckets (which always contain
  // every enabled source distributed across inactivity tiers).  Also merge
  // attentionSources to cover sources that are active (inactiveDays < 1) and
  // therefore fall into no bucket.
  const allSources = useMemo(() => {
    const sourceById = new Map<string, SourceMonitorEntry>();
    for (const source of snapshot.health.attentionSources) {
      sourceById.set(source.id, source);
    }
    for (const bucket of snapshot.inactivityBuckets) {
      for (const source of bucket.sources) {
        sourceById.set(source.id, source);
      }
    }
    return Array.from(sourceById.values());
  }, [snapshot.health.attentionSources, snapshot.inactivityBuckets]);

  // Client-side filtering across all sources.
  // When the user selects an inactivity bucket, narrow to that bucket's sources;
  // otherwise filter by health status and group against the full list.
  const displaySources = useMemo(() => {
    const selected =
      inactivityFilter === "all"
        ? allSources
        : snapshot.inactivityBuckets.find((e) => e.key === inactivityFilter)?.sources ?? [];
    return selected.filter((source) => {
      if (healthStatusFilter !== "all" && source.healthStatus !== healthStatusFilter) return false;
      if (groupFilter !== "all" && (source.groupName ?? "未分组") !== groupFilter) return false;
      return true;
    });
  }, [allSources, inactivityFilter, healthStatusFilter, groupFilter, snapshot.inactivityBuckets]);

  const totalItems = displaySources.length;
  const totalPages = Math.ceil(totalItems / pageSize) || 1;
  const paginatedSources = displaySources.slice((page - 1) * pageSize, page * pageSize);

  const inactivityFilterOptions = useMemo(
    () => [
      { value: "all", label: `全部（${snapshot.totalEnabledSourceCount}）` },
      ...snapshot.inactivityBuckets.map((bucket) => ({
        value: bucket.key,
        label: `${bucket.label}无更新（${bucket.count}）`,
      })),
    ],
    [snapshot.totalEnabledSourceCount, snapshot.inactivityBuckets],
  );
  const groupFilterOptions = useMemo(() => {
    const groupNames = Array.from(
      new Set(allSources.map((source) => source.groupName ?? "未分组")),
    ).sort((left, right) => left.localeCompare(right, "zh-CN"));

    return [
      { value: "all", label: "全部" },
      ...groupNames.map((groupName) => ({
        value: groupName,
        label: groupName,
      })),
    ];
  }, [allSources]);
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

  useEffect(() => {
    setPage(1);
  }, [groupFilter, healthStatusFilter, inactivityFilter]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  // Fetch full source list for client-side filtering + pagination.
  // No server-side filters — all filtering is done in the displaySources memo.
  const fetchSources = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const response = await fetch("/api/admin/monitor/sources?page=1&pageSize=200");
      const payload = (await response.json()) as SourceMonitorSnapshot | { error?: string };

      if (!response.ok || !isSourceMonitorSnapshot(payload)) {
        showToast(
          "error" in payload && payload.error ? payload.error : "刷新信息源监控失败",
          "error",
        );
        return;
      }

      setSnapshot(payload);
    } catch {
      showToast("刷新信息源监控失败", "error");
    } finally {
      setIsRefreshing(false);
    }
  }, [showToast]);

  const mountCount = useRef(0);
  useEffect(() => {
    mountCount.current += 1;
    if (mountCount.current <= 1) return;
    void fetchSources();
  }, [fetchSources]);

  const refreshSnapshot = () => {
    void fetchSources();
  };

  const clearFilters = () => {
    setInactivityFilter("all");
    setHealthStatusFilter("all");
    setGroupFilter("all");
    setPage(1);
  };

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
            onChange={(value) => setInactivityFilter(value as InactivityFilter)}
            options={inactivityFilterOptions}
            showSearch={false}
          />
          <FilterSelect
            label="健康状态"
            value={healthStatusFilter}
            onChange={(value) => setHealthStatusFilter(value as HealthStatusFilter)}
            options={healthStatusFilterOptions}
            showSearch={false}
          />
          <FilterSelect
            label="分组"
            value={groupFilter}
            onChange={(value) => setGroupFilter(value)}
            options={groupFilterOptions}
            showSearch={false}
          />
        </div>

        <div>
          <SourceTable
            emptyText="暂无匹配信息源"
            sources={paginatedSources}
          />
        </div>

        {displaySources.length > 0 ? (
          <PaginationControls
            totalItems={totalItems}
            page={page}
            totalPages={totalPages}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={(nextPageSize) => {
              setPageSize(nextPageSize);
              setPage(1);
            }}
          />
        ) : null}
      </section>
    </div>
  );
}
