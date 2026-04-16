"use client";

import Link from "next/link";
import { type ReactNode, useState, useTransition } from "react";

import { PageHeader } from "@/components/ui/page-header";
import { PageShell } from "@/components/ui/page-shell";
import { StatusBanner } from "@/components/ui/status-banner";
import type { AdminSettingsSnapshot } from "@/lib/settings/types";
import { cx } from "@/lib/ui/cx";

type AdminSettingsPanelProps = {
  initialSettings: AdminSettingsSnapshot;
};

type FeedbackState =
  | {
      text: string;
      tone: "error" | "success";
    }
  | null;

const surfaceCardClassName =
  "rounded-[1.75rem] border border-[color:var(--line)] bg-white/95 shadow-[var(--shadow-sm)]";
const subtleCardClassName =
  "rounded-[1.5rem] border border-[color:var(--line)] bg-[var(--surface-muted)] shadow-[var(--shadow-sm)]";
const labelClassName = "text-sm font-medium leading-6 text-[var(--foreground)]";
const helperTextClassName = "text-xs leading-6 text-[var(--muted)]";
const inputClassName =
  "min-h-11 w-full rounded-2xl border border-[color:var(--line)] bg-white px-4 py-3 text-sm text-[var(--foreground)] shadow-[var(--shadow-sm)] outline-none transition placeholder:text-[var(--muted)] focus:border-[color:var(--line-strong)] focus:ring-2 focus:ring-[color:var(--accent-soft)]";
const textareaClassName = cx(inputClassName, "min-h-[11rem] resize-y py-4 leading-7");
const selectClassName =
  "min-h-11 w-full rounded-2xl border border-[color:var(--line)] bg-white px-4 py-3 text-sm text-[var(--foreground)] shadow-[var(--shadow-sm)] outline-none transition focus:border-[color:var(--line-strong)] focus:ring-2 focus:ring-[color:var(--accent-soft)]";
const secondaryButtonClassName =
  "inline-flex min-h-11 items-center justify-center rounded-2xl border border-[color:var(--line)] bg-white px-4 py-3 text-sm font-medium text-[var(--foreground)] shadow-[var(--shadow-sm)] transition hover:border-[color:var(--line-strong)] hover:bg-[var(--surface)] disabled:cursor-not-allowed disabled:opacity-55";
const primaryButtonClassName =
  "inline-flex min-h-11 items-center justify-center rounded-2xl bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-white shadow-[0_16px_32px_rgba(37,99,235,0.2)] transition hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:bg-[var(--accent)]";
const navLinkClassName = secondaryButtonClassName;
const dangerButtonClassName = cx(
  secondaryButtonClassName,
  "border-[color:var(--danger-line)] bg-[var(--danger-surface)] text-[var(--danger-ink)] hover:bg-[var(--danger-surface)]",
);
const checkboxClassName =
  "inline-flex min-h-11 items-center gap-3 rounded-2xl border border-[color:var(--line)] bg-white px-4 py-3 text-sm font-medium text-[var(--foreground)] shadow-[var(--shadow-sm)]";
const checkboxInputClassName =
  "h-4 w-4 rounded border-[color:var(--line-strong)] text-[var(--accent)] focus:ring-[color:var(--accent-soft)]";

function refreshPage() {
  if (typeof window !== "undefined") {
    window.location.reload();
  }
}

export function AdminSettingsPanel({ initialSettings }: AdminSettingsPanelProps) {
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [baseUrl, setBaseUrl] = useState(initialSettings.appConfig.modelApi.baseURL);
  const [model, setModel] = useState(initialSettings.appConfig.modelApi.model);
  const [apiKey, setApiKey] = useState("");
  const [apiKeyMode, setApiKeyMode] = useState<"keep" | "replace" | "clear">("keep");
  const [itemConcurrency, setItemConcurrency] = useState(String(initialSettings.appConfig.ingestionItemConcurrency));
  const [itemAnalysisPrompt, setItemAnalysisPrompt] = useState(initialSettings.appConfig.prompts.itemAnalysis);
  const [clusterSummaryPrompt, setClusterSummaryPrompt] = useState(initialSettings.appConfig.prompts.clusterSummary);
  const [clusterMatchPrompt, setClusterMatchPrompt] = useState(initialSettings.appConfig.prompts.clusterMatch);
  const [blacklistText, setBlacklistText] = useState(initialSettings.blacklistKeywords.join("\n"));
  const [newGroupName, setNewGroupName] = useState("");
  const [opmlFile, setOpmlFile] = useState<File | null>(null);
  const [newSource, setNewSource] = useState({
    name: "",
    rssUrl: "",
    siteUrl: "",
    enabled: true,
    fetchFullTextWhenMissing: true,
    groupId: "",
  });

  const groupCount = initialSettings.groups.length;
  const sourceCount = initialSettings.sources.length;
  const activeSourceCount = initialSettings.sources.filter((source) => source.enabled).length;

  const submitJson = (url: string, method: string, body: unknown, successMessage: string, reload = false) => {
    startTransition(async () => {
      try {
        const response = await fetch(url, {
          method,
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify(body),
        });
        const payload = (await response.json()) as { error?: string };

        if (!response.ok || payload.error) {
          setFeedback({ tone: "error", text: payload.error ?? "保存失败" });
          return;
        }

        setFeedback({ tone: "success", text: successMessage });

        if (reload) {
          refreshPage();
        }
      } catch {
        setFeedback({ tone: "error", text: "保存失败" });
      }
    });
  };

  const resolveSourceFromRss = () => {
    if (!newSource.rssUrl.trim()) {
      setFeedback({ tone: "error", text: "请先输入 RSS URL。" });
      return;
    }

    startTransition(async () => {
      try {
        const response = await fetch("/api/admin/settings/sources/resolve", {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            rssUrl: newSource.rssUrl.trim(),
          }),
        });
        const payload = (await response.json()) as {
          source?: {
            name: string;
            rssUrl: string;
            siteUrl: string;
          };
          error?: string;
        };

        if (!response.ok || payload.error || !payload.source) {
          setFeedback({ tone: "error", text: payload.error ?? "RSS 解析失败" });
          return;
        }

        setNewSource((current) => ({
          ...current,
          name: payload.source.name,
          rssUrl: payload.source.rssUrl,
          siteUrl: payload.source.siteUrl,
        }));
        setFeedback({ tone: "success", text: "已根据 RSS 自动填充信息源基本信息。" });
      } catch {
        setFeedback({ tone: "error", text: "RSS 解析失败" });
      }
    });
  };

  const importOpml = () => {
    if (!opmlFile) {
      setFeedback({ tone: "error", text: "请先选择 OPML 文件。" });
      return;
    }

    startTransition(async () => {
      try {
        const opmlText = await opmlFile.text();
        const response = await fetch("/api/admin/settings/sources/import", {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({ opmlText }),
        });
        const payload = (await response.json()) as {
          summary?: {
            createdCount: number;
            updatedCount: number;
            failedCount: number;
          };
          error?: string;
        };

        if (!response.ok || payload.error || !payload.summary) {
          setFeedback({ tone: "error", text: payload.error ?? "OPML 导入失败" });
          return;
        }

        setFeedback({
          tone: "success",
          text: `OPML 导入完成：新建 ${payload.summary.createdCount} 个，更新 ${payload.summary.updatedCount} 个，失败 ${payload.summary.failedCount} 个。`,
        });
        window.setTimeout(() => {
          refreshPage();
        }, 600);
      } catch {
        setFeedback({ tone: "error", text: "OPML 导入失败" });
      }
    });
  };

  return (
    <PageShell contentClassName="gap-6">
      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_320px]">
        <div className="space-y-6">
          <PageHeader
            eyebrow="Settings"
            title="后台设置"
            description="将基础模型参数、黑名单、分组与信息源维护收拢到统一后台壳层里，所有修改都会直接写入数据库并影响后续抓取与重生成流程。"
          />

          <div className="grid gap-4 md:grid-cols-3">
            <article className={cx(subtleCardClassName, "p-5")}>
              <p className="font-mono text-[11px] font-medium uppercase tracking-[0.24em] text-[var(--muted)]">
                Groups
              </p>
              <p className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-[var(--foreground)]">{groupCount}</p>
              <p className="mt-2 text-sm leading-6 text-[var(--muted)]">当前已创建分组数量，用于组织信息源与导入归属。</p>
            </article>

            <article className={cx(subtleCardClassName, "p-5")}>
              <p className="font-mono text-[11px] font-medium uppercase tracking-[0.24em] text-[var(--muted)]">
                Sources
              </p>
              <p className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-[var(--foreground)]">{sourceCount}</p>
              <p className="mt-2 text-sm leading-6 text-[var(--muted)]">已登记信息源总数，保留编辑、导入、删除与 RSS 自动填充流程。</p>
            </article>

            <article className={cx(subtleCardClassName, "p-5")}>
              <p className="font-mono text-[11px] font-medium uppercase tracking-[0.24em] text-[var(--muted)]">
                Live Sources
              </p>
              <p className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-[var(--foreground)]">
                {activeSourceCount}
              </p>
              <p className="mt-2 text-sm leading-6 text-[var(--muted)]">启用中的来源会继续参与抓取，停用状态仍可在此页随时恢复。</p>
            </article>
          </div>
        </div>

        <aside className={cx(surfaceCardClassName, "flex flex-col gap-5 p-6")}>
          <div>
            <p className="font-mono text-[11px] font-medium uppercase tracking-[0.24em] text-[var(--accent-strong)]">
              Console Routes
            </p>
            <h2 className="mt-3 text-xl font-semibold tracking-[-0.03em] text-[var(--foreground)]">后台快捷入口</h2>
            <p className="mt-3 text-sm leading-7 text-[var(--muted)]">
              导航入口和退出登录行为保持不变，方便在设置、内容审核与任务监控之间快速切换。
            </p>
          </div>

          <div className="grid gap-3">
            <Link className={navLinkClassName} href="/">
              返回首页
            </Link>
            <Link className={navLinkClassName} href="/admin/content">
              内容审核
            </Link>
            <Link className={navLinkClassName} href="/admin/monitor">
              任务监控
            </Link>
            <button
              className={secondaryButtonClassName}
              type="button"
              onClick={() => submitJson("/api/admin/logout", "POST", {}, "已退出登录，即将返回登录页。")}
            >
              退出登录
            </button>
          </div>

          <div className="rounded-[1.5rem] border border-dashed border-[color:var(--line)] bg-[var(--surface)] p-4 text-sm leading-7 text-[var(--muted)]">
            长文本提示词区域已调整为更易阅读的表单卡片，信息源管理也保留 OPML 导入、RSS 自动填充与已有条目的原地编辑。
          </div>
        </aside>
      </section>

      {feedback ? (
        <StatusBanner className="rounded-[1.75rem] px-5 py-4" tone={feedback.tone}>
          {feedback.text}
        </StatusBanner>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
        <SectionCard
          className="xl:row-span-2"
          description="维护模型连接、并发参数与三类分析提示词。保存接口与 payload 保持不变。"
          headingId="settings-basic"
          title="基础配置"
        >
          <div className="grid gap-5 md:grid-cols-2">
            <label className="space-y-2">
              <span className={labelClassName}>模型 API Base URL</span>
              <input className={inputClassName} value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} />
            </label>

            <label className="space-y-2">
              <span className={labelClassName}>模型名</span>
              <input className={inputClassName} value={model} onChange={(event) => setModel(event.target.value)} />
            </label>

            <label className="space-y-2">
              <span className={labelClassName}>并发数</span>
              <input
                aria-label="并发数"
                className={inputClassName}
                max={10}
                min={1}
                type="number"
                value={itemConcurrency}
                onChange={(event) => setItemConcurrency(event.target.value)}
              />
            </label>

            <label className="space-y-2">
              <span className={labelClassName}>API Key</span>
              <input
                className={inputClassName}
                placeholder={initialSettings.appConfig.modelApi.apiKeyMasked || "留空保持不变"}
                value={apiKey}
                onChange={(event) => {
                  setApiKey(event.target.value);
                  setApiKeyMode(event.target.value ? "replace" : "keep");
                }}
              />
              <span className={helperTextClassName}>当前显示为掩码占位；留空会保持现有值不变。</span>
            </label>

            <label className="space-y-2 md:col-span-2">
              <span className={labelClassName}>内容分析提示词</span>
              <textarea
                aria-label="内容分析提示词"
                className={textareaClassName}
                value={itemAnalysisPrompt}
                onChange={(event) => setItemAnalysisPrompt(event.target.value)}
              />
              <span className={helperTextClassName}>用于单条内容的分析与过滤判断，建议保留明确输出格式与判定标准。</span>
            </label>

            <label className="space-y-2 md:col-span-2">
              <span className={labelClassName}>聚合摘要提示词</span>
              <textarea
                aria-label="聚合摘要提示词"
                className={textareaClassName}
                value={clusterSummaryPrompt}
                onChange={(event) => setClusterSummaryPrompt(event.target.value)}
              />
              <span className={helperTextClassName}>用于聚合后的摘要生成，可在这里调整摘要风格、长度和重点字段。</span>
            </label>

            <label className="space-y-2 md:col-span-2">
              <span className={labelClassName}>归组判定提示词</span>
              <textarea
                aria-label="归组判定提示词"
                className={textareaClassName}
                value={clusterMatchPrompt}
                onChange={(event) => setClusterMatchPrompt(event.target.value)}
              />
              <span className={helperTextClassName}>用于判断内容是否应并入已有聚合组，建议保持条件明确，避免误并。</span>
            </label>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              className={secondaryButtonClassName}
              type="button"
              onClick={() => {
                setApiKey("");
                setApiKeyMode("clear");
              }}
            >
              清空 API Key
            </button>
            <button
              className={primaryButtonClassName}
              type="button"
              onClick={() =>
                submitJson(
                  "/api/admin/settings/app-config",
                  "PUT",
                  {
                    ingestionItemConcurrency: Number(itemConcurrency),
                    modelApiBaseUrl: baseUrl,
                    modelApiModel: model,
                    modelApiKey: apiKey,
                    apiKeyMode,
                    itemAnalysisPrompt,
                    clusterSummaryPrompt,
                    clusterMatchPrompt,
                  },
                  "基础配置已保存。",
                )
              }
              disabled={isPending}
            >
              保存基础配置
            </button>
          </div>
        </SectionCard>

        <SectionCard
          description="以每行一个关键词的方式维护规则黑名单，保存逻辑保持不变。"
          headingId="settings-blacklist"
          title="黑名单"
        >
          <label className="space-y-2">
            <span className={labelClassName}>关键词列表（每行一个）</span>
            <textarea
              className={cx(textareaClassName, "min-h-[14rem]")}
              value={blacklistText}
              onChange={(event) => setBlacklistText(event.target.value)}
            />
            <span className={helperTextClassName}>保存时会自动去掉空行与首尾空格。</span>
          </label>

          <div className="flex flex-wrap gap-3">
            <button
              className={primaryButtonClassName}
              type="button"
              onClick={() =>
                submitJson(
                  "/api/admin/settings/blacklist",
                  "PUT",
                  {
                    keywords: blacklistText
                      .split("\n")
                      .map((keyword) => keyword.trim())
                      .filter(Boolean),
                  },
                  "黑名单已保存。",
                )
              }
              disabled={isPending}
            >
              保存黑名单
            </button>
          </div>
        </SectionCard>

        <SectionCard
          description="创建、重命名或删除分组，已有接口路径与刷新行为保持一致。"
          headingId="settings-groups"
          title="分组管理"
        >
          <div className={cx(subtleCardClassName, "flex flex-col gap-3 p-4")}>
            <div className="space-y-1">
              <p className={labelClassName}>新建分组</p>
              <p className={helperTextClassName}>用于批量组织 OPML 导入结果与后续信息源维护。</p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                className={cx(inputClassName, "sm:flex-1")}
                placeholder="新分组名称"
                value={newGroupName}
                onChange={(event) => setNewGroupName(event.target.value)}
              />
              <button
                className={primaryButtonClassName}
                type="button"
                onClick={() =>
                  submitJson("/api/admin/settings/groups", "POST", { name: newGroupName }, "分组已创建。", true)
                }
                disabled={isPending || !newGroupName.trim()}
              >
                创建分组
              </button>
            </div>
          </div>

          <div className="space-y-3">
            {initialSettings.groups.length ? (
              initialSettings.groups.map((group) => (
                <GroupRow key={group.id} group={group} submitJson={submitJson} />
              ))
            ) : (
              <div className="rounded-[1.5rem] border border-dashed border-[color:var(--line)] bg-[var(--surface)] px-4 py-5 text-sm leading-7 text-[var(--muted)]">
                还没有分组，创建后就可以在信息源管理里直接归类。
              </div>
            )}
          </div>
        </SectionCard>

        <SectionCard
          className="xl:col-span-2"
          description="保留 OPML 导入、RSS 自动填充、创建信息源与已有信息源编辑能力。"
          headingId="settings-sources"
          title="信息源管理"
        >
          <div className="grid gap-5 xl:grid-cols-[minmax(0,0.96fr)_minmax(0,1.04fr)]">
            <div className="space-y-5">
              <div className={cx(subtleCardClassName, "space-y-4 p-5")}>
                <div className="space-y-1">
                  <p className={labelClassName}>导入 OPML</p>
                  <p className={helperTextClassName}>支持 `.opml` 与 XML 文件，导入完成后会自动刷新页面。</p>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <input
                    aria-label="OPML 文件"
                    className={cx(inputClassName, "file:mr-4 file:rounded-xl file:border-0 file:bg-[var(--surface)] file:px-3 file:py-2 file:text-sm file:font-medium file:text-[var(--foreground)] sm:flex-1")}
                    accept=".opml,.xml,text/xml,application/xml"
                    type="file"
                    onChange={(event) => setOpmlFile(event.target.files?.[0] ?? null)}
                  />
                  <button
                    className={secondaryButtonClassName}
                    type="button"
                    onClick={importOpml}
                    disabled={isPending || !opmlFile}
                  >
                    导入 OPML
                  </button>
                </div>
              </div>

              <div className={cx(subtleCardClassName, "space-y-5 p-5")}>
                <div className="space-y-1">
                  <p className={labelClassName}>新建信息源</p>
                  <p className={helperTextClassName}>支持先输入 RSS URL 自动填充，再补充分组与抓取策略。</p>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <label className="space-y-2">
                    <span className={labelClassName}>名称</span>
                    <input
                      aria-label="名称"
                      className={inputClassName}
                      placeholder="名称"
                      value={newSource.name}
                      onChange={(event) => setNewSource((current) => ({ ...current, name: event.target.value }))}
                    />
                  </label>

                  <label className="space-y-2">
                    <span className={labelClassName}>RSS URL</span>
                    <input
                      aria-label="RSS URL"
                      className={inputClassName}
                      placeholder="RSS URL"
                      value={newSource.rssUrl}
                      onChange={(event) => setNewSource((current) => ({ ...current, rssUrl: event.target.value }))}
                    />
                  </label>

                  <label className="space-y-2">
                    <span className={labelClassName}>站点 URL</span>
                    <input
                      aria-label="站点 URL"
                      className={inputClassName}
                      placeholder="站点 URL"
                      value={newSource.siteUrl}
                      onChange={(event) => setNewSource((current) => ({ ...current, siteUrl: event.target.value }))}
                    />
                  </label>

                  <label className="space-y-2">
                    <span className={labelClassName}>所属分组</span>
                    <select
                      aria-label="所属分组"
                      className={selectClassName}
                      value={newSource.groupId}
                      onChange={(event) => setNewSource((current) => ({ ...current, groupId: event.target.value }))}
                    >
                      <option value="">未分组</option>
                      {initialSettings.groups.map((group) => (
                        <option key={group.id} value={group.id}>
                          {group.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="flex flex-wrap gap-3">
                  <label className={checkboxClassName}>
                    <input
                      checked={newSource.enabled}
                      className={checkboxInputClassName}
                      type="checkbox"
                      onChange={(event) => setNewSource((current) => ({ ...current, enabled: event.target.checked }))}
                    />
                    启用
                  </label>
                  <label className={checkboxClassName}>
                    <input
                      checked={newSource.fetchFullTextWhenMissing}
                      className={checkboxInputClassName}
                      type="checkbox"
                      onChange={(event) =>
                        setNewSource((current) => ({ ...current, fetchFullTextWhenMissing: event.target.checked }))
                      }
                    />
                    缺全文时补抓
                  </label>
                </div>

                <div className="flex flex-wrap gap-3">
                  <button
                    className={secondaryButtonClassName}
                    type="button"
                    onClick={resolveSourceFromRss}
                    disabled={isPending || !newSource.rssUrl.trim()}
                  >
                    根据 RSS 自动填充
                  </button>
                  <button
                    className={primaryButtonClassName}
                    type="button"
                    onClick={() =>
                      submitJson(
                        "/api/admin/settings/sources",
                        "POST",
                        {
                          ...newSource,
                          groupId: newSource.groupId || null,
                        },
                        "信息源已创建。",
                        true,
                      )
                    }
                    disabled={isPending || !newSource.name || !newSource.rssUrl || !newSource.siteUrl}
                  >
                    创建信息源
                  </button>
                </div>
              </div>
            </div>

            <div className={cx(subtleCardClassName, "space-y-4 p-5")}>
              <div className="space-y-1">
                <p className={labelClassName}>已有信息源</p>
                <p className={helperTextClassName}>可直接修改名称、分组、抓取策略，保存接口与删除行为不变。</p>
              </div>

              <div className="space-y-3">
                {initialSettings.sources.length ? (
                  initialSettings.sources.map((source) => (
                    <SourceRow key={source.id} groups={initialSettings.groups} source={source} submitJson={submitJson} />
                  ))
                ) : (
                  <div className="rounded-[1.5rem] border border-dashed border-[color:var(--line)] bg-white px-4 py-5 text-sm leading-7 text-[var(--muted)]">
                    还没有信息源。可以通过 RSS 手动创建，或先导入 OPML 批量建立。
                  </div>
                )}
              </div>
            </div>
          </div>
        </SectionCard>
      </div>
    </PageShell>
  );
}

function SectionCard({
  title,
  headingId,
  description,
  className,
  children,
}: {
  title: string;
  headingId: string;
  description: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={headingId} className={cx(surfaceCardClassName, "space-y-6 p-6", className)}>
      <div className="space-y-2">
        <h2 className="text-xl font-semibold tracking-[-0.03em] text-[var(--foreground)]" id={headingId}>
          {title}
        </h2>
        <p className="max-w-3xl text-sm leading-7 text-[var(--muted)]">{description}</p>
      </div>
      {children}
    </section>
  );
}

function GroupRow({
  group,
  submitJson,
}: {
  group: AdminSettingsSnapshot["groups"][number];
  submitJson: (
    url: string,
    method: string,
    body: unknown,
    successMessage: string,
    reload?: boolean,
  ) => void;
}) {
  const [name, setName] = useState(group.name);

  return (
    <div className={cx(subtleCardClassName, "flex flex-col gap-4 p-4 sm:flex-row sm:items-center")}>
      <input className={cx(inputClassName, "sm:flex-1")} value={name} onChange={(event) => setName(event.target.value)} />
      <div className="flex flex-wrap gap-3">
        <button
          className={secondaryButtonClassName}
          type="button"
          onClick={() => submitJson(`/api/admin/settings/groups/${group.id}`, "PATCH", { name }, "分组已更新。")}
        >
          保存
        </button>
        <button
          className={dangerButtonClassName}
          type="button"
          onClick={() => submitJson(`/api/admin/settings/groups/${group.id}`, "DELETE", {}, "分组已删除。", true)}
        >
          删除
        </button>
      </div>
    </div>
  );
}

function SourceRow({
  source,
  groups,
  submitJson,
}: {
  source: AdminSettingsSnapshot["sources"][number];
  groups: AdminSettingsSnapshot["groups"];
  submitJson: (
    url: string,
    method: string,
    body: unknown,
    successMessage: string,
    reload?: boolean,
  ) => void;
}) {
  const [draft, setDraft] = useState({
    name: source.name,
    rssUrl: source.rssUrl,
    siteUrl: source.siteUrl,
    enabled: source.enabled,
    fetchFullTextWhenMissing: source.fetchFullTextWhenMissing,
    groupId: source.groupId ?? "",
  });

  return (
    <div className="rounded-[1.5rem] border border-[color:var(--line)] bg-white p-4 shadow-[var(--shadow-sm)]">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-2">
          <span className={labelClassName}>名称</span>
          <input
            className={inputClassName}
            value={draft.name}
            onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
          />
        </label>

        <label className="space-y-2">
          <span className={labelClassName}>RSS URL</span>
          <input
            className={inputClassName}
            value={draft.rssUrl}
            onChange={(event) => setDraft((current) => ({ ...current, rssUrl: event.target.value }))}
          />
        </label>

        <label className="space-y-2">
          <span className={labelClassName}>站点 URL</span>
          <input
            className={inputClassName}
            value={draft.siteUrl}
            onChange={(event) => setDraft((current) => ({ ...current, siteUrl: event.target.value }))}
          />
        </label>

        <label className="space-y-2">
          <span className={labelClassName}>所属分组</span>
          <select
            className={selectClassName}
            value={draft.groupId}
            onChange={(event) => setDraft((current) => ({ ...current, groupId: event.target.value }))}
          >
            <option value="">未分组</option>
            {groups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <label className={checkboxClassName}>
          <input
            checked={draft.enabled}
            className={checkboxInputClassName}
            type="checkbox"
            onChange={(event) => setDraft((current) => ({ ...current, enabled: event.target.checked }))}
          />
          启用
        </label>
        <label className={checkboxClassName}>
          <input
            checked={draft.fetchFullTextWhenMissing}
            className={checkboxInputClassName}
            type="checkbox"
            onChange={(event) =>
              setDraft((current) => ({ ...current, fetchFullTextWhenMissing: event.target.checked }))
            }
          />
          缺全文时补抓
        </label>
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <button
          className={secondaryButtonClassName}
          type="button"
          onClick={() =>
            submitJson(
              `/api/admin/settings/sources/${source.id}`,
              "PATCH",
              {
                ...draft,
                groupId: draft.groupId || null,
              },
              "信息源已更新。",
            )
          }
        >
          保存
        </button>
        <button
          className={dangerButtonClassName}
          type="button"
          onClick={() => submitJson(`/api/admin/settings/sources/${source.id}`, "DELETE", {}, "信息源已删除。", true)}
        >
          删除
        </button>
      </div>
    </div>
  );
}
