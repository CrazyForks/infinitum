"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";

import styles from "@/components/feed/feed-panel.module.css";
import { RANGE_OPTIONS, SORT_OPTIONS } from "@/lib/feed/range";
import type {
  FeedClusterPreviewItemDTO,
  FeedEntryDTO,
  FeedGroupOption,
  FeedItemDTO,
  FeedRange,
  FeedSourceOption,
  FeedSort,
  FetchRunSnapshot,
} from "@/lib/feed/types";

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
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null);
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
      setRefreshMessage(null);
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
        setRefreshMessage(payload.error);
        return;
      }

      setQueuedRefreshAt(payload.taskRun ? queuedAt : null);
      setRefreshMessage("抓取任务已进入队列，等待后台执行。");
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
        item?: FeedItemDTO;
        error?: string;
      };

      if (payload.error) {
        setRefreshMessage(payload.error);
        return;
      }

      if (!payload.item) {
        setRefreshMessage("未返回更新后的内容。");
        return;
      }

      setItems((current) =>
        current.map((entry) => {
          if (entry.type === "single" && entry.id === itemId) {
            return payload.item!;
          }

          return entry;
        }),
      );
      setExpandedClusters((current) => {
        const next = { ...current };

        for (const [clusterId, clusterItems] of Object.entries(current)) {
          next[clusterId] = clusterItems.map((item) =>
            item.id === itemId
              ? {
                  ...item,
                  title: payload.item!.title,
                  summary: payload.item!.summary,
                }
              : item,
          );
        }

        return next;
      });
      setRefreshMessage(target === "translation" ? "标题翻译已重新生成。" : "摘要已重新生成。");
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

        if (payload.run.status !== "running") {
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
          setRefreshMessage(
            payload.run.status === "succeeded" || payload.run.status === "partial"
              ? "抓取完成，已重新载入当前时间范围。"
              : "抓取失败，请稍后重试。",
          );
        }
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

  return (
    <section className={styles.shell}>
      <div className={styles.hero}>
        <div className={styles.masthead}>
          <div className={styles.kicker}>Infinitum Dispatch</div>
          <div className={styles.titleRow}>
            <div>
              <h1 className={styles.title}>信息流</h1>
              <p className={styles.lede}>
                用 AI 过滤营销和低质内容，把同主题内容折叠成事件流，再保留可展开的原始条目，形成一条更像编辑精选的消息面板。
              </p>
            </div>
            <div className={styles.adminActions}>
              {isAdmin ? (
                <>
                  <Link className={styles.adminLink} href="/admin/content">
                    内容审核
                  </Link>
                  <Link className={styles.adminLink} href="/admin/settings">
                    管理设置
                  </Link>
                </>
              ) : (
                <Link className={styles.adminLink} href="/admin/login">
                  管理员登录
                </Link>
              )}
              {isAdmin ? (
                <button className={styles.refreshButton} type="button" onClick={refresh} disabled={isPending}>
                  {isPending ? "处理中..." : "立即刷新"}
                </button>
              ) : null}
            </div>
          </div>
        </div>

        <div className={styles.controls}>
          <div className={styles.rangeList} role="tablist" aria-label="时间范围">
            {RANGE_OPTIONS.map((option) => {
              const active = !startDate && !endDate && option.value === range;
              return (
                <button
                  key={option.value}
                  className={`${styles.rangeButton} ${active ? styles.rangeButtonActive : ""}`.trim()}
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
          <div className={styles.filterTools}>
            <label className={styles.sortField}>
              <span className={styles.controlLabel}>排序方式</span>
              <select
                className={styles.sortSelect}
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
            <label className={styles.sortField}>
              <span className={styles.controlLabel}>分组</span>
              <select
                className={styles.sortSelect}
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
            <label className={styles.sortField}>
              <span className={styles.controlLabel}>信息源</span>
              <select
                className={styles.sortSelect}
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
            <div className={styles.customRange}>
              <label className={styles.dateField}>
                <span className={styles.controlLabel}>开始日期</span>
                <input
                  className={styles.dateInput}
                  aria-label="开始日期"
                  type="date"
                  value={startDate ?? ""}
                  onChange={(event) => setStartDate(event.target.value || null)}
                  disabled={isPending}
                />
              </label>
              <label className={styles.dateField}>
                <span className={styles.controlLabel}>结束日期</span>
                <input
                  className={styles.dateInput}
                  aria-label="结束日期"
                  type="date"
                  value={endDate ?? ""}
                  onChange={(event) => setEndDate(event.target.value || null)}
                  disabled={isPending}
                />
              </label>
              <button className={styles.secondaryButton} type="button" onClick={applyCustomRange} disabled={isPending}>
                应用时间范围
              </button>
              {startDate || endDate ? (
                <button className={styles.secondaryButton} type="button" onClick={clearCustomRange} disabled={isPending}>
                  清空自定义
                </button>
              ) : null}
            </div>
          </div>
        </div>

        {isAdmin ? (
          <div className={styles.adminOverview}>
            <span className={styles.metaLabel}>管理概览</span>
            <p className={styles.adminOverviewText}>已启用管理员模式，可刷新数据、进入内容审核页，并对单条内容重新生成翻译或摘要。</p>
          </div>
        ) : null}

        <div className={styles.metaRow}>
          <div className={styles.metaCard}>
            <span className={styles.metaLabel}>当前范围</span>
            <p className={styles.metaValue}>{summary.rangeLabel}</p>
          </div>
          <div className={styles.metaCard}>
            <span className={styles.metaLabel}>当前条数</span>
            <p className={styles.metaValue}>{summary.count} 条</p>
          </div>
          <div className={styles.metaCard}>
            <span className={styles.metaLabel}>当前排序</span>
            <p className={styles.metaValue}>{summary.sortLabel}</p>
          </div>
          <div className={styles.metaCard}>
            <span className={styles.metaLabel}>最近抓取</span>
            <p className={styles.metaValue}>{formatRunStatus(status)}</p>
          </div>
        </div>
      </div>

      {refreshMessage ? <p className={styles.empty}>{refreshMessage}</p> : null}

      <div className={styles.stream}>
        {items.length === 0 ? (
          <div className={styles.empty}>当前时间范围内还没有可展示内容，可以先点击“立即刷新”拉取数据。</div>
        ) : (
          items.map((entry) =>
            entry.type === "cluster" ? (
              <article key={entry.id} className={styles.card}>
                <div className={styles.clusterHeader}>
                  <div>
                    <h2 className={styles.cardTitle}>{entry.title}</h2>
                    <div className={styles.cardMeta}>
                      <span>{formatDate(entry.latestPublishedAt)}</span>
                      <span>{entry.sourceCount} 个来源</span>
                      <span>{entry.itemCount} 条相关内容</span>
                      <span>{formatScore(entry.score)}</span>
                    </div>
                  </div>
                  <button
                    className={styles.secondaryButton}
                    type="button"
                    onClick={() => toggleCluster(entry.id)}
                    disabled={isPending}
                  >
                    {openClusters[entry.id] ? "收起相关内容" : "展开相关内容"}
                  </button>
                </div>
                <p className={styles.cardSummary}>{entry.summary}</p>
                <div className={styles.previewList}>
                  {entry.itemsPreview.map((preview) => (
                    <div key={preview.id} className={styles.previewCard}>
                      <strong>{preview.title}</strong>
                      <span>{preview.sourceName}</span>
                    </div>
                  ))}
                </div>
                {openClusters[entry.id] ? (
                  <div className={styles.clusterList}>
                    {(expandedClusters[entry.id] ?? entry.itemsPreview).map((clusterItem) => (
                      <div key={clusterItem.id} className={styles.clusterItem}>
                        <div className={styles.clusterItemHeader}>
                          <a href={clusterItem.originalUrl} target="_blank" rel="noreferrer">
                            {clusterItem.title}
                          </a>
                          <span>{formatScore(clusterItem.score)}</span>
                        </div>
                        <div className={styles.cardMeta}>
                          <span>{formatDate(clusterItem.publishedAt)}</span>
                          <span>{clusterItem.sourceName}</span>
                          <span>{clusterItem.author || "未知作者"}</span>
                        </div>
                        <p className={styles.clusterItemSummary}>{clusterItem.summary}</p>
                      </div>
                    ))}
                  </div>
                ) : null}
              </article>
            ) : (
              <article key={entry.id} className={styles.card}>
                <h2 className={styles.cardTitle}>
                  <a href={entry.originalUrl} target="_blank" rel="noreferrer">
                    {entry.title}
                  </a>
                </h2>
                <div className={styles.cardMeta}>
                  <span>{formatDate(entry.publishedAt)}</span>
                  <span>{entry.sourceName}</span>
                  <span>{entry.author || "未知作者"}</span>
                  <span>{formatScore(entry.score)}</span>
                </div>
                <p className={styles.cardSummary}>{entry.summary}</p>
                {isAdmin ? (
                  <div className={styles.cardAdminActions}>
                    {entry.canRegenerateTranslation ? (
                      <button
                        className={styles.secondaryButton}
                        type="button"
                        onClick={() => regenerateItem(entry.id, "translation")}
                        disabled={isPending}
                      >
                        重新生成翻译
                      </button>
                    ) : null}
                    <button
                      className={styles.secondaryButton}
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
        <div className={styles.footerActions}>
          <button className={styles.loadMoreButton} type="button" onClick={loadMore} disabled={isPending}>
            {isPending ? "载入中..." : "加载更多"}
          </button>
        </div>
      ) : null}
    </section>
  );
}
