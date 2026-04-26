"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";

import { deleteDailyReport, publishDailyReport, requestDailyReportGeneration, unpublishDailyReport } from "@/components/daily/daily-report.api";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { IconArrowDown, IconEye, IconEyeOff, IconList, IconNote, IconRefresh, IconTrash } from "@/components/ui/icons";
import { ModalShell } from "@/components/ui/modal-shell";
import { DAILY_REPORT_AI_NOTICE } from "@/lib/daily-report/renderer";
import type { DailyReportDetailDTO } from "@/lib/daily-report/types";
import { DAILY_REPORT_SECTION_NAMES } from "@/lib/daily-report/types";
import { renderSafeMarkdown } from "@/lib/markdown/safe-html";
import { cx } from "@/lib/ui/cx";

type DailyReportDetailProps = {
  report: DailyReportDetailDTO;
  isAdmin: boolean;
};

type TocItem = {
  id: string;
  text: string;
  level: number;
};

function statusLabel(status: DailyReportDetailDTO["status"]) {
  if (status === "published") return "已发布";
  if (status === "failed") return "失败";
  return "草稿";
}

function truncateNavTitle(title: string) {
  return title.length > 24 ? `${title.slice(0, 24)}...` : title;
}

function buildFallbackMarkdown(report: DailyReportDetailDTO) {
  const lines: string[] = [`> ${DAILY_REPORT_AI_NOTICE}`, "", "## 摘要", "", report.content.openingSummary, ""];

  for (const sectionName of DAILY_REPORT_SECTION_NAMES) {
    const items = report.content.sections[sectionName];
    if (items.length === 0) continue;

    lines.push(`## ${sectionName}`, "");
    for (const item of items) {
      lines.push(`### ${item.topic}`);
      if ("summary" in item) {
        lines.push(item.summary);
      } else if ("affected" in item) {
        if (item.affected) lines.push(item.affected);
        if (item.action) lines.push(item.action);
      } else if ("keyNumbers" in item) {
        lines.push(`${item.reason}${item.keyNumbers ? `（${item.keyNumbers}）` : ""}`);
      } else if ("action" in item) {
        lines.push(item.action);
      } else {
        lines.push(item.reason);
      }
      if ("whyImportant" in item && item.whyImportant) {
        lines.push("", `**重点：** ${item.whyImportant}`);
      }
      lines.push("");
    }
  }

  lines.push("## 今日观察", "", report.content.closingThought);
  return lines.join("\n").replace(/\n{3,}/g, "\n\n");
}

function buildDetailMarkdown(report: DailyReportDetailDTO) {
  const markdown = report.renderedMarkdown.trim();
  if (!markdown) {
    return buildFallbackMarkdown(report);
  }

  const withoutTitle = markdown.replace(/^#\s+.*(?:\n|$)/, "").trimStart();
  const normalizedHeadings = withoutTitle
    .replace(/^##\s+开场摘要\s*$/m, "## 摘要")
    .replace(/^##\s+收尾观察\s*$/m, "## 今日观察")
    .replace(/^(\s*)风险级别：[^；\n]*(?:；\s*)?/gm, "$1")
    .replace(/^(\s*)(?:\*\*)?(?:摘要|开场摘要|今日观察|收尾观察|受影响|影响对象|建议|建议动作|行动建议)\s*[：:]\s*(?:\*\*)?\s*/gm, "$1")
    .replace(/^重点：\s*/gm, "**重点：** ")
    .replace(/^来源：\s*$/gm, "**来源：**");
  const withNotice = /^>\s*声明：完全使用AI生成，可能存在错误，需谨慎甄别。/m.test(normalizedHeadings)
    ? normalizedHeadings
    : `> ${DAILY_REPORT_AI_NOTICE}\n\n${normalizedHeadings}`;
  if (/^##\s+摘要/m.test(normalizedHeadings)) {
    return withNotice;
  }
  return `> ${DAILY_REPORT_AI_NOTICE}\n\n## 摘要\n\n${normalizedHeadings}`;
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

export function DailyReportDetail({ report, isAdmin }: DailyReportDetailProps) {
  const router = useRouter();
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [activeTocId, setActiveTocId] = useState("top");
  const [tocItems, setTocItems] = useState<TocItem[]>([]);
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
  const detailMarkdown = useMemo(() => buildDetailMarkdown(report), [report]);
  const contentHtml = useMemo(() => renderSafeMarkdown(detailMarkdown, { headingIdPrefix: "daily-heading" }), [detailMarkdown]);

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
            <span>生成：{new Date(report.generatedAt).toLocaleString("zh-CN")}</span>
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
