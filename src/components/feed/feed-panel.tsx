"use client";

import { useEffect, useMemo, useState, useTransition } from "react";

import styles from "@/components/feed/feed-panel.module.css";
import { RANGE_OPTIONS } from "@/lib/feed/range";
import type { FeedItemDTO, FeedRange, FetchRunSnapshot } from "@/lib/feed/types";

const STATUS_POLL_INTERVAL_MS = 2_000;

type FeedPanelProps = {
  initialItems: FeedItemDTO[];
  initialRange: FeedRange;
  initialNextCursor: string | null;
  initialStatus: FetchRunSnapshot | null;
};

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
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

export function FeedPanel({
  initialItems,
  initialRange,
  initialNextCursor,
  initialStatus,
}: FeedPanelProps) {
  const [items, setItems] = useState(initialItems);
  const [range, setRange] = useState<FeedRange>(initialRange);
  const [nextCursor, setNextCursor] = useState<string | null>(initialNextCursor);
  const [status, setStatus] = useState<FetchRunSnapshot | null>(initialStatus);
  const [isPending, startTransition] = useTransition();
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null);

  const summary = useMemo(
    () => ({
      count: items.length,
      rangeLabel: RANGE_OPTIONS.find((option) => option.value === range)?.label ?? "7天",
    }),
    [items.length, range],
  );

  async function fetchFeed(nextRange: FeedRange, cursor?: string | null) {
    const search = new URLSearchParams({ range: nextRange });

    if (cursor) {
      search.set("cursor", cursor);
    }

    const response = await fetch(`/api/feed?${search.toString()}`);
    return (await response.json()) as {
      items: FeedItemDTO[];
      nextCursor: string | null;
    };
  }

  const loadRange = (nextRange: FeedRange) => {
    startTransition(async () => {
      const payload = await fetchFeed(nextRange);
      setRange(nextRange);
      setItems(payload.items);
      setNextCursor(payload.nextCursor);
      setRefreshMessage(null);
    });
  };

  const refresh = () => {
    startTransition(async () => {
      const response = await fetch("/api/ingest/run", { method: "POST" });
      const payload = (await response.json()) as {
        run?: FetchRunSnapshot | null;
        error?: string;
      };

      if (payload.error) {
        setRefreshMessage(payload.error);
        return;
      }

      setStatus(payload.run ?? null);
      setRefreshMessage("抓取任务已启动，正在后台处理中。");
    });
  };

  useEffect(() => {
    if (status?.status !== "running") {
      return;
    }

    const timer = window.setTimeout(() => {
      startTransition(async () => {
        const response = await fetch("/api/ingest/status");
        const payload = (await response.json()) as {
          run?: FetchRunSnapshot | null;
        };

        setStatus(payload.run ?? null);

        if (payload.run && payload.run.status !== "running") {
          const feedPayload = await fetchFeed(range);
          setItems(feedPayload.items);
          setNextCursor(feedPayload.nextCursor);
          setRefreshMessage(
            payload.run.status === "succeeded" || payload.run.status === "partial"
              ? "抓取完成，已重新载入当前时间范围。"
              : "抓取失败，请稍后重试。",
          );
        }
      });
    }, STATUS_POLL_INTERVAL_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [range, startTransition, status]);

  const loadMore = () => {
    if (!nextCursor) {
      return;
    }

    startTransition(async () => {
      const payload = await fetchFeed(range, nextCursor);

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
                聚合 RSS 内容、原文补抓、黑名单过滤、标题翻译与摘要生成，形成一条可快速浏览的编辑部式消息流。
              </p>
            </div>
            <button className={styles.refreshButton} type="button" onClick={refresh} disabled={isPending}>
              {isPending ? "处理中..." : "立即刷新"}
            </button>
          </div>
        </div>

        <div className={styles.controls}>
          <div className={styles.rangeList} role="tablist" aria-label="时间范围">
            {RANGE_OPTIONS.map((option) => {
              const active = option.value === range;
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
        </div>

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
          items.map((item) => (
            <article key={item.id} className={styles.card}>
              <h2 className={styles.cardTitle}>
                <a href={item.originalUrl} target="_blank" rel="noreferrer">
                  {item.title}
                </a>
              </h2>
              <div className={styles.cardMeta}>
                <span>{formatDate(item.publishedAt)}</span>
                <span>{item.sourceName}</span>
                <span>{item.author || "未知作者"}</span>
              </div>
              <p className={styles.cardSummary}>{item.summary}</p>
            </article>
          ))
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
