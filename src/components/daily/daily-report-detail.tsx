"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition } from "react";

import {
  addDailyReportRefinementSources,
  deleteDailyReport,
  discardDailyReportRefinementSession,
  getAdminDailyReportDetail,
  getDailyReportRefinementSession,
  publishDailyReport,
  requestDailyReportGeneration,
  saveDailyReportRefinement,
  searchDailyReportRefinementSources,
  streamDailyReportRefinement,
  unpublishDailyReport,
  type DailyReportRefinementCandidate,
} from "@/components/daily/daily-report.api";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { useClientAdminSessionState } from "@/components/ui/use-client-admin-session";
import {
  IconArrowDown,
  IconCheck,
  IconEye,
  IconEyeOff,
  IconLink,
  IconList,
  IconNote,
  IconPlus,
  IconRefresh,
  IconRobot,
  IconTrash,
} from "@/components/ui/icons";
import { ModalShell } from "@/components/ui/modal-shell";
import { formatDailyReportDateTime } from "@/lib/daily-report/date";
import { buildDailyReportDetailMarkdown } from "@/lib/daily-report/export";
import type {
  DailyReportDetailDTO,
  DailyReportRefinementSourceSearchResult,
  DailyReportSourceRegistryEntry,
} from "@/lib/daily-report/types";
import { renderSafeMarkdown } from "@/lib/markdown/safe-html";
import { cx } from "@/lib/ui/cx";

type DailyReportDetailProps = {
  report: DailyReportDetailDTO | null;
  date: string;
  isAdmin: boolean;
  hydrateAdminClient?: boolean;
};

type DailyReportDetailContentProps = {
  report: DailyReportDetailDTO;
  isAdmin: boolean;
};

type AdminReportState = {
  date: string | null;
  report: DailyReportDetailDTO | null;
};

type TocItem = {
  id: string;
  text: string;
  level: number;
};

type RefinementMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  pending?: boolean;
};

function statusLabel(status: DailyReportDetailDTO["status"]) {
  if (status === "published") return "已发布";
  if (status === "failed") return "失败";
  return "草稿";
}

function truncateNavTitle(title: string) {
  return title.length > 24 ? `${title.slice(0, 24)}...` : title;
}

function classifyRefinementIntent(instruction: string, messages: RefinementMessage[]): "chat" | "generate" {
  const normalized = instruction.trim();
  if (!normalized) return "chat";

  const directGenerateSignals = [
    /(重新生成|生成).{0,6}(日报|草稿|候选稿|候选|版本|结果|这版)/,
    /(日报|草稿|候选稿|候选|版本|结果|这版).{0,6}(重新生成|生成|落稿|出稿|成稿|产出)/,
    /(落稿|出稿|成稿|产出|形成|输出).{0,8}(日报|草稿|候选稿|候选|版本|结果|这版)?/,
    /(采纳|采用|应用|按).{0,8}(这个|上述|上面|这版|方案|改法).{0,8}(生成|落稿|出稿|成稿|更新)?/,
    /保存前.{0,8}(预览|检查)/,
  ];
  if (directGenerateSignals.some((pattern) => pattern.test(normalized))) {
    return "generate";
  }

  const lastAssistant = [...messages].reverse().find((message) => message.role === "assistant" && !message.pending);
  const userConfirmed = /^(可以|好的|好|确认|同意|接受|采纳|采用|就这样|行|生成|落稿|出稿|成稿|按这个来|按上面来)[。！!.\s]*$/.test(normalized);
  if (lastAssistant && userConfirmed) {
    const assistantRequestedApply = [
      /(确认|是否|要不要|需要|若|如果).{0,18}(采纳|采用|生成|落稿|出稿|成稿|更新|调整|加入|纳入|接受)/,
      /(接受|同意|确认).{0,18}(位置|表达|方案|改法|结构|顺序)/,
      /我(将|会).{0,12}(更新|调整|生成|纳入|加入|应用)/,
      /可以.{0,8}(生成|落稿|出稿|成稿|更新).{0,8}(日报|草稿|候选稿|候选|版本)?/,
    ];
    if (assistantRequestedApply.some((pattern) => pattern.test(lastAssistant.content))) {
      return "generate";
    }
  }

  return "chat";
}

function TableOfContents({ items, activeId, onSelect }: {
  items: TocItem[];
  activeId: string;
  onSelect: (id: string) => void;
}) {
  if (items.length === 0) return null;

  return (
    <nav className="space-y-1 border-l-2 border-[color:var(--line)] pl-2">
      {items.map((item) => (
        <a
          key={item.id}
          href={`#${item.id}`}
          onClick={(event) => {
            event.preventDefault();
            onSelect(item.id);
          }}
          className={cx(
            "block truncate rounded-sm px-2 py-1 text-xs transition",
            activeId === item.id
              ? "bg-[var(--accent-soft)] font-semibold text-[var(--accent-strong)]"
              : "text-[var(--text-2)] hover:bg-[var(--bg-muted)] hover:text-[var(--text-1)]",
          )}
          style={{ paddingLeft: `${(item.level - 1) * 8 + 8}px` }}
        >
          {item.text}
        </a>
      ))}
    </nav>
  );
}

function DailyReportUnavailable({ isAdmin, isLoading }: { isAdmin: boolean; isLoading: boolean }) {
  if (isLoading) {
    return (
      <div className="flex min-h-48 w-full items-center justify-center px-4 py-12 text-sm text-[var(--text-2)]">
        加载中...
      </div>
    );
  }

  return (
    <section className="mx-auto flex w-full max-w-3xl flex-1 items-center justify-center px-4 py-16 text-center sm:px-6 lg:px-8">
      <div className="panel-raised rounded-sm border border-[color:var(--line)] bg-[var(--surface)] px-6 py-8 shadow-[var(--shadow-sm)]">
        <h1 className="text-xl font-semibold text-[var(--foreground)]">日报不存在</h1>
        <p className="mt-3 text-sm leading-6 text-[var(--text-2)]">
          {isAdmin ? "未找到这篇日报，或日报已被删除。" : "这篇日报尚未发布或不存在。"}
        </p>
        <Link
          href="/daily"
          className="mt-5 inline-flex rounded-sm bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
        >
          返回日报列表
        </Link>
      </div>
    </section>
  );
}

export function DailyReportDetail({
  report: initialReport,
  date,
  isAdmin: initialIsAdmin,
  hydrateAdminClient = false,
}: DailyReportDetailProps) {
  const { isAdmin, isResolving: isResolvingAdminSession } = useClientAdminSessionState(
    initialIsAdmin,
    hydrateAdminClient,
  );
  const [adminReportState, setAdminReportState] = useState<AdminReportState>({
    date: null,
    report: null,
  });
  const shouldFetchAdminReport = hydrateAdminClient && isAdmin && !initialIsAdmin;
  const adminReport = adminReportState.date === date ? adminReportState.report : null;
  const report = adminReport ?? initialReport;
  const isLoadingAdminReport = shouldFetchAdminReport && adminReportState.date !== date;

  useEffect(() => {
    if (!shouldFetchAdminReport || adminReportState.date === date) {
      return;
    }

    let active = true;

    getAdminDailyReportDetail(date)
      .then((result) => {
        if (!active) return;
        setAdminReportState({
          date,
          report: result.ok ? (result.data.report ?? null) : null,
        });
      })
      .catch(() => {
        if (active) {
          setAdminReportState({ date, report: null });
        }
      });

    return () => {
      active = false;
    };
  }, [adminReportState.date, date, shouldFetchAdminReport]);

  if (!report) {
    return (
      <DailyReportUnavailable
        isAdmin={isAdmin}
        isLoading={isResolvingAdminSession || (isAdmin && isLoadingAdminReport)}
      />
    );
  }

  return <DailyReportDetailContent report={report} isAdmin={isAdmin} />;
}

function DailyReportDetailContent({ report, isAdmin }: DailyReportDetailContentProps) {
  const router = useRouter();
  const contentRef = useRef<HTMLDivElement | null>(null);
  const refinementMessagesRef = useRef<HTMLDivElement | null>(null);
  const sourceListOpenStateRef = useRef(new Map<string, boolean>());
  const sourceListContentHtmlRef = useRef("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [refinementDialogOpen, setRefinementDialogOpen] = useState(false);
  const [newRefinementDialogOpen, setNewRefinementDialogOpen] = useState(false);
  const [candidatePreviewDialogOpen, setCandidatePreviewDialogOpen] = useState(false);
  const [sourceResultsDialogOpen, setSourceResultsDialogOpen] = useState(false);
  const [activeTocId, setActiveTocId] = useState("top");
  const [tocItems, setTocItems] = useState<TocItem[]>([]);
  const [refinementInstruction, setRefinementInstruction] = useState("");
  const [refinementSessionId, setRefinementSessionId] = useState<string | null>(null);
  const [refinementMessages, setRefinementMessages] = useState<RefinementMessage[]>([]);
  const [refinementCandidate, setRefinementCandidate] = useState<DailyReportRefinementCandidate | null>(null);
  const [sourceQuery, setSourceQuery] = useState("");
  const [sourceResults, setSourceResults] = useState<DailyReportRefinementSourceSearchResult[]>([]);
  const [sourceRegistry, setSourceRegistry] = useState<DailyReportSourceRegistryEntry[] | null>(null);
  const [shouldRestoreRefinementSession, setShouldRestoreRefinementSession] = useState(true);
  const [hasSearchedSources, setHasSearchedSources] = useState(false);
  const [isRefining, setIsRefining] = useState(false);
  const [isLoadingRefinementSession, setIsLoadingRefinementSession] = useState(false);
  const [isSearchingSources, setIsSearchingSources] = useState(false);
  const [addingSourceKey, setAddingSourceKey] = useState<string | null>(null);
  const [recentlyAddedSourceKey, setRecentlyAddedSourceKey] = useState<string | null>(null);
  const [isPageFooterVisible, setIsPageFooterVisible] = useState(false);
  const [isPending, startTransition] = useTransition();
  const sourceStats = useMemo(() => {
    const counts = new Map<string, number>();
    for (const source of report.sources) {
      counts.set(source.sourceName, (counts.get(source.sourceName) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name));
  }, [report.sources]);
  const detailMarkdown = useMemo(() => buildDailyReportDetailMarkdown(report), [report]);
  const contentHtml = useMemo(() => renderSafeMarkdown(detailMarkdown, {
    headingIdPrefix: "daily-heading",
    collapsibleSourceLists: true,
  }), [detailMarkdown]);
  const refinementPreviewHtml = useMemo(() => {
    return refinementCandidate
      ? renderSafeMarkdown(refinementCandidate.renderedMarkdown, { headingIdPrefix: "daily-refinement-preview" })
      : "";
  }, [refinementCandidate]);
  const refinementMessageHtmlById = useMemo(() => {
    return new Map(refinementMessages.map((message) => [
      message.id,
      renderSafeMarkdown(message.content || (message.pending ? "正在回复..." : ""), {
        headingIdPrefix: `daily-refinement-message-${message.id}`,
      }),
    ]));
  }, [refinementMessages]);
  const sourceResultHtmlByKey = useMemo(() => {
    return new Map(sourceResults.map((source) => [
      source.sourceKey,
      {
        title: renderSafeMarkdown(source.title, {
          headingIdPrefix: `daily-refinement-source-title-${source.candidateNumber}`,
        }),
        summary: source.summary
          ? renderSafeMarkdown(source.summary, {
            headingIdPrefix: `daily-refinement-source-summary-${source.candidateNumber}`,
          })
          : "",
      },
    ]));
  }, [sourceResults]);
  const reportSourcePreview = useMemo(() => {
    const sources = new Map<string, DailyReportDetailDTO["sources"][number]>();
    for (const source of report.sources) {
      const key = `${source.sourceNumber ?? "unknown"}:${source.url}`;
      if (!sources.has(key)) {
        sources.set(key, source);
      }
    }
    return Array.from(sources.values()).sort((left, right) => {
      const leftNumber = left.sourceNumber ?? Number.MAX_SAFE_INTEGER;
      const rightNumber = right.sourceNumber ?? Number.MAX_SAFE_INTEGER;
      return leftNumber - rightNumber || left.title.localeCompare(right.title);
    });
  }, [report.sources]);
  const sourceContextCount = sourceRegistry?.length ?? reportSourcePreview.length;
  const canRefine = report.status !== "failed";
  const canSaveRefinement = report.status === "draft";
  const shouldShowRefinementStatus = isLoadingRefinementSession || report.status === "published" || report.status === "failed";
  const hasRefinementState = Boolean(
    refinementSessionId ||
    refinementMessages.length ||
    refinementCandidate ||
    refinementInstruction.trim() ||
    sourceQuery.trim() ||
    sourceResults.length ||
    sourceRegistry,
  );

  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;

    const headings = Array.from(content.querySelectorAll<HTMLHeadingElement>("h2, h3"));
    const nextItems = headings.map((heading) => {
      return {
        id: heading.id,
        text: heading.textContent ?? "",
        level: Number.parseInt(heading.tagName[1] ?? "2", 10),
      };
    }).filter((item) => item.id);

    setTocItems(nextItems);
    setActiveTocId(nextItems[0]?.id ?? "");
  }, [contentHtml]);

  useLayoutEffect(() => {
    const content = contentRef.current;
    if (!content) return;

    if (sourceListContentHtmlRef.current !== contentHtml) {
      sourceListContentHtmlRef.current = contentHtml;
      sourceListOpenStateRef.current.clear();
    }

    const sourceLists = Array.from(content.querySelectorAll<HTMLDetailsElement>("details.daily-report-source-list"));
    sourceLists.forEach((details, index) => {
      const key = String(index);
      details.dataset.sourceListKey = key;
      details.open = sourceListOpenStateRef.current.get(key) ?? false;
    });
  });

  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;

    const handleSourceListToggle = (event: Event) => {
      const target = event.target;
      if (!(target instanceof HTMLDetailsElement) || !target.classList.contains("daily-report-source-list")) {
        return;
      }

      const sourceLists = Array.from(content.querySelectorAll<HTMLDetailsElement>("details.daily-report-source-list"));
      const key = target.dataset.sourceListKey ?? String(sourceLists.indexOf(target));
      if (key === "-1") return;
      target.dataset.sourceListKey = key;
      sourceListOpenStateRef.current.set(key, target.open);
    };

    content.addEventListener("toggle", handleSourceListToggle, true);
    return () => {
      content.removeEventListener("toggle", handleSourceListToggle, true);
    };
  }, [contentHtml]);

  useEffect(() => {
    if (tocItems.length === 0) return;

    let frameId = 0;
    const updateActiveHeading = () => {
      frameId = 0;
      const bottomDistance = document.documentElement.scrollHeight - (window.scrollY + window.innerHeight);
      if (bottomDistance < 128 && tocItems.at(-1)?.id) {
        setActiveTocId(tocItems.at(-1)?.id ?? "");
        return;
      }

      const anchorTop = 128;
      const headings = tocItems
        .map((item) => ({
          id: item.id,
          top: document.getElementById(item.id)?.getBoundingClientRect().top ?? Number.POSITIVE_INFINITY,
        }))
        .filter((item) => Number.isFinite(item.top));

      const nextActiveId = headings
        .map((item) => ({ ...item, distance: Math.abs(item.top - anchorTop) }))
        .sort((left, right) => left.distance - right.distance)[0]?.id ?? tocItems[0]?.id;

      if (nextActiveId) {
        setActiveTocId(nextActiveId);
      }
    };

    const scheduleUpdate = () => {
      if (frameId) return;
      frameId = window.requestAnimationFrame(updateActiveHeading);
    };

    updateActiveHeading();
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);

    return () => {
      if (frameId) {
        window.cancelAnimationFrame(frameId);
      }
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
    };
  }, [tocItems]);

  useEffect(() => {
    if (!refinementDialogOpen || !isAdmin || !canRefine || hasRefinementState || !shouldRestoreRefinementSession) return;

    let cancelled = false;
    setIsLoadingRefinementSession(true);
    getDailyReportRefinementSession(report.date)
      .then((result) => {
        if (cancelled) return;
        if (!result.ok || result.data.error || !result.data.session) return;

        setRefinementSessionId(result.data.session.id);
        setSourceRegistry(result.data.session.sourceRegistry);
        setRefinementCandidate(result.data.session.candidate ?? null);
        setRefinementMessages(result.data.session.messages.map((message) => ({
          id: message.id,
          role: message.role,
          content: message.content,
        })));
      })
      .catch((error) => {
        if (!cancelled) {
          setFeedback(error instanceof Error ? error.message : "恢复微调对话失败。");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingRefinementSession(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [canRefine, hasRefinementState, isAdmin, refinementDialogOpen, report.date, shouldRestoreRefinementSession]);

  useEffect(() => {
    if (!refinementDialogOpen) return;

    const frameId = window.requestAnimationFrame(() => {
      const container = refinementMessagesRef.current;
      if (!container) return;
      container.scrollTo({
        top: container.scrollHeight,
        behavior: isRefining ? "auto" : "smooth",
      });
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [isRefining, refinementDialogOpen, refinementMessages]);

  useEffect(() => {
    if (!isAdmin) return;

    const footer = document.querySelector("footer");
    if (!footer) return;

    const observer = new IntersectionObserver(([entry]) => {
      setIsPageFooterVisible(entry.isIntersecting);
    }, { threshold: 0.01 });

    observer.observe(footer);
    return () => {
      observer.disconnect();
    };
  }, [isAdmin]);

  const handleTocSelect = (id: string) => {
    setActiveTocId(id);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const runAction = (action: "publish" | "unpublish" | "regenerate") => {
    startTransition(async () => {
      setFeedback(null);

      if (action === "regenerate") {
        const result = await requestDailyReportGeneration(report.date);
        if (!result.ok || result.data.error) {
          setFeedback(result.data.error ?? "操作失败。");
          return;
        }
        if (result.data.taskRun?.id) {
          router.push(`/admin?tab=monitoring&section=tasks&task=${encodeURIComponent(result.data.taskRun.id)}`);
          return;
        }
        setFeedback("重新生成任务已提交。");
        return;
      }

      const result = action === "publish"
        ? await publishDailyReport(report.date)
        : await unpublishDailyReport(report.date);
      if (!result.ok || result.data.error) {
        setFeedback(result.data.error ?? "操作失败。");
        return;
      }
      setFeedback("状态已更新。");
      router.refresh();
    });
  };

  const exportMarkdown = () => {
    const blob = new Blob([`# ${report.title}\n\n${detailMarkdown.trim()}\n`], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${report.date}-ai-daily.md`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const confirmDelete = () => {
    startTransition(async () => {
      setFeedback(null);
      const result = await deleteDailyReport(report.date);
      if (!result.ok || result.data.error) {
        setFeedback(result.data.error ?? "日报删除失败。");
        return;
      }
      setDeleteDialogOpen(false);
      router.push("/daily");
    });
  };

  const appendRefinementMessage = (message: RefinementMessage) => {
    setRefinementMessages((current) => [...current, message]);
  };

  const resetRefinementSession = () => {
    setRefinementInstruction("");
    setRefinementSessionId(null);
    setRefinementMessages([]);
    setRefinementCandidate(null);
    setCandidatePreviewDialogOpen(false);
    setSourceQuery("");
    setSourceResults([]);
    setSourceRegistry(null);
    setHasSearchedSources(false);
    setSourceResultsDialogOpen(false);
    setAddingSourceKey(null);
    setRecentlyAddedSourceKey(null);
    setFeedback(null);
  };

  const requestNewRefinementSession = () => {
    if (isRefining || isSearchingSources || addingSourceKey) return;
    setNewRefinementDialogOpen(true);
  };

  const confirmNewRefinementSession = async () => {
    if (refinementSessionId) {
      await discardDailyReportRefinementSession(report.date, { sessionId: refinementSessionId }).catch(() => null);
    }
    setShouldRestoreRefinementSession(false);
    resetRefinementSession();
    setNewRefinementDialogOpen(false);
  };

  const submitRefinement = async (mode: "chat" | "generate") => {
    const instruction = mode === "generate" && !refinementInstruction.trim()
      ? "请基于以上对话和当前来源上下文，生成一版可保存的日报候选稿。"
      : refinementInstruction.trim();
    if (!instruction || isRefining) return;

    setFeedback(null);
    setIsRefining(true);
    if (mode === "generate") {
      setRefinementCandidate(null);
    }

    const userMessageId = `local-user-${Date.now()}`;
    const assistantMessageId = `local-assistant-${Date.now()}`;
    appendRefinementMessage({
      id: userMessageId,
      role: "user",
      content: mode === "generate" && !refinementInstruction.trim() ? "生成候选稿" : instruction,
    });
    appendRefinementMessage({
      id: assistantMessageId,
      role: "assistant",
      content: mode === "generate" ? "正在生成候选稿..." : "",
      pending: true,
    });

    try {
      await streamDailyReportRefinement(
        report.date,
        { sessionId: refinementSessionId, instruction, mode },
        (event) => {
          if (event.event === "session") {
            setRefinementSessionId(event.sessionId);
          } else if (event.event === "message_delta") {
            setRefinementMessages((current) => current.map((message) => (
              message.id === assistantMessageId
                ? { ...message, content: `${message.content}${event.text}` }
                : message
            )));
          } else if (event.event === "message_done") {
            setRefinementMessages((current) => current.map((message) => (
              message.id === assistantMessageId
                ? { ...message, id: event.messageId, pending: false }
                : message
            )));
          } else if (event.event === "candidate") {
            setRefinementCandidate({
              messageId: event.messageId,
              content: event.content,
              renderedMarkdown: event.renderedMarkdown,
            });
            setRefinementMessages((current) => current.map((message) => (
              message.id === assistantMessageId
                ? { ...message, id: event.messageId, content: "候选稿已生成，可在预览区检查后保存。", pending: false }
                : message
            )));
          } else if (event.event === "error") {
            setFeedback(event.message);
            setRefinementMessages((current) => current.map((message) => (
              message.id === assistantMessageId
                ? { ...message, content: event.message, pending: false }
                : message
            )));
          }
        },
      );
      setRefinementInstruction("");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "日报微调失败。");
      setRefinementMessages((current) => current.map((message) => (
        message.id === assistantMessageId
          ? { ...message, content: error instanceof Error ? error.message : "日报微调失败。", pending: false }
          : message
      )));
    } finally {
      setIsRefining(false);
    }
  };

  const searchSources = async () => {
    const query = sourceQuery.trim();
    if (!query || isSearchingSources) return;

    setFeedback(null);
    setIsSearchingSources(true);
    try {
      const result = await searchDailyReportRefinementSources(report.date, {
        sessionId: refinementSessionId,
        query,
        limit: 10,
      });
      setHasSearchedSources(true);

      if (!result.ok || result.data.error) {
        setFeedback(result.data.error ?? "新增召回失败。");
        return;
      }

      setRefinementSessionId(result.data.sessionId);
      setSourceResults(result.data.sources);
      setSourceResultsDialogOpen(true);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "新增召回失败。");
    } finally {
      setIsSearchingSources(false);
    }
  };

  const addSourceToContext = async (sourceKey: string) => {
    if (!refinementSessionId || addingSourceKey) return;

    setFeedback(null);
    setAddingSourceKey(sourceKey);
    try {
      const result = await addDailyReportRefinementSources(report.date, {
        sessionId: refinementSessionId,
        sourceKeys: [sourceKey],
      });

      if (!result.ok || result.data.error) {
        setFeedback(result.data.error ?? "加入来源失败。");
        return;
      }

      setSourceRegistry(result.data.sourceRegistry);
      setRecentlyAddedSourceKey(sourceKey);
      setSourceResults((current) => current.filter((source) => source.sourceKey !== sourceKey));
      setSourceResultsDialogOpen(false);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "加入来源失败。");
    } finally {
      setAddingSourceKey(null);
    }
  };

  const saveRefinementCandidate = () => {
    if (!refinementSessionId || !refinementCandidate || !canSaveRefinement) return;

    startTransition(async () => {
      setFeedback(null);
      const result = await saveDailyReportRefinement(report.date, {
        sessionId: refinementSessionId,
        messageId: refinementCandidate.messageId,
      });

      if (!result.ok || result.data.error) {
        setFeedback(result.data.error ?? "微调保存失败。");
        return;
      }

      setFeedback("微调结果已保存。");
      setRefinementCandidate(null);
      setCandidatePreviewDialogOpen(false);
      setRefinementMessages((current) => [
        ...current,
        {
          id: `local-saved-${Date.now()}`,
          role: "assistant",
          content: "微调结果已保存到当前日报草稿。",
        },
      ]);
      router.refresh();
    });
  };

  return (
    <>
      <section className="border-b border-[color:var(--line)] bg-[var(--surface)]">
        <div className="mx-auto w-full max-w-7xl px-4 py-5 text-center sm:px-6 sm:py-6 lg:px-8">
          <div className="flex flex-wrap items-center justify-center gap-2">
            <h1 className="text-2xl font-semibold text-[var(--foreground)]">{report.title}</h1>
            {isAdmin ? <span className="rounded-sm bg-[var(--bg-muted)] px-2 py-0.5 text-xs text-[var(--text-2)]">{statusLabel(report.status)}</span> : null}
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-3 text-sm text-[var(--text-2)]">
            <span>来源：{report.sourceCount} 个引用</span>
            <span>生成：{formatDailyReportDateTime(report.generatedAt)}</span>
          </div>
        </div>
      </section>

      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8 lg:flex-row lg:px-8">
        <article className="panel-raised min-w-0 flex-1 rounded-sm border border-[color:var(--line)] bg-[var(--surface)] p-5 shadow-[var(--shadow-sm)] sm:p-7">
          <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="inline-flex items-center gap-2 text-lg font-semibold text-[var(--foreground)]">
                <IconNote className="h-4 w-4" />
                <span>内容</span>
              </h2>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <IconButton onClick={exportMarkdown} variant="ghost" size="md" title="导出 Markdown" className="rounded-sm">
                <IconArrowDown className="h-4 w-4" />
              </IconButton>
              {isAdmin ? (
                <>
                  <IconButton
                    onClick={() => runAction("regenerate")}
                    variant="ghost"
                    size="md"
                    title="重新生成日报"
                    disabled={isPending}
                    className="rounded-sm"
                  >
                    <IconRefresh className={cx("h-4 w-4", isPending && "animate-spin")} />
                  </IconButton>
                  <IconButton
                    onClick={() => runAction(report.status === "published" ? "unpublish" : "publish")}
                    variant="ghost"
                    size="md"
                    title={report.status === "published" ? "撤回为草稿" : "发布日报"}
                    disabled={isPending || report.status === "failed"}
                    className="rounded-sm"
                  >
                    {report.status === "published" ? (
                      <IconEyeOff className="h-4 w-4" />
                    ) : (
                      <IconEye className="h-4 w-4" />
                    )}
                  </IconButton>
                  <IconButton
                    onClick={() => setDeleteDialogOpen(true)}
                    variant="ghost"
                    size="md"
                    title="删除日报"
                    disabled={isPending}
                    className="rounded-sm hover:text-[var(--danger-ink)]"
                  >
                    <IconTrash className="h-4 w-4" />
                  </IconButton>
                </>
              ) : null}
            </div>
          </div>

          {feedback ? <div className="mb-5 rounded-sm bg-[var(--bg-muted)] px-3 py-2 text-sm text-[var(--text-2)]">{feedback}</div> : null}

          <div
            ref={contentRef}
            className="article-prose prose prose-sm max-w-none break-words overflow-x-auto"
            dangerouslySetInnerHTML={{ __html: contentHtml }}
          />

          <div className="mt-8 flex flex-col gap-3 text-sm sm:flex-row sm:items-center sm:justify-between">
            <Link
              href={report.previous ? `/daily/${report.previous.date}` : "#"}
              aria-disabled={!report.previous}
              title={report.previous?.title ?? "无上一篇"}
              className={cx(
                "rounded-lg px-3 py-2 text-left transition",
                report.previous
                  ? "bg-[var(--bg-muted)] text-[var(--text-2)] hover:bg-[var(--surface)] hover:text-[var(--text-1)]"
                  : "pointer-events-none cursor-not-allowed bg-[var(--bg-muted)] text-[var(--text-3)]",
              )}
            >
              <span className="block">← 上一篇</span>
              {report.previous ? (
                <span className="block text-xs text-[var(--text-3)]">{truncateNavTitle(report.previous.title)}</span>
              ) : null}
            </Link>
            <Link
              href={report.next ? `/daily/${report.next.date}` : "#"}
              aria-disabled={!report.next}
              title={report.next?.title ?? "无下一篇"}
              className={cx(
                "rounded-lg px-3 py-2 text-right transition",
                report.next
                  ? "bg-[var(--bg-muted)] text-[var(--text-2)] hover:bg-[var(--surface)] hover:text-[var(--text-1)]"
                  : "pointer-events-none cursor-not-allowed bg-[var(--bg-muted)] text-[var(--text-3)]",
              )}
            >
              <span className="block">下一篇 →</span>
              {report.next ? (
                <span className="block text-xs text-[var(--text-3)]">{truncateNavTitle(report.next.title)}</span>
              ) : null}
            </Link>
          </div>
        </article>

        <aside className="w-full flex-shrink-0 lg:w-80">
          <div className="panel-raised rounded-sm border border-[color:var(--line)] p-4 lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto">
            <div className="mb-3 flex items-center gap-2">
              <IconList className="h-4 w-4 text-[var(--text-2)]" />
              <h2 className="text-base font-semibold text-[var(--foreground)]">目录</h2>
            </div>
            <TableOfContents items={tocItems} activeId={activeTocId} onSelect={handleTocSelect} />
            <div className="mt-5 border-t border-[color:var(--line)] pt-4">
              <h3 className="text-base font-semibold text-[var(--foreground)]">来源统计</h3>
              <div className="mt-3 flex flex-wrap gap-2">
                {sourceStats.map((source) => (
                  <span key={source.name} className="rounded-sm bg-[var(--bg-muted)] px-2 py-1 text-xs text-[var(--text-2)]">
                    {source.name} {source.count}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </aside>
      </div>

      {isAdmin ? (
        <button
          type="button"
          onClick={() => setRefinementDialogOpen(true)}
          disabled={!canRefine}
          aria-hidden={isPageFooterVisible}
          tabIndex={isPageFooterVisible ? -1 : undefined}
          className={cx(
            "fixed bottom-6 left-1/2 z-40 inline-flex -translate-x-1/2 items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold shadow-lg transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(59,130,246,0.35)]",
            isPageFooterVisible ? "pointer-events-none translate-y-3 opacity-0" : "opacity-100",
            canRefine
              ? "border-[var(--accent)] bg-[var(--accent)] text-white hover:-translate-y-0.5 hover:shadow-xl"
              : "cursor-not-allowed border-[color:var(--line)] bg-[var(--surface)] text-[var(--text-3)]",
          )}
          title={canRefine ? "打开日报微调对话" : "失败状态日报不可微调"}
        >
          <IconRobot className="h-4 w-4" />
          <span>日报微调</span>
        </button>
      ) : null}

      <ModalShell
        isOpen={refinementDialogOpen}
        onClose={() => setRefinementDialogOpen(false)}
        title="日报微调"
        widthClassName="max-w-5xl"
        panelClassName="flex h-[calc(100vh-3rem)] max-h-[calc(100vh-3rem)] flex-col"
        bodyClassName="min-h-0 flex-1 overflow-hidden p-0"
      >
        <div className="grid h-full min-h-0 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="flex min-h-0 flex-col border-b border-[color:var(--line)] bg-[var(--surface)] lg:border-b-0 lg:border-r">
            {shouldShowRefinementStatus ? (
              <div className="border-b border-[color:var(--line)] px-4 py-3">
                {isLoadingRefinementSession ? (
                  <div className="mb-2 rounded-sm bg-[var(--bg-muted)] px-3 py-2 text-xs text-[var(--text-2)]">
                    正在恢复上次对话上下文...
                  </div>
                ) : null}
                {report.status === "published" ? (
                  <div className="rounded-sm bg-[var(--bg-muted)] px-3 py-2 text-xs text-[var(--text-2)]">
                    已发布日报可以对话和生成候选稿；保存前需要先撤回为草稿。
                  </div>
                ) : null}
                {report.status === "failed" ? (
                  <div className="rounded-sm bg-[var(--danger-surface)] px-3 py-2 text-xs text-[var(--danger-ink)]">
                    失败状态日报不可微调，请先重新生成。
                  </div>
                ) : null}
              </div>
            ) : null}

            <div
              ref={refinementMessagesRef}
              className="relative min-h-0 flex-1 overflow-y-auto bg-[var(--bg-muted)] px-4 py-4"
            >
              {refinementMessages.length === 0 ? (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <div
                    aria-hidden="true"
                    className="h-24 w-24 bg-contain bg-center bg-no-repeat opacity-10 grayscale"
                    style={{ backgroundImage: "url('/brand-mark.svg')" }}
                  />
                </div>
              ) : null}
              <div className="relative z-10 space-y-4">
                {refinementMessages.map((message) => {
                  const isUserMessage = message.role === "user";
                  return (
                    <div
                      key={message.id}
                      className={cx(
                        "flex items-end gap-2",
                        isUserMessage ? "justify-end" : "justify-start",
                      )}
                    >
                      {!isUserMessage ? (
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[color:var(--line)] bg-[var(--surface)] text-[var(--accent)] shadow-sm">
                          <IconRobot className="h-4 w-4" />
                        </div>
                      ) : null}
                      <div
                        className={cx(
                          "max-w-[82%] rounded-lg px-3 py-2 text-sm leading-6 shadow-sm",
                          isUserMessage
                            ? "border border-[color:var(--accent-soft)] bg-[var(--accent-soft)]/70 text-[var(--accent-strong)]"
                            : "border border-[color:var(--line)] bg-[var(--surface)] text-[var(--text-1)]",
                        )}
                      >
                        <div className="flex items-start gap-2">
                          <div
                            className={cx(
                              "article-prose prose prose-sm min-w-0 flex-1 break-words [&_p]:my-0 [&_ul]:my-1",
                              isUserMessage && "text-[var(--accent-strong)] [&_*]:text-inherit",
                            )}
                            dangerouslySetInnerHTML={{ __html: refinementMessageHtmlById.get(message.id) ?? "" }}
                          />
                          {message.role === "assistant" && refinementCandidate?.messageId === message.id ? (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => setCandidatePreviewDialogOpen(true)}
                              className="shrink-0"
                            >
                              查看
                            </Button>
                          ) : null}
                        </div>
                        {message.pending ? <div className="mt-1 text-xs opacity-70">生成中</div> : null}
                      </div>
                      {isUserMessage ? (
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] text-xs font-semibold text-[var(--accent-strong)] shadow-sm">
                          你
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="border-t border-[color:var(--line)] p-4">
              <textarea
                value={refinementInstruction}
                onChange={(event) => setRefinementInstruction(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
                  event.preventDefault();
                  if (isRefining || !canRefine || !refinementInstruction.trim()) return;
                  void submitRefinement(classifyRefinementIntent(refinementInstruction, refinementMessages));
                }}
                placeholder="如果微调信息已确认，可输入“生成日报”触发日报重新生成"
                className="min-h-24 w-full resize-y rounded-sm border border-[color:var(--line)] bg-[var(--surface)] px-3 py-2 text-sm leading-6 text-[var(--text-1)] outline-none transition focus:border-[var(--accent)]"
                disabled={isRefining || !canRefine}
              />
              <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
                {hasRefinementState ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={requestNewRefinementSession}
                    disabled={isRefining || isSearchingSources || Boolean(addingSourceKey)}
                    title="新对话"
                  >
                    新对话
                  </Button>
                ) : null}
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => submitRefinement(classifyRefinementIntent(refinementInstruction, refinementMessages))}
                  disabled={isRefining || !canRefine || !refinementInstruction.trim()}
                  title={isRefining ? "处理中" : "发送"}
                >
                  {isRefining ? "处理中" : "发送"}
                </Button>
              </div>
            </div>
          </div>

          <aside className="flex min-h-0 flex-col bg-[var(--surface)]">
            <div className="flex min-h-0 flex-1 flex-col gap-4 p-4">
              <section>
                <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold text-[var(--foreground)]">
                  <IconLink className="h-4 w-4" />
                  <span>新增召回</span>
                </h4>
                <div className="flex gap-2">
                  <input
                    value={sourceQuery}
                    onChange={(event) => {
                      setSourceQuery(event.target.value);
                      setHasSearchedSources(false);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        searchSources();
                      }
                    }}
                    placeholder="关键词或 #候选编号"
                    className="min-w-0 flex-1 rounded-sm border border-[color:var(--line)] bg-[var(--bg-muted)] px-2 py-2 text-sm outline-none transition placeholder:text-[var(--text-3)] focus:border-[var(--accent)] focus:bg-[var(--surface)]"
                    disabled={!canRefine || isSearchingSources}
                  />
                  <IconButton
                    onClick={searchSources}
                    disabled={!canRefine || isSearchingSources || !sourceQuery.trim()}
                    title="召回来源"
                    className="rounded-sm"
                  >
                    <IconRefresh className={cx("h-4 w-4", isSearchingSources && "animate-spin")} />
                  </IconButton>
                </div>
                <div className="mt-3">
                  {hasSearchedSources ? (
                    <button
                      type="button"
                      onClick={() => setSourceResultsDialogOpen(true)}
                      className="rounded-sm bg-[var(--bg-muted)] px-3 py-2 text-xs text-[var(--text-2)] transition hover:bg-[var(--surface)] hover:text-[var(--text-1)]"
                    >
                      查看召回结果（{sourceResults.length}）
                    </button>
                  ) : null}
                </div>
              </section>

              <section className="flex min-h-0 flex-1 flex-col border-t border-[color:var(--line)] pt-4">
                <h4 className="mb-2 flex items-center justify-between gap-2 text-sm font-semibold text-[var(--foreground)]">
                  <span className="inline-flex items-center gap-2">
                    <IconCheck className="h-4 w-4" />
                    <span>当前来源上下文</span>
                  </span>
                  <span className="rounded-sm bg-[var(--bg-muted)] px-2 py-0.5 text-xs font-normal text-[var(--text-3)]">
                    {sourceContextCount} 个来源
                  </span>
                </h4>
                <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
                  {sourceRegistry ? sourceRegistry.map((source) => (
                    <div
                      key={source.sourceKey}
                      className={cx(
                        "rounded-sm border border-transparent bg-[var(--bg-muted)] px-2 py-2 text-xs leading-5 text-[var(--text-2)]",
                        source.sourceKey === recentlyAddedSourceKey && "ring-2 ring-[rgba(59,130,246,0.35)]",
                      )}
                    >
                      <span className="font-semibold text-[var(--foreground)]">#{source.sourceNumber}</span>
                      {source.qualityScore != null ? (
                        <span className="ml-1 inline-flex rounded-sm border border-[color:var(--line)] bg-[var(--surface)] px-1.5 py-0.5 text-[11px] leading-none text-[var(--text-3)]">
                          评分 {source.qualityScore}
                        </span>
                      ) : null}
                      <span className="ml-1">{source.title}</span>
                    </div>
                  )) : reportSourcePreview.map((source) => (
                    <div key={`${source.sourceNumber ?? "unknown"}:${source.url}`} className="rounded-sm border border-transparent bg-[var(--bg-muted)] px-2 py-2 text-xs leading-5 text-[var(--text-2)]">
                      <span className="font-semibold text-[var(--foreground)]">#{source.sourceNumber ?? "-"}</span>
                      {source.sourceQualityScore != null ? (
                        <span className="ml-1 inline-flex rounded-sm border border-[color:var(--line)] bg-[var(--surface)] px-1.5 py-0.5 text-[11px] leading-none text-[var(--text-3)]">
                          评分 {source.sourceQualityScore}
                        </span>
                      ) : null}
                      <span className="ml-1">{source.title}</span>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </aside>
        </div>
      </ModalShell>

      <ModalShell
        isOpen={candidatePreviewDialogOpen}
        onClose={() => setCandidatePreviewDialogOpen(false)}
        title="候选稿预览"
        widthClassName="max-w-3xl"
        bodyClassName="max-h-[70vh] overflow-y-auto p-4"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setCandidatePreviewDialogOpen(false)}>
              关闭
            </Button>
            <Button
              variant="primary"
              onClick={saveRefinementCandidate}
              disabled={!refinementCandidate || isPending || !canSaveRefinement}
            >
              保存结果
            </Button>
          </div>
        }
      >
        {refinementCandidate ? (
          <div
            className="article-prose prose prose-sm max-w-none break-words"
            dangerouslySetInnerHTML={{ __html: refinementPreviewHtml }}
          />
        ) : (
          <div className="rounded-sm bg-[var(--bg-muted)] px-4 py-6 text-sm text-[var(--text-2)]">
            暂无可预览的候选稿。
          </div>
        )}
      </ModalShell>

      <ModalShell
        isOpen={sourceResultsDialogOpen}
        onClose={() => setSourceResultsDialogOpen(false)}
        title={`召回结果${hasSearchedSources ? `（${sourceResults.length}）` : ""}`}
        widthClassName="max-w-2xl"
        bodyClassName="max-h-[70vh] overflow-y-auto p-4"
      >
        <div className="space-y-3">
          {sourceResults.length > 0 ? sourceResults.map((source) => (
            <div key={source.sourceKey} className="rounded-sm border border-[color:var(--line)] bg-[var(--surface)] p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div
                    className="article-prose prose prose-sm max-w-none text-sm font-medium leading-5 text-[var(--foreground)] [&_p]:my-0"
                    dangerouslySetInnerHTML={{ __html: sourceResultHtmlByKey.get(source.sourceKey)?.title ?? "" }}
                  />
                  <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-xs text-[var(--text-3)]">
                    <span>#{source.candidateNumber}</span>
                    <span>{source.sourceName}</span>
                    {source.qualityScore != null ? <span>评分 {source.qualityScore}</span> : null}
                  </div>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => addSourceToContext(source.sourceKey)}
                  disabled={!refinementSessionId || addingSourceKey === source.sourceKey}
                >
                  <span className="inline-flex items-center gap-1">
                    {addingSourceKey === source.sourceKey ? <IconRefresh className="h-3.5 w-3.5 animate-spin" /> : <IconPlus className="h-3.5 w-3.5" />}
                    加入
                  </span>
                </Button>
              </div>
              {source.summary ? (
                <div
                  className="article-prose prose prose-sm mt-2 max-w-none text-xs leading-5 text-[var(--text-2)] [&_p]:my-0 [&_ul]:my-1"
                  dangerouslySetInnerHTML={{ __html: sourceResultHtmlByKey.get(source.sourceKey)?.summary ?? "" }}
                />
              ) : null}
            </div>
          )) : (
            <div className="rounded-sm bg-[var(--bg-muted)] px-4 py-6 text-sm text-[var(--text-2)]">
              暂无召回结果，换一个更具体的主体、产品名或候选编号。
            </div>
          )}
        </div>
      </ModalShell>

      <ModalShell
        isOpen={newRefinementDialogOpen}
        onClose={() => setNewRefinementDialogOpen(false)}
        title="开启新对话"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setNewRefinementDialogOpen(false)}>
              取消
            </Button>
            <Button variant="primary" onClick={confirmNewRefinementSession}>
              确认开启
            </Button>
          </div>
        }
      >
        <p className="text-sm leading-6 text-[var(--text-2)]">
          新对话会丢弃当前弹窗里的未保存候选稿、临时召回来源和对话记录，但不会修改已经保存的日报正文。
        </p>
      </ModalShell>

      <ModalShell
        isOpen={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        title="确认删除日报"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDeleteDialogOpen(false)} disabled={isPending}>
              取消
            </Button>
            <Button variant="danger" onClick={confirmDelete} disabled={isPending}>
              确认删除
            </Button>
          </div>
        }
      >
        <p className="text-sm leading-6 text-[var(--text-2)]">
          将永久删除“{report.title}”，关联来源引用也会一起删除。此操作不可恢复。
        </p>
      </ModalShell>
    </>
  );
}
