"use client";
import { type ReactNode, useEffect, useState, useTransition } from "react";

import { AiSettingsPanel } from "@/components/admin/ai-settings-panel";
import { PageShell } from "@/components/ui/page-shell";
import { FilterInput } from "@/components/ui/filter-input";
import { FilterSelect } from "@/components/ui/filter-select";
import { FormField } from "@/components/ui/form-field";
import { TextInput } from "@/components/ui/text-input";
import { useToast } from "@/components/ui/toast";
import type { AdminSettingsSnapshot } from "@/lib/settings/types";
import { cx } from "@/lib/ui/cx";

type AdminSettingsPanelProps = {
  initialSettings: AdminSettingsSnapshot;
  onRefresh?: () => void;
  embedMode?: boolean;
  activeSection?: AdminSettingsSection;
};

type AdminSettingsSection =
  | "ai-model-api"
  | "ai-prompt"
  | "blacklist"
  | "groups"
  | "sources";

const surfaceCardClassName =
  "rounded-[1.1rem] border border-[color:var(--line)] bg-white/96 shadow-[var(--shadow-sm)]";
const subtleCardClassName =
  "rounded-[0.95rem] border border-[color:var(--line)] bg-[var(--surface-muted)]/82 shadow-[var(--shadow-sm)]";
const labelClassName = "text-sm font-medium leading-6 text-[var(--foreground)]";
const helperTextClassName = "text-xs leading-6 text-[var(--muted)]";
const inputClassName =
  "min-h-9 w-full rounded-[0.9rem] border border-[color:var(--line)] bg-white px-3 py-2 text-sm text-[var(--foreground)] shadow-[var(--shadow-sm)] outline-none transition placeholder:text-[var(--muted)] focus:border-[color:var(--line-strong)] focus:ring-2 focus:ring-[color:var(--accent-soft)]";
const textareaClassName = cx(
  inputClassName,
  "min-h-[8rem] resize-y py-3 leading-6",
);
const selectClassName =
  "min-h-9 w-full rounded-[0.9rem] border border-[color:var(--line)] bg-white px-3 py-2 text-sm text-[var(--foreground)] shadow-[var(--shadow-sm)] outline-none transition focus:border-[color:var(--line-strong)] focus:ring-2 focus:ring-[color:var(--accent-soft)]";
const secondaryButtonClassName =
  "inline-flex min-h-9 items-center justify-center rounded-[0.9rem] border border-[color:var(--line)] bg-white px-3 py-2 text-sm font-medium text-[var(--foreground)] shadow-[var(--shadow-sm)] transition hover:border-[color:var(--line-strong)] hover:bg-[var(--surface)] disabled:cursor-not-allowed disabled:opacity-55";
const primaryButtonClassName =
  "inline-flex min-h-9 items-center justify-center rounded-[0.9rem] bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-white shadow-[0_14px_24px_rgba(37,99,235,0.16)] transition hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:bg-[var(--accent)]";
const dangerButtonClassName = cx(
  secondaryButtonClassName,
  "border-[color:var(--danger-line)] bg-[var(--danger-surface)] text-[var(--danger-ink)] hover:bg-[var(--danger-surface)]",
);
const checkboxClassName =
  "inline-flex min-h-9 items-center gap-3 rounded-[0.9rem] border border-[color:var(--line)] bg-white px-3 py-2 text-sm font-medium text-[var(--foreground)] shadow-[var(--shadow-sm)]";
const checkboxInputClassName =
  "h-4 w-4 rounded border-[color:var(--line-strong)] text-[var(--accent)] focus:ring-[color:var(--accent-soft)]";
const settingsNavItems: Array<{
  key: AdminSettingsSection;
  label: string;
}> = [
  { key: "ai-model-api", label: "模型API" },
  { key: "ai-prompt", label: "提示词" },
  { key: "blacklist", label: "黑名单" },
  { key: "groups", label: "分组" },
  { key: "sources", label: "信息源" },
] as const;

function refreshPage() {
  if (typeof window !== "undefined") {
    window.location.reload();
  }
}

export function AdminSettingsPanel({
  initialSettings,
  onRefresh,
  embedMode,
  activeSection: externalActiveSection,
}: AdminSettingsPanelProps) {
  const [isPending, startTransition] = useTransition();
  const { showToast } = useToast();
  const [activeSection, setActiveSection] =
    useState<AdminSettingsSection>(externalActiveSection ?? "ai-model-api");
  const [blacklistText, setBlacklistText] = useState(
    initialSettings.blacklistKeywords.join("\n"),
  );
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

  const submitJson = (
    url: string,
    method: string,
    body: unknown,
    successMessage: string,
    reload = false,
  ) => {
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
          showToast(payload.error ?? "保存失败", "error");
          return;
        }

        showToast(successMessage, "success");

        if (reload) {
          onRefresh?.();

          if (!onRefresh) {
            refreshPage();
          }
        }
      } catch {
        showToast("保存失败", "error");
      }
    });
  };

  useEffect(() => {
    if (externalActiveSection) {
      setActiveSection(externalActiveSection);
    }
  }, [externalActiveSection]);

  const resolveSourceFromRss = () => {
    if (!newSource.rssUrl.trim()) {
      showToast("请先输入 RSS URL。", "error");
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
          showToast(payload.error ?? "RSS 解析失败", "error");
          return;
        }

        const source = payload.source;

        setNewSource((current) => ({
          ...current,
          name: source.name,
          rssUrl: source.rssUrl,
          siteUrl: source.siteUrl,
        }));
        showToast("已根据 RSS 自动填充信息源基本信息。", "success");
      } catch {
        showToast("RSS 解析失败", "error");
      }
    });
  };

  const importOpml = () => {
    if (!opmlFile) {
      showToast("请先选择 OPML 文件。", "error");
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
          showToast(payload.error ?? "OPML 导入失败", "error");
          return;
        }

        showToast(
          `OPML 导入完成：新建 ${payload.summary.createdCount} 个，更新 ${payload.summary.updatedCount} 个，失败 ${payload.summary.failedCount} 个。`,
          "success",
        );
        window.setTimeout(() => {
          onRefresh?.();

          if (!onRefresh) {
            refreshPage();
          }
        }, 600);
      } catch {
        showToast("OPML 导入失败", "error");
      }
    });
  };

  const content = (
    <section aria-label="后台设置工作台" className="space-y-4">
      <section
        aria-labelledby={`settings-tab-${activeSection}`}
        className="space-y-4"
        id={`settings-panel-${activeSection}`}
        role="tabpanel"
      >
        {activeSection === "ai-model-api" ? (
          <AiSettingsPanel initialSettings={initialSettings} mode="model-api" />
        ) : null}

        {activeSection === "ai-prompt" ? (
          <AiSettingsPanel initialSettings={initialSettings} mode="prompt" />
        ) : null}

        {activeSection === "blacklist" ? (
          <SectionCard headingId="settings-blacklist" title="黑名单">
            <label className="space-y-2">
              <span className={labelClassName}>关键词列表（每行一个）</span>
              <textarea
                className={cx(textareaClassName, "min-h-[14rem]")}
                value={blacklistText}
                onChange={(event) => setBlacklistText(event.target.value)}
              />
              <span className={helperTextClassName}>
                保存时会自动去掉空行与首尾空格。
              </span>
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
        ) : null}

        {activeSection === "groups" ? (
          <SectionCard headingId="settings-groups" title="分组">
            <div
              className={cx(subtleCardClassName, "flex flex-col gap-3 p-3")}
            >
              <div className="space-y-1">
                <p className={labelClassName}>新建分组</p>
                <p className={helperTextClassName}>
                  用于批量组织 OPML 导入结果与后续信息源维护。
                </p>
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
                    submitJson(
                      "/api/admin/settings/groups",
                      "POST",
                      { name: newGroupName },
                      "分组已创建。",
                      true,
                    )
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
                  <GroupRow
                    key={group.id}
                    group={group}
                    submitJson={submitJson}
                  />
                ))
              ) : (
                <div className="rounded-[1rem] border border-dashed border-[color:var(--line)] bg-[var(--surface)] px-4 py-4 text-sm leading-6 text-[var(--muted)]">
                  还没有分组，创建后就可以在信息源管理里直接归类。
                </div>
              )}
            </div>
          </SectionCard>
        ) : null}

        {activeSection === "sources" ? (
          <SectionCard headingId="settings-sources" title="信息源管理">
            <section
              role="region"
              aria-label="信息源工作区"
              className="grid gap-0 overflow-hidden rounded-[1rem] border border-[color:var(--line)] bg-[var(--surface-muted)]/72 xl:grid-cols-[minmax(0,0.96fr)_minmax(0,1.04fr)]"
            >
              <section
                role="region"
                aria-label="新建信息源"
                className="space-y-4 p-4"
              >
                <div className="space-y-3 border-b border-[color:var(--line)] pb-4">
                  <div className="space-y-1">
                    <p className={labelClassName}>导入 OPML</p>
                    <p className={helperTextClassName}>
                      支持 `.opml` 与 XML 文件，导入完成后会自动刷新页面。
                    </p>
                  </div>
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <input
                      aria-label="OPML 文件"
                      className={cx(
                        inputClassName,
                        "file:mr-4 file:rounded-[0.9rem] file:border-0 file:bg-[var(--surface)] file:px-3 file:py-2 file:text-sm file:font-medium file:text-[var(--foreground)] sm:flex-1",
                      )}
                      accept=".opml,.xml,text/xml,application/xml"
                      type="file"
                      onChange={(event) =>
                        setOpmlFile(event.target.files?.[0] ?? null)
                      }
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

                <div className="space-y-4">
                  <div className="space-y-1">
                    <p className={labelClassName}>新建信息源</p>
                    <p className={helperTextClassName}>
                      支持先输入 RSS URL 自动填充，再补充分组与抓取策略。
                    </p>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <FilterInput
                      id="new-source-name"
                      label="名称"
                      ariaLabel="名称"
                      value={newSource.name}
                      placeholder="名称"
                      onChange={(value) =>
                        setNewSource((current) => ({
                          ...current,
                          name: value,
                        }))
                      }
                    />

                    <FilterInput
                      id="new-source-rss"
                      label="RSS URL"
                      ariaLabel="RSS URL"
                      value={newSource.rssUrl}
                      placeholder="RSS URL"
                      onChange={(value) =>
                        setNewSource((current) => ({
                          ...current,
                          rssUrl: value,
                        }))
                      }
                    />

                    <FilterInput
                      id="new-source-site"
                      label="站点 URL"
                      ariaLabel="站点 URL"
                      value={newSource.siteUrl}
                      placeholder="站点 URL"
                      onChange={(value) =>
                        setNewSource((current) => ({
                          ...current,
                          siteUrl: value,
                        }))
                      }
                    />

                    <FilterSelect
                      id="new-source-group"
                      label="所属分组"
                      ariaLabel="所属分组"
                      value={newSource.groupId}
                      onChange={(value) =>
                        setNewSource((current) => ({
                          ...current,
                          groupId: value,
                        }))
                      }
                      showSearch={false}
                      options={[
                        { value: "", label: "未分组" },
                        ...initialSettings.groups.map((group) => ({
                          value: group.id,
                          label: group.name,
                        })),
                      ]}
                    />
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <label className={checkboxClassName}>
                      <input
                        checked={newSource.enabled}
                        className={checkboxInputClassName}
                        type="checkbox"
                        onChange={(event) =>
                          setNewSource((current) => ({
                            ...current,
                            enabled: event.target.checked,
                          }))
                        }
                      />
                      启用
                    </label>
                    <label className={checkboxClassName}>
                      <input
                        checked={newSource.fetchFullTextWhenMissing}
                        className={checkboxInputClassName}
                        type="checkbox"
                        onChange={(event) =>
                          setNewSource((current) => ({
                            ...current,
                            fetchFullTextWhenMissing: event.target.checked,
                          }))
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
                      disabled={
                        isPending ||
                        !newSource.name ||
                        !newSource.rssUrl ||
                        !newSource.siteUrl
                      }
                    >
                      创建信息源
                    </button>
                  </div>
                </div>
              </section>

              <section
                role="region"
                aria-label="已有信息源列表"
                className="space-y-3 p-4 xl:border-l xl:border-[color:var(--line)]"
              >
                <div className="space-y-1">
                  <p className={labelClassName}>已有信息源</p>
                  <p className={helperTextClassName}>
                    可直接修改名称、分组、抓取策略，保存接口与删除行为不变。
                  </p>
                </div>

                <div className="space-y-0">
                  {initialSettings.sources.length ? (
                    initialSettings.sources.map((source) => (
                      <SourceRow
                        key={source.id}
                        groups={initialSettings.groups}
                        source={source}
                        submitJson={submitJson}
                      />
                    ))
                  ) : (
                    <div className="rounded-[0.95rem] border border-dashed border-[color:var(--line)] bg-white px-4 py-4 text-sm leading-6 text-[var(--muted)]">
                      还没有信息源。可以通过 RSS 手动创建，或先导入 OPML
                      批量建立。
                    </div>
                  )}
                </div>
              </section>
            </section>
          </SectionCard>
        ) : null}
      </section>
    </section>
  );

  if (embedMode) {
    return content;
  }

  return (
    <PageShell
      header={{ activeNav: null, isAdmin: true }}
      contentClassName="gap-4"
      contentWidth="workspace"
      sidebar={
        <AdminWorkspaceSidebar
          activeSection={activeSection}
          onSelect={setActiveSection}
        />
      }
    >
      {content}
    </PageShell>
  );
}

function AdminWorkspaceSidebar({
  activeSection,
  onSelect,
}: {
  activeSection: AdminSettingsSection;
  onSelect: (section: AdminSettingsSection) => void;
}) {
  return (
    <aside
      aria-label="设置导航"
      className={cx(surfaceCardClassName, "p-3.5 xl:sticky xl:top-24")}
    >
      <div
        aria-label="设置标签"
        className="space-y-1.5"
        role="tablist"
        aria-orientation="vertical"
      >
        {settingsNavItems.map((item) => {
          const isActive = item.key === activeSection;

          return (
            <button
              key={item.key}
              aria-controls={`settings-panel-${item.key}`}
              aria-label={item.label}
              aria-selected={isActive}
              className={cx(
                "flex w-full rounded-[1rem] border px-3 py-3 text-left text-sm font-semibold transition",
                isActive
                  ? "border-[color:var(--line-strong)] bg-[var(--surface-highlight)] shadow-[var(--shadow-sm)]"
                  : "border-transparent bg-transparent hover:border-[color:var(--line)] hover:bg-[var(--surface)]",
              )}
              id={`settings-tab-${item.key}`}
              role="tab"
              type="button"
              onClick={() => onSelect(item.key)}
            >
              <span className="block text-[var(--foreground)]">
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}

function SectionCard({
  title,
  headingId,
  className,
  children,
}: {
  title: string;
  headingId: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={headingId}
      className={cx(surfaceCardClassName, "space-y-3.5 p-3.5", className)}
    >
      <h2
        className="text-[1rem] font-semibold tracking-[-0.03em] text-[var(--foreground)]"
        id={headingId}
      >
        {title}
      </h2>
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
    <div
      className={cx(
        subtleCardClassName,
        "flex flex-col gap-3 p-3 sm:flex-row sm:items-center",
      )}
    >
      <input
        className={cx(inputClassName, "sm:flex-1")}
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
      <div className="flex flex-wrap gap-3">
        <button
          className={secondaryButtonClassName}
          type="button"
          onClick={() =>
            submitJson(
              `/api/admin/settings/groups/${group.id}`,
              "PATCH",
              { name },
              "分组已更新。",
            )
          }
        >
          保存
        </button>
        <button
          className={dangerButtonClassName}
          type="button"
          onClick={() =>
            submitJson(
              `/api/admin/settings/groups/${group.id}`,
              "DELETE",
              {},
              "分组已删除。",
              true,
            )
          }
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
    <div className="border-t border-[color:var(--line)] pt-3">
      <div className="grid gap-3 md:grid-cols-2">
        <FormField label="名称">
          <TextInput
            aria-label="名称"
            className="min-h-9 rounded-[0.9rem] bg-white px-3 py-2 shadow-[var(--shadow-sm)]"
            value={draft.name}
            onChange={(event) =>
              setDraft((current) => ({ ...current, name: event.target.value }))
            }
          />
        </FormField>

        <FormField label="RSS URL">
          <TextInput
            aria-label="RSS URL"
            className="min-h-9 rounded-[0.9rem] bg-white px-3 py-2 shadow-[var(--shadow-sm)]"
            value={draft.rssUrl}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                rssUrl: event.target.value,
              }))
            }
          />
        </FormField>

        <FormField label="站点 URL">
          <TextInput
            aria-label="站点 URL"
            className="min-h-9 rounded-[0.9rem] bg-white px-3 py-2 shadow-[var(--shadow-sm)]"
            value={draft.siteUrl}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                siteUrl: event.target.value,
              }))
            }
          />
        </FormField>

        <FilterSelect
          id={`source-row-group-${source.id}`}
          label="所属分组"
          ariaLabel="所属分组"
          value={draft.groupId}
          onChange={(value) =>
            setDraft((current) => ({
              ...current,
              groupId: value,
            }))
          }
          showSearch={false}
          options={[
            { value: "", label: "未分组" },
            ...groups.map((group) => ({
              value: group.id,
              label: group.name,
            })),
          ]}
        />
      </div>

      <div className="mt-3 flex flex-wrap gap-3">
        <label className={checkboxClassName}>
          <input
            checked={draft.enabled}
            className={checkboxInputClassName}
            type="checkbox"
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                enabled: event.target.checked,
              }))
            }
          />
          启用
        </label>
        <label className={checkboxClassName}>
          <input
            checked={draft.fetchFullTextWhenMissing}
            className={checkboxInputClassName}
            type="checkbox"
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                fetchFullTextWhenMissing: event.target.checked,
              }))
            }
          />
          缺全文时补抓
        </label>
      </div>

      <div className="mt-3 flex flex-wrap gap-3">
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
          onClick={() =>
            submitJson(
              `/api/admin/settings/sources/${source.id}`,
              "DELETE",
              {},
              "信息源已删除。",
              true,
            )
          }
        >
          删除
        </button>
      </div>
    </div>
  );
}
