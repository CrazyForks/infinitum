"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";

import styles from "@/components/admin/admin.module.css";
import type { ClusterDTO, ReviewItemDTO } from "@/lib/feed/types";

type ReviewTab = "filtered" | "clusters";

export function ContentReviewPanel() {
  const [activeTab, setActiveTab] = useState<ReviewTab>("filtered");
  const [filteredItems, setFilteredItems] = useState<ReviewItemDTO[]>([]);
  const [clusters, setClusters] = useState<ClusterDTO[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    startTransition(async () => {
      const [filteredResponse, clusterResponse] = await Promise.all([
        fetch("/api/admin/items?moderationStatus=filtered"),
        fetch("/api/admin/clusters"),
      ]);

      const filteredPayload = (await filteredResponse.json()) as { items?: ReviewItemDTO[]; error?: string };
      const clusterPayload = (await clusterResponse.json()) as { clusters?: ClusterDTO[]; error?: string };

      if (filteredPayload.error) {
        setMessage(filteredPayload.error);
      } else {
        setFilteredItems(filteredPayload.items ?? []);
      }

      if (clusterPayload.error) {
        setMessage(clusterPayload.error);
      } else {
        setClusters(clusterPayload.clusters ?? []);
      }
    });
  }, []);

  const postAction = (
    url: string,
    successMessage: string,
    onSuccess?: (payload: {
      item?: ReviewItemDTO;
      cluster?: ClusterDTO | null;
      taskRun?: { id: string; kind?: string };
      error?: string;
    }) => void,
  ) => {
    startTransition(async () => {
      const response = await fetch(url, { method: "POST" });
      const payload = (await response.json()) as {
        item?: ReviewItemDTO;
        cluster?: ClusterDTO | null;
        taskRun?: { id: string; kind?: string };
        error?: string;
      };

      if (!response.ok || payload.error) {
        setMessage(payload.error ?? "操作失败");
        return;
      }

      onSuccess?.(payload);
      setMessage(successMessage);
    });
  };

  return (
    <div className={styles.settingsShell}>
      <div className={styles.toolbar}>
        <div>
          <div className={styles.kicker}>Content Review</div>
          <h1 className={styles.title}>内容审核</h1>
          <p className={styles.description}>查看被 AI 过滤的内容、手动恢复条目，并管理聚合后的主题卡片。</p>
        </div>
        <div className={styles.toolbarActions}>
          <Link className={styles.linkButton} href="/">
            返回首页
          </Link>
          <Link className={styles.linkButton} href="/admin/settings">
            后台设置
          </Link>
          <Link className={styles.linkButton} href="/admin/monitor">
            任务监控
          </Link>
        </div>
      </div>

      <div className={styles.inlineActions}>
        <button
          className={activeTab === "filtered" ? styles.primaryButton : styles.secondaryButton}
          type="button"
          onClick={() => setActiveTab("filtered")}
        >
          过滤内容
        </button>
        <button
          className={activeTab === "clusters" ? styles.primaryButton : styles.secondaryButton}
          type="button"
          onClick={() => setActiveTab("clusters")}
        >
          聚合管理
        </button>
      </div>

      {message ? <p className={styles.message}>{message}</p> : null}

      {activeTab === "filtered" ? (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>待处理过滤内容</h2>
          <div className={styles.list}>
            {filteredItems.map((item) => (
              <article key={item.id} className={styles.reviewCard}>
                <div className={styles.reviewHeader}>
                  <div>
                    <h3 className={styles.reviewTitle}>{item.title}</h3>
                    <p className={styles.reviewMeta}>
                      {item.sourceName} · {new Date(item.publishedAt).toLocaleString("zh-CN")}
                    </p>
                  </div>
                  <div className={styles.badgeRow}>
                    <span className={styles.infoBadge}>{item.moderationReason ?? "filtered"}</span>
                    <span className={styles.infoBadge}>质量 {item.qualityScore}</span>
                  </div>
                </div>
                <p className={styles.reviewSummary}>{item.summary}</p>
                <p className={styles.reviewDetail}>{item.moderationDetail || item.qualityRationale}</p>
                <div className={styles.inlineActions}>
                  <button
                    className={styles.primaryButton}
                    type="button"
                    disabled={isPending}
                    onClick={() =>
                      postAction(`/api/admin/items/${item.id}/restore`, "内容已恢复。", () => {
                        setFilteredItems((current) => current.filter((entry) => entry.id !== item.id));
                      })
                    }
                  >
                    恢复内容
                  </button>
                  <button
                    className={styles.secondaryButton}
                    type="button"
                    disabled={isPending}
                    onClick={() =>
                      postAction(`/api/admin/items/${item.id}/reanalyze`, "已创建后台任务，正在处理中。", (payload) => {
                        if (payload.item?.moderationStatus !== "filtered") {
                          setFilteredItems((current) => current.filter((entry) => entry.id !== item.id));
                        }
                      })
                    }
                  >
                    重新 AI 判定
                  </button>
                  <button
                    className={styles.secondaryButton}
                    type="button"
                    onClick={() => setMessage("已保持当前过滤状态。")}
                  >
                    保持过滤
                  </button>
                </div>
              </article>
            ))}
            {filteredItems.length === 0 ? <div className={styles.emptyState}>当前没有待处理的过滤内容。</div> : null}
          </div>
        </section>
      ) : (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>聚合结果管理</h2>
          <div className={styles.list}>
            {clusters.map((cluster) => (
              <article key={cluster.id} className={styles.reviewCard}>
                <div className={styles.reviewHeader}>
                  <div>
                    <h3 className={styles.reviewTitle}>{cluster.title}</h3>
                    <p className={styles.reviewMeta}>
                      {cluster.itemCount} 条内容 · {new Date(cluster.latestPublishedAt).toLocaleString("zh-CN")}
                    </p>
                  </div>
                  <div className={styles.badgeRow}>
                    <span className={styles.infoBadge}>{cluster.status}</span>
                    <span className={styles.infoBadge}>质量 {cluster.score}</span>
                  </div>
                </div>
                <p className={styles.reviewSummary}>{cluster.summary}</p>
                <div className={styles.previewList}>
                  {cluster.items.map((item) => (
                    <div key={item.id} className={styles.previewCard}>
                      <div className={styles.clusterItemHeader}>
                        <strong>{item.title}</strong>
                        <button
                          className={styles.secondaryButton}
                          type="button"
                          disabled={isPending}
                          onClick={() =>
                            postAction(`/api/admin/clusters/${cluster.id}/items/${item.id}/detach`, "已移出聚合组。")
                          }
                        >
                          移出条目
                        </button>
                      </div>
                      <span>{item.sourceName}</span>
                    </div>
                  ))}
                </div>
                <div className={styles.inlineActions}>
                  <button
                    className={styles.secondaryButton}
                    type="button"
                    disabled={isPending}
                    onClick={() =>
                      postAction(`/api/admin/clusters/${cluster.id}/regenerate-summary`, "已创建后台任务，正在处理中。")
                    }
                  >
                    重新生成聚合摘要
                  </button>
                  {cluster.status === "hidden" ? (
                    <button
                      className={styles.primaryButton}
                      type="button"
                      disabled={isPending}
                      onClick={() =>
                        postAction(`/api/admin/clusters/${cluster.id}/restore`, "聚合组已恢复。", (payload) => {
                          setClusters((current) =>
                            current.map((entry) => (entry.id === cluster.id ? payload.cluster ?? entry : entry)),
                          );
                        })
                      }
                    >
                      恢复聚合组
                    </button>
                  ) : (
                    <button
                      className={styles.primaryButton}
                      type="button"
                      disabled={isPending}
                      onClick={() =>
                        postAction(`/api/admin/clusters/${cluster.id}/hide`, "聚合组已隐藏。", (payload) => {
                          setClusters((current) =>
                            current.map((entry) => (entry.id === cluster.id ? payload.cluster ?? entry : entry)),
                          );
                        })
                      }
                    >
                      隐藏聚合组
                    </button>
                  )}
                </div>
              </article>
            ))}
            {clusters.length === 0 ? <div className={styles.emptyState}>当前没有可管理的聚合结果。</div> : null}
          </div>
        </section>
      )}
    </div>
  );
}
