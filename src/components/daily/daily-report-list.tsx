"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { MouseEvent } from "react";
import { useState, useTransition } from "react";

import {
  deleteDailyReport,
  publishDailyReport,
  requestDailyReportGeneration,
  unpublishDailyReport,
} from "@/components/daily/daily-report.api";
import { Button } from "@/components/ui/button";
import { FilterSelectInline } from "@/components/ui/filter-select-inline";
import { IconButton } from "@/components/ui/icon-button";
import { IconEye, IconEyeOff, IconRefresh, IconTrash } from "@/components/ui/icons";
import { renderInlineMarkdown } from "@/components/ui/inline-markdown";
import { ModalShell } from "@/components/ui/modal-shell";
import type { DailyReportArchiveWeekDTO, DailyReportListItemDTO } from "@/lib/daily-report/types";
import { cx } from "@/lib/ui/cx";

type DailyReportListProps = {
  reports: DailyReportListItemDTO[];
  weeks: DailyReportArchiveWeekDTO[];
  isAdmin: boolean;
  selectedWeek: string | null;
  selectedStatus: string;
};

function getTodayValue() {
  const now = new Date();
  const shanghai = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  return shanghai.toISOString().slice(0, 10);
}

function statusLabel(status: DailyReportListItemDTO["status"]) {
  if (status === "published") return "已发布";
  return "草稿";
}

function statusClass(status: DailyReportListItemDTO["status"]) {
  if (status === "published") return "bg-[var(--success-surface)] text-[var(--success-ink)]";
  return "bg-[var(--bg-muted)] text-[var(--text-2)]";
}

export function DailyReportList({
  reports,
  weeks,
  isAdmin,
  selectedWeek,
  selectedStatus,
}: DailyReportListProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [feedback, setFeedback] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DailyReportListItemDTO | null>(null);
  const [generateDialogOpen, setGenerateDialogOpen] = useState(false);
  const [generateDate, setGenerateDate] = useState(getTodayValue);
  const [isPending, startTransition] = useTransition();
  const totalWeekCount = weeks.reduce((sum, week) => sum + week.count, 0);

  const updateQuery = (next: { week?: string | null; status?: string | null }) => {
    const params = new URLSearchParams(searchParams.toString());
    if (next.week !== undefined) {
      if (next.week) params.set("week", next.week);
      else params.delete("week");
    }
    if (next.status !== undefined) {
      if (next.status && next.status !== "all") params.set("status", next.status);
      else params.delete("status");
    }
    router.push(`/daily${params.toString() ? `?${params.toString()}` : ""}`);
  };

  const openGenerateDialog = () => {
    setGenerateDate(getTodayValue());
    setFeedback(null);
    setGenerateDialogOpen(true);
  };

  const generate = () => {
    if (!generateDate) {
      setFeedback("请选择日报日期。");
      return;
    }

    startTransition(async () => {
      setFeedback(null);
      const result = await requestDailyReportGeneration(generateDate);
      if (!result.ok || result.data.error) {
        setFeedback(result.data.error ?? "日报生成提交失败。");
        return;
      }
      setGenerateDialogOpen(false);
      if (result.data.taskRun?.id) {
        router.push(`/admin?tab=monitoring&section=tasks&task=${encodeURIComponent(result.data.taskRun.id)}`);
        return;
      }
      setFeedback("日报生成任务已提交。");
    });
  };

  const runCardAction = (
    event: MouseEvent<HTMLButtonElement>,
    report: DailyReportListItemDTO,
    action: "togglePublish" | "regenerate",
  ) => {
    event.preventDefault();
    event.stopPropagation();
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
        setFeedback("日报重新生成任务已提交。");
        return;
      }

      const result = report.status === "published"
        ? await unpublishDailyReport(report.date)
        : await publishDailyReport(report.date);

      if (!result.ok || result.data.error) {
        setFeedback(result.data.error ?? "操作失败。");
        return;
      }

      router.refresh();
    });
  };

  const openDeleteDialog = (event: MouseEvent<HTMLButtonElement>, report: DailyReportListItemDTO) => {
    event.preventDefault();
    event.stopPropagation();
    setDeleteTarget(report);
  };

  const confirmDelete = () => {
    if (!deleteTarget) {
      return;
    }

    startTransition(async () => {
      setFeedback(null);
      const result = await deleteDailyReport(deleteTarget.date);
      if (!result.ok || result.data.error) {
        setFeedback(result.data.error ?? "日报删除失败。");
        return;
      }
      setDeleteTarget(null);
      router.refresh();
    });
  };

  return (
    <>
      <div className="flex flex-col gap-6 lg:flex-row">
        <aside className="hidden w-64 flex-shrink-0 lg:block">
          <div className="panel-raised sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto rounded-sm border border-[color:var(--line)] p-4">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-semibold text-[var(--foreground)]">时间筛选</h2>
            </div>
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => updateQuery({ week: null })}
                className={cx(
                  "flex w-full items-center justify-between gap-3 rounded-sm px-3 py-2 text-sm transition",
                  !selectedWeek ? "bg-[var(--accent-soft)] text-[var(--accent-strong)]" : "text-[var(--text-2)] hover:bg-[var(--bg-muted)]",
                )}
              >
                <span>全部周</span>
                <span>{totalWeekCount}</span>
              </button>
              {weeks.map((week) => (
                <button
                  key={week.key}
                  type="button"
                  onClick={() => updateQuery({ week: week.key })}
                  className={cx(
                    "flex w-full items-center justify-between gap-3 rounded-sm px-3 py-2 text-sm transition",
                    selectedWeek === week.key ? "bg-[var(--accent-soft)] text-[var(--accent-strong)]" : "text-[var(--text-2)] hover:bg-[var(--bg-muted)]",
                  )}
                >
                  <span className="whitespace-nowrap">{week.label}</span>
                  <span className="shrink-0">{week.count}</span>
                </button>
              ))}
            </div>
          </div>
        </aside>

        <section className="grid w-full min-w-0 flex-1 gap-4">
          <section className="panel-raised min-h-[110px] w-full rounded-sm border border-[color:var(--line)] p-4 sm:p-6">
            <div className="flex h-full min-h-[62px] w-full items-center justify-between gap-6">
              <div className="min-w-0 flex-1">
                <h1 className="text-xl font-semibold text-[var(--foreground)]">AI 日报</h1>
                <p className="mt-1 text-sm text-[var(--text-2)]">完全使用AI生成每日总结，可能存在错误，需谨慎甄别。</p>
              </div>
              <div className="ml-auto flex shrink-0 items-center justify-end gap-3">
                {isAdmin ? (
                  <>
                    <Button variant="primary" onClick={openGenerateDialog} disabled={isPending}>
                      <span className="inline-flex items-center gap-2">
                        <IconRefresh className="h-4 w-4" />
                        <span>生成日报</span>
                      </span>
                    </Button>
                    <FilterSelectInline
                      label="状态："
                      ariaLabel="日报状态"
                      value={selectedStatus}
                      onChange={(value) => updateQuery({ status: value })}
                      options={[
                        { value: "all", label: "全部" },
                        { value: "published", label: "已发布" },
                        { value: "draft", label: "草稿" },
                      ]}
                      showSearch={false}
                    />
                  </>
                ) : null}
              </div>
            </div>
            {feedback ? <div className="mt-4 rounded-sm bg-[var(--bg-muted)] px-3 py-2 text-sm text-[var(--text-2)]">{feedback}</div> : null}
          </section>

          {reports.length === 0 ? (
            <div className="rounded-[1.15rem] border border-dashed border-[color:var(--line-strong)] bg-[color-mix(in_srgb,var(--surface)_80%,transparent)] px-5 py-8 text-sm leading-7 text-[var(--muted)] shadow-[var(--shadow-sm)]">
              当前时间范围内还没有可展示日报，请稍后再回来看看。
            </div>
          ) : (
            <div className="space-y-3">
              {reports.map((report) => (
                <article
                  key={report.id}
                  className="panel-raised relative rounded-sm border border-[color:var(--line)] p-4 sm:p-5"
                >
                  {isAdmin ? (
                    <div className="absolute right-4 top-4 flex items-center gap-1 sm:right-5 sm:top-5">
                      <IconButton
                        size="sm"
                        title={report.status === "published" ? "撤回为草稿" : "发布日报"}
                        aria-label={report.status === "published" ? "撤回为草稿" : "发布日报"}
                        disabled={isPending}
                        onClick={(event) => runCardAction(event, report, "togglePublish")}
                        className={report.status === "published" ? "text-[var(--accent-strong)]" : ""}
                      >
                        {report.status === "published" ? (
                          <IconEyeOff className="h-4 w-4" />
                        ) : (
                          <IconEye className="h-4 w-4" />
                        )}
                      </IconButton>
                      <IconButton
                        size="sm"
                        title="重新生成"
                        aria-label="重新生成"
                        disabled={isPending}
                        onClick={(event) => runCardAction(event, report, "regenerate")}
                      >
                        <IconRefresh className="h-4 w-4" />
                      </IconButton>
                      <IconButton
                        size="sm"
                        title="删除日报"
                        aria-label="删除日报"
                        disabled={isPending}
                        onClick={(event) => openDeleteDialog(event, report)}
                        className="hover:text-[var(--danger-ink)]"
                      >
                        <IconTrash className="h-4 w-4" />
                      </IconButton>
                    </div>
                  ) : null}
                  <div className="min-w-0">
                    <div className={cx("min-w-0", isAdmin ? "pr-28 sm:pr-32" : "")}>
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-lg font-semibold text-[var(--foreground)]">
                          <Link
                            href={`/daily/${report.date}`}
                            target="_blank"
                            rel="noreferrer"
                            className="transition hover:text-[var(--accent-strong)] hover:underline"
                          >
                            {report.title}
                          </Link>
                        </h2>
                        {isAdmin ? (
                          <span className={cx("rounded-sm px-2 py-0.5 text-xs", statusClass(report.status))}>
                            {statusLabel(report.status)}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <p className="mt-3 line-clamp-5 text-sm leading-6 text-[var(--text-2)]">
                      {renderInlineMarkdown(report.openingSummary || report.errorMessage || "")}
                    </p>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>

      <ModalShell
        isOpen={generateDialogOpen}
        onClose={() => setGenerateDialogOpen(false)}
        title="生成日报"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setGenerateDialogOpen(false)} disabled={isPending}>
              取消
            </Button>
            <Button variant="primary" onClick={generate} disabled={isPending || !generateDate}>
              生成日报
            </Button>
          </div>
        }
      >
        <div className="space-y-2">
          <label className="block text-sm text-[var(--text-2)]" htmlFor="daily-report-generate-date">
            日报日期
          </label>
          <input
            id="daily-report-generate-date"
            type="date"
            value={generateDate}
            max={getTodayValue()}
            onChange={(event) => setGenerateDate(event.target.value)}
            className="min-h-10 w-full rounded-sm border border-[color:var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-1)] outline-none transition focus:border-[color:var(--accent)] focus:ring-2 focus:ring-[color:var(--accent-soft)]"
          />
        </div>
      </ModalShell>

      <ModalShell
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="确认删除日报"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDeleteTarget(null)} disabled={isPending}>
              取消
            </Button>
            <Button variant="danger" onClick={confirmDelete} disabled={isPending}>
              确认删除
            </Button>
          </div>
        }
      >
        <p className="text-sm leading-6 text-[var(--text-2)]">
          将永久删除“{deleteTarget?.title ?? ""}”，关联来源引用也会一起删除。此操作不可恢复。
        </p>
      </ModalShell>
    </>
  );
}
