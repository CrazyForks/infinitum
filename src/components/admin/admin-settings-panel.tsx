"use client";
import { type ChangeEvent, useMemo, useRef, useState, useTransition } from "react";

import { AiSettingsPanel } from "@/components/admin/ai-settings-panel";
import { Button } from "@/components/ui/button";
import { PageShell } from "@/components/ui/page-shell";
import { FilterInput } from "@/components/ui/filter-input";
import { FilterSelect } from "@/components/ui/filter-select";
import { FormField } from "@/components/ui/form-field";
import { IconButton } from "@/components/ui/icon-button";
import { IconCheck, IconEdit, IconPlus, IconTag, IconTrash, IconX } from "@/components/ui/icons";
import { ModalShell } from "@/components/ui/modal-shell";
import { TextArea } from "@/components/ui/text-area";
import { TextInput } from "@/components/ui/text-input";
import { useToast } from "@/components/ui/toast";
import type { AdminSettingsSnapshot } from "@/lib/settings/types";
import {
  DEFAULT_SCHEDULE_TIMEZONE,
  MAX_FULL_TEXT_FETCH_THRESHOLD,
  MAX_SOURCE_CONCURRENCY,
  MIN_FULL_TEXT_FETCH_THRESHOLD,
  MIN_SOURCE_CONCURRENCY,
  MAX_PER_SOURCE_ITEM_LIMIT,
  MIN_PER_SOURCE_ITEM_LIMIT,
} from "@/lib/tasks/scheduler";
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
  | "sources"
  | "tasks";

const surfaceCardClassName =
  "rounded-[1.1rem] border border-[color:var(--line)] bg-white/96 shadow-[var(--shadow-sm)]";
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
  { key: "tasks", label: "任务配置" },
] as const;

const groupBadgePalette = [
  "#3b82f6",
  "#14b8a6",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#06b6d4",
  "#22c55e",
  "#f97316",
] as const;

function getStableGroupBadgeColor(groupName: string) {
  const normalized = groupName.trim().toLowerCase();

  if (!normalized) {
    return groupBadgePalette[0];
  }

  let hash = 0;
  for (const char of normalized) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }

  return groupBadgePalette[hash % groupBadgePalette.length];
}

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
  type AdminSource = AdminSettingsSnapshot["sources"][number];
  const [isPending, startTransition] = useTransition();
  const { showToast } = useToast();
  const [internalActiveSection, setInternalActiveSection] =
    useState<AdminSettingsSection>(externalActiveSection ?? "ai-model-api");
  const activeSection = externalActiveSection ?? internalActiveSection;
  const [blacklistText, setBlacklistText] = useState(
    initialSettings.blacklistKeywords.join("\n"),
  );
  const [showCreateGroupComposer, setShowCreateGroupComposer] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const opmlFileInputRef = useRef<HTMLInputElement | null>(null);
  const [sourceModalMode, setSourceModalMode] = useState<"create" | "edit" | null>(null);
  const [editingSourceId, setEditingSourceId] = useState<string | null>(null);
  const [sourceDeleteTarget, setSourceDeleteTarget] = useState<AdminSource | null>(null);
  const [sourceNameFilter, setSourceNameFilter] = useState("");
  const [sourceGroupFilter, setSourceGroupFilter] = useState("");
  const [sourceEnabledFilter, setSourceEnabledFilter] = useState("");
  const [sourcePage, setSourcePage] = useState(1);
  const [sourcePageSize, setSourcePageSize] = useState(10);
  const [sourceForm, setSourceForm] = useState({
    name: "",
    rssUrl: "",
    siteUrl: "",
    enabled: true,
    fetchFullTextWhenMissing: true,
    groupId: "",
  });
  const [taskScheduleEnabled, setTaskScheduleEnabled] = useState(
    initialSettings.taskSchedule.enabled,
  );
  const [taskScheduleCronExpression, setTaskScheduleCronExpression] = useState(
    initialSettings.taskSchedule.cronExpression,
  );
  const [taskScheduleSourceConcurrency, setTaskScheduleSourceConcurrency] =
    useState(String(initialSettings.taskSchedule.sourceConcurrency));
  const [taskScheduleFullTextFetchThreshold, setTaskScheduleFullTextFetchThreshold] =
    useState(String(initialSettings.taskSchedule.fullTextFetchThreshold));
  const [taskSchedulePerSourceItemLimit, setTaskSchedulePerSourceItemLimit] =
    useState(String(initialSettings.taskSchedule.perSourceItemLimit));
  const [taskScheduleSnapshot, setTaskScheduleSnapshot] = useState(
    initialSettings.taskSchedule,
  );
  const normalizedBlacklistKeywords = blacklistText
    .split("\n")
    .map((keyword) => keyword.trim())
    .filter(Boolean);
  const filteredSources = useMemo(() => {
    const keyword = sourceNameFilter.trim().toLowerCase();

    return initialSettings.sources.filter((source) => {
      const matchesName =
        !keyword ||
        source.name.toLowerCase().includes(keyword) ||
        source.rssUrl.toLowerCase().includes(keyword);
      const matchesGroup =
        !sourceGroupFilter ||
        (sourceGroupFilter === "__ungrouped__"
          ? !source.groupId
          : (source.groupId ?? "") === sourceGroupFilter);
      const matchesEnabled =
        !sourceEnabledFilter ||
        (sourceEnabledFilter === "enabled" ? source.enabled : !source.enabled);

      return matchesName && matchesGroup && matchesEnabled;
    });
  }, [initialSettings.sources, sourceEnabledFilter, sourceGroupFilter, sourceNameFilter]);
  const sourceTotalPages = Math.max(1, Math.ceil(filteredSources.length / sourcePageSize));
  const paginatedSources = useMemo(
    () =>
      filteredSources.slice(
        (sourcePage - 1) * sourcePageSize,
        sourcePage * sourcePageSize,
      ),
    [filteredSources, sourcePage, sourcePageSize],
  );

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
          triggerRefresh();
        }
      } catch {
        showToast("保存失败", "error");
      }
    });
  };

  const triggerRefresh = () => {
    onRefresh?.();

    if (!onRefresh) {
      refreshPage();
    }
  };

  const openCreateSourceModal = () => {
    setSourceModalMode("create");
    setEditingSourceId(null);
    setSourceForm({
      name: "",
      rssUrl: "",
      siteUrl: "",
      enabled: true,
      fetchFullTextWhenMissing: true,
      groupId: "",
    });
  };

  const openEditSourceModal = (source: AdminSource) => {
    setSourceModalMode("edit");
    setEditingSourceId(source.id);
    setSourceForm({
      name: source.name,
      rssUrl: source.rssUrl,
      siteUrl: source.siteUrl,
      enabled: source.enabled,
      fetchFullTextWhenMissing: source.fetchFullTextWhenMissing,
      groupId: source.groupId ?? "",
    });
  };

  const resolveSourceFromRss = () => {
    if (!sourceForm.rssUrl.trim()) {
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
            rssUrl: sourceForm.rssUrl.trim(),
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

        setSourceForm((current) => ({
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

  const importOpml = (file: File | null) => {
    if (!file) {
      showToast("请先选择 OPML 文件。", "error");
      return;
    }

    startTransition(async () => {
      try {
        const opmlText = await file.text();
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
        if (opmlFileInputRef.current) {
          opmlFileInputRef.current.value = "";
        }
        window.setTimeout(() => {
          triggerRefresh();
        }, 600);
      } catch {
        showToast("OPML 导入失败", "error");
      }
    });
  };

  const handleSourcePageSizeChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setSourcePageSize(Number(event.target.value));
    setSourcePage(1);
  };

  const handleSaveSource = () => {
    const payload = {
      ...sourceForm,
      groupId: sourceForm.groupId || null,
    };

    if (sourceModalMode === "edit" && editingSourceId) {
      submitJson(
        `/api/admin/settings/sources/${editingSourceId}`,
        "PATCH",
        payload,
        "信息源已更新。",
        true,
      );
      return;
    }

    submitJson(
      "/api/admin/settings/sources",
      "POST",
      payload,
      "信息源已创建。",
      true,
    );
  };

  const handleConfirmDeleteSource = () => {
    if (!sourceDeleteTarget) {
      return;
    }

    submitJson(
      `/api/admin/settings/sources/${sourceDeleteTarget.id}`,
      "DELETE",
      {},
      "信息源已删除。",
      true,
    );
    setSourceDeleteTarget(null);
  };

  const saveTaskSchedule = () => {
    const parsedSourceConcurrency = Number.parseInt(
      taskScheduleSourceConcurrency.trim(),
      10,
    );
    const parsedFullTextFetchThreshold = Number.parseInt(
      taskScheduleFullTextFetchThreshold.trim(),
      10,
    );
    const parsedPerSourceItemLimit = Number.parseInt(
      taskSchedulePerSourceItemLimit.trim(),
      10,
    );

    if (
      !Number.isInteger(parsedSourceConcurrency) ||
      parsedSourceConcurrency < MIN_SOURCE_CONCURRENCY ||
      parsedSourceConcurrency > MAX_SOURCE_CONCURRENCY
    ) {
      showToast(
        `源抓取并发需为 ${MIN_SOURCE_CONCURRENCY}-${MAX_SOURCE_CONCURRENCY} 的整数。`,
        "error",
      );
      return;
    }

    if (
      !Number.isInteger(parsedFullTextFetchThreshold) ||
      parsedFullTextFetchThreshold < MIN_FULL_TEXT_FETCH_THRESHOLD ||
      parsedFullTextFetchThreshold > MAX_FULL_TEXT_FETCH_THRESHOLD
    ) {
      showToast(
        `正文补抓阈值需为 ${MIN_FULL_TEXT_FETCH_THRESHOLD}-${MAX_FULL_TEXT_FETCH_THRESHOLD} 的整数。`,
        "error",
      );
      return;
    }

    if (
      !Number.isInteger(parsedPerSourceItemLimit) ||
      parsedPerSourceItemLimit < MIN_PER_SOURCE_ITEM_LIMIT ||
      parsedPerSourceItemLimit > MAX_PER_SOURCE_ITEM_LIMIT
    ) {
      showToast(
        `每源处理上限需为 ${MIN_PER_SOURCE_ITEM_LIMIT}-${MAX_PER_SOURCE_ITEM_LIMIT} 的整数。`,
        "error",
      );
      return;
    }

    startTransition(async () => {
      try {
        const response = await fetch("/api/admin/monitor/schedule/ingestion-default", {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            enabled: taskScheduleEnabled,
            cronExpression: taskScheduleCronExpression,
            sourceConcurrency: parsedSourceConcurrency,
            fullTextFetchThreshold: parsedFullTextFetchThreshold,
            perSourceItemLimit: parsedPerSourceItemLimit,
          }),
        });
        const payload = (await response.json()) as {
          error?: string;
          schedule?: AdminSettingsSnapshot["taskSchedule"];
        };

        if (!response.ok || payload.error || !payload.schedule) {
          showToast(payload.error ?? "任务配置保存失败。", "error");
          return;
        }

        setTaskScheduleSnapshot(payload.schedule);
        setTaskScheduleEnabled(payload.schedule.enabled);
        setTaskScheduleCronExpression(payload.schedule.cronExpression);
        setTaskScheduleSourceConcurrency(String(payload.schedule.sourceConcurrency));
        setTaskScheduleFullTextFetchThreshold(String(payload.schedule.fullTextFetchThreshold));
        setTaskSchedulePerSourceItemLimit(String(payload.schedule.perSourceItemLimit));
        showToast("任务配置已保存。", "success");
      } catch {
        showToast("任务配置保存失败。", "error");
      }
    });
  };
  const taskScheduleIsDirty =
    taskScheduleEnabled !== taskScheduleSnapshot.enabled ||
    taskScheduleCronExpression.trim() !== taskScheduleSnapshot.cronExpression ||
    taskScheduleSourceConcurrency.trim() !== String(taskScheduleSnapshot.sourceConcurrency) ||
    taskScheduleFullTextFetchThreshold.trim() !== String(taskScheduleSnapshot.fullTextFetchThreshold) ||
    taskSchedulePerSourceItemLimit.trim() !== String(taskScheduleSnapshot.perSourceItemLimit);

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
          <div
            aria-labelledby="settings-blacklist"
            className="w-full min-w-0"
          >
            <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <h2
                  className="text-lg font-semibold text-[var(--text-1)]"
                  id="settings-blacklist"
                >
                  黑名单
                </h2>
                <p className="text-sm text-[var(--text-3)]">
                  配置关键词黑名单过滤规则
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="primary"
                  size="md"
                  onClick={() =>
                    submitJson(
                      "/api/admin/settings/blacklist",
                      "PUT",
                      {
                        keywords: normalizedBlacklistKeywords,
                      },
                      "黑名单已保存。",
                    )
                  }
                  disabled={isPending}
                >
                  保存配置
                </Button>
              </div>
            </div>

            <section aria-label="黑名单关键词编辑区">
              <div className="flex items-center gap-2 mb-1">
                <label
                  className="block text-sm text-[var(--text-2)]"
                  htmlFor="blacklist-keywords-textarea"
                >
                  关键词列表
                </label>
                <div className="relative group">
                  <span className="inline-flex h-5 w-5 cursor-default items-center justify-center rounded-full border border-[color:var(--line)] text-xs text-[var(--text-3)]">
                    ?
                  </span>
                  <div className="pointer-events-none absolute left-1/2 top-full z-10 mt-2 -translate-x-1/2 whitespace-nowrap rounded-sm border border-[color:var(--line)] bg-[var(--surface)] px-2 py-1 text-xs text-[var(--text-2)] shadow-[0_1px_3px_rgba(0,0,0,0.06)] opacity-0 transition group-hover:opacity-100">
                    支持换行分隔，保存时自动去掉空行与首尾空格
                  </div>
                </div>
              </div>

              <TextArea
                id="blacklist-keywords-textarea"
                className="min-h-[112px]"
                rows={4}
                placeholder="每行一个黑名单关键词"
                value={blacklistText}
                onChange={(event) => setBlacklistText(event.target.value)}
              />
            </section>
          </div>
        ) : null}

        {activeSection === "groups" ? (
          <div
            className={cx(
              "w-full min-w-0",
              embedMode
                ? ""
                : "rounded-sm border border-[color:var(--line)] bg-[var(--surface)] p-6 shadow-[0_1px_3px_rgba(0,0,0,0.06)]",
            )}
          >
            <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <h2 className="text-lg font-semibold text-[var(--text-1)]" id="settings-groups">
                  分组列表
                </h2>
                <p className="text-sm text-[var(--text-3)]">
                  用于对信息源进行分类管理，方便后续筛选。
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="primary"
                  size="md"
                  onClick={() => setShowCreateGroupComposer((current) => !current)}
                >
                  + 新增分组
                </Button>
              </div>
            </div>

            {showCreateGroupComposer ? (
              <div className="mb-4 rounded-lg border border-[color:var(--line)] bg-[var(--surface)] px-3 py-3 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded bg-[var(--accent)] text-sm font-bold text-white">
                      <IconPlus className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-[var(--text-1)]">新增分组</div>
                      <div className="text-xs text-[var(--text-2)]">创建后可直接用于信息源归类。</div>
                    </div>
                  </div>

                  <div className="flex flex-1 flex-col gap-3 sm:max-w-xl sm:flex-row sm:items-center sm:justify-end">
                    <TextInput
                      className="sm:flex-1"
                      placeholder="新分组名称"
                      value={newGroupName}
                      onChange={(event) => setNewGroupName(event.target.value)}
                    />
                    <div className="flex gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setShowCreateGroupComposer(false);
                          setNewGroupName("");
                        }}
                      >
                        取消
                      </Button>
                      <Button
                        variant="primary"
                        size="sm"
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
                        创建
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            {initialSettings.groups.length ? (
              <div className="space-y-3">
                {initialSettings.groups.map((group) => (
                  <GroupRow
                    key={group.id}
                    group={group}
                    submitJson={submitJson}
                  />
                ))}
              </div>
            ) : (
              <div className="rounded-sm border border-[color:var(--line)] bg-[var(--bg-muted)] px-4 py-8 text-center text-sm text-[var(--text-3)]">
                <div className="mb-4">暂无分组</div>
                <Button
                  variant="primary"
                  size="md"
                  onClick={() => setShowCreateGroupComposer(true)}
                >
                  新增分组
                </Button>
              </div>
            )}
          </div>
        ) : null}

        {activeSection === "sources" ? (
          <div className="space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <h2 className="text-lg font-semibold text-[var(--foreground)]">
                  信息源管理
                </h2>
                <p className="text-sm text-[var(--muted)]">
                  集中维护 RSS 信息源。
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={opmlFileInputRef}
                  aria-label="OPML 文件"
                  accept=".opml,.xml,text/xml,application/xml"
                  type="file"
                  className="sr-only"
                  onChange={(event) => importOpml(event.target.files?.[0] ?? null)}
                />
                <Button
                  variant="secondary"
                  size="md"
                  onClick={() => opmlFileInputRef.current?.click()}
                  disabled={isPending}
                >
                  导入 OPML
                </Button>
                <Button variant="primary" size="md" onClick={openCreateSourceModal}>
                  新建信息源
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <FilterInput
                id="source-filter-name"
                label="RSS源名称"
                ariaLabel="RSS源名称"
                value={sourceNameFilter}
                placeholder="按名称或 RSS URL 搜索"
                onChange={(value) => {
                  setSourceNameFilter(value);
                  setSourcePage(1);
                }}
              />
              <FilterSelect
                id="source-filter-group"
                label="分组"
                ariaLabel="分组"
                value={sourceGroupFilter}
                onChange={(value) => {
                  setSourceGroupFilter(value);
                  setSourcePage(1);
                }}
                showSearch={false}
                options={[
                  { value: "", label: "全部分组" },
                  { value: "__ungrouped__", label: "未分组" },
                  ...initialSettings.groups.map((group) => ({
                    value: group.id,
                    label: group.name,
                  })),
                ]}
              />
              <FilterSelect
                id="source-filter-enabled"
                label="是否启用"
                ariaLabel="是否启用"
                value={sourceEnabledFilter}
                onChange={(value) => {
                  setSourceEnabledFilter(value);
                  setSourcePage(1);
                }}
                showSearch={false}
                options={[
                  { value: "", label: "全部" },
                  { value: "enabled", label: "已启用" },
                  { value: "disabled", label: "已停用" },
                ]}
              />
            </div>

            {paginatedSources.length === 0 ? (
              <div className="rounded-sm border border-[color:var(--line)] bg-[var(--bg-muted)] px-4 py-8 text-center text-sm text-[var(--muted)]">
                {filteredSources.length === 0 && initialSettings.sources.length > 0
                  ? "暂无匹配信息源"
                  : "暂无信息源"}
              </div>
            ) : (
              <div className="w-full overflow-x-auto">
                <table className="w-full table-auto text-sm">
                  <thead className="bg-[var(--bg-muted)] text-[var(--muted)]">
                    <tr>
                      <th className="w-[28%] px-4 py-3 text-left">RSS 源名称</th>
                      <th className="w-[18%] px-4 py-3 text-left">分组</th>
                      <th className="w-[18%] px-4 py-3 text-left">状态</th>
                      <th className="w-[21%] px-4 py-3 text-left">站点信息</th>
                      <th className="w-[15%] px-4 py-3 text-right">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[color:var(--line)]">
                    {paginatedSources.map((source) => (
                      <tr
                        key={source.id}
                        className="transition-colors hover:bg-[var(--bg-muted)]"
                      >
                        <td className="px-4 py-3">
                          <div className="font-medium text-[var(--foreground)]">
                            {source.name}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-[var(--text-2)]">
                          {source.groupName ?? "未分组"}
                        </td>
                        <td className="px-4 py-3 text-[var(--text-2)]">
                          <div>{source.enabled ? "已启用" : "已停用"}</div>
                          <div className="mt-1 text-xs text-[var(--text-3)]">
                            {source.fetchFullTextWhenMissing ? "缺全文时补抓" : "仅保留 RSS"}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs text-[var(--text-3)]">
                          <a
                            href={source.siteUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="hover:text-[var(--accent)] hover:underline"
                          >
                            {source.siteUrl}
                          </a>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <IconButton
                              variant="secondary"
                              size="sm"
                              title="编辑"
                              onClick={() => openEditSourceModal(source)}
                            >
                              <IconEdit className="h-4 w-4" />
                            </IconButton>
                            <IconButton
                              variant="secondary"
                              size="sm"
                              title="删除"
                              className="text-[var(--danger-ink)] hover:bg-[var(--danger-surface)] hover:text-[var(--danger-ink)]"
                              onClick={() => setSourceDeleteTarget(source)}
                            >
                              <IconTrash className="h-4 w-4" />
                            </IconButton>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {filteredSources.length > 0 ? (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-[var(--muted)]">
                  <span>每页显示</span>
                  <select
                    value={sourcePageSize}
                    onChange={handleSourcePageSizeChange}
                    className="rounded-sm border border-[color:var(--line)] bg-[var(--surface)] px-2 py-1 text-sm"
                  >
                    <option value={10}>10</option>
                    <option value={20}>20</option>
                    <option value={50}>50</option>
                  </select>
                  <span>条，共 {filteredSources.length} 条</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setSourcePage((current) => Math.max(1, current - 1))}
                    disabled={sourcePage === 1}
                  >
                    上一页
                  </Button>
                  <span className="min-w-[100px] rounded-sm border border-[color:var(--line)] bg-[var(--surface)] px-4 py-2 text-center text-sm text-[var(--muted)]">
                    第 {sourcePage} / {sourceTotalPages} 页
                  </span>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() =>
                      setSourcePage((current) => Math.min(sourceTotalPages, current + 1))
                    }
                    disabled={sourcePage >= sourceTotalPages}
                  >
                    下一页
                  </Button>
                </div>
              </div>
            ) : null}

            <ModalShell
              isOpen={Boolean(sourceModalMode)}
              onClose={() => {
                setSourceModalMode(null);
                setEditingSourceId(null);
              }}
              title={sourceModalMode === "edit" ? "编辑信息源" : "新建信息源"}
              widthClassName="max-w-2xl"
              headerClassName="border-b border-[color:var(--line)] p-6"
              bodyClassName="space-y-4 p-6"
              footerClassName="border-t border-[color:var(--line)] bg-[var(--bg-muted)] p-6"
              footer={
                <div className="flex justify-end gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setSourceModalMode(null);
                      setEditingSourceId(null);
                    }}
                  >
                    取消
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={resolveSourceFromRss}
                    disabled={isPending || !sourceForm.rssUrl.trim()}
                  >
                    自动填充
                  </Button>
                  <Button
                    variant="primary"
                    onClick={handleSaveSource}
                    disabled={
                      isPending ||
                      !sourceForm.name.trim() ||
                      !sourceForm.rssUrl.trim() ||
                      !sourceForm.siteUrl.trim()
                    }
                  >
                    {sourceModalMode === "edit" ? "保存" : "创建"}
                  </Button>
                </div>
              }
            >
              <div className="grid gap-4 md:grid-cols-2">
                <FilterInput
                  id="source-form-name"
                  label="名称"
                  ariaLabel="名称"
                  value={sourceForm.name}
                  placeholder="信息源名称"
                  onChange={(value) =>
                    setSourceForm((current) => ({ ...current, name: value }))
                  }
                />
                <FilterInput
                  id="source-form-rss"
                  label="RSS URL"
                  ariaLabel="RSS URL"
                  value={sourceForm.rssUrl}
                  placeholder="https://example.com/feed.xml"
                  onChange={(value) =>
                    setSourceForm((current) => ({ ...current, rssUrl: value }))
                  }
                />
                <FilterInput
                  id="source-form-site"
                  label="站点 URL"
                  ariaLabel="站点 URL"
                  value={sourceForm.siteUrl}
                  placeholder="https://example.com"
                  onChange={(value) =>
                    setSourceForm((current) => ({ ...current, siteUrl: value }))
                  }
                />
                <FilterSelect
                  id="source-form-group"
                  label="所属分组"
                  ariaLabel="所属分组"
                  value={sourceForm.groupId}
                  onChange={(value) =>
                    setSourceForm((current) => ({ ...current, groupId: value }))
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

              <div className="flex items-center gap-4">
                <label className="flex flex-wrap items-center gap-2">
                  <input
                    checked={sourceForm.enabled}
                    className={checkboxInputClassName}
                    type="checkbox"
                    onChange={(event) =>
                      setSourceForm((current) => ({
                        ...current,
                        enabled: event.target.checked,
                      }))
                    }
                  />
                  <span className="text-sm text-[var(--text-2)]">启用此信息源</span>
                </label>
                <label className="flex flex-wrap items-center gap-2">
                  <input
                    checked={sourceForm.fetchFullTextWhenMissing}
                    className={checkboxInputClassName}
                    type="checkbox"
                    onChange={(event) =>
                      setSourceForm((current) => ({
                        ...current,
                        fetchFullTextWhenMissing: event.target.checked,
                      }))
                    }
                  />
                  <span className="text-sm text-[var(--text-2)]">缺全文时补抓</span>
                </label>
              </div>
            </ModalShell>

            <ModalShell
              isOpen={Boolean(sourceDeleteTarget)}
              onClose={() => setSourceDeleteTarget(null)}
              title="确认删除信息源"
              widthClassName="max-w-md"
              bodyClassName="space-y-3 p-6"
              footerClassName="border-t border-[color:var(--line)] bg-[var(--bg-muted)] p-6"
              footer={
                <div className="flex justify-end gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => setSourceDeleteTarget(null)}
                  >
                    取消
                  </Button>
                  <Button
                    variant="primary"
                    onClick={handleConfirmDeleteSource}
                    disabled={isPending}
                  >
                    确认删除
                  </Button>
                </div>
              }
            >
              <p className="text-sm text-[var(--text-2)]">
                将删除信息源
                <span className="font-medium text-[var(--foreground)]">
                  {sourceDeleteTarget ? `「${sourceDeleteTarget.name}」` : ""}
                </span>
                ，该操作不可撤销。
              </p>
            </ModalShell>
          </div>
        ) : null}

        {activeSection === "tasks" ? (
          <div
            className={cx(
              "w-full min-w-0 space-y-6",
              embedMode
                ? ""
                : "rounded-sm border border-[color:var(--line)] bg-[var(--surface)] p-6 shadow-[0_1px_3px_rgba(0,0,0,0.06)]",
            )}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <h2 className="text-lg font-semibold text-[var(--text-1)]">
                  任务配置
                </h2>
                <p className="text-sm text-[var(--text-3)]">
                  配置抓取任务的启用状态、Cron 调度、源抓取并发与正文补抓阈值
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="primary"
                  size="md"
                  onClick={saveTaskSchedule}
                  disabled={isPending || !taskScheduleCronExpression.trim() || !taskScheduleIsDirty}
                >
                  保存配置
                </Button>
              </div>
            </div>

            <div className="space-y-6">
              {/* Row 1: 任务开关 + Cron 表达式 */}
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="space-y-1.5">
                  <div className="block text-sm text-[var(--muted)]">任务开关</div>
                  <label className="flex min-h-10 items-center gap-2 rounded-sm border border-[color:var(--line)] bg-[var(--surface)] px-3 text-sm text-[var(--text-2)]">
                    <input
                      aria-label="启用默认抓取任务"
                      checked={taskScheduleEnabled}
                      className={checkboxInputClassName}
                      type="checkbox"
                      onChange={(event) => setTaskScheduleEnabled(event.target.checked)}
                    />
                    <span>启用默认抓取任务</span>
                  </label>
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="task-schedule-cron"
                    className="block text-sm text-[var(--muted)]"
                  >
                    Cron 表达式
                  </label>
                  <TextInput
                    id="task-schedule-cron"
                    value={taskScheduleCronExpression}
                    onChange={(event) => setTaskScheduleCronExpression(event.target.value)}
                    placeholder="例如 0 * * * *"
                  />
                </div>
              </div>

              {/* Row 2: 源抓取并发 + 正文补抓阈值 + 每源处理上限 */}
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <div className="space-y-1.5">
                  <label
                    htmlFor="task-schedule-source-concurrency"
                    className="block text-sm text-[var(--muted)]"
                  >
                    源抓取并发
                  </label>
                  <TextInput
                    id="task-schedule-source-concurrency"
                    type="number"
                    inputMode="numeric"
                    min={MIN_SOURCE_CONCURRENCY}
                    max={MAX_SOURCE_CONCURRENCY}
                    step={1}
                    value={taskScheduleSourceConcurrency}
                    onChange={(event) => setTaskScheduleSourceConcurrency(event.target.value)}
                    placeholder="例如 2"
                  />
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="task-schedule-full-text-fetch-threshold"
                    className="block text-sm text-[var(--muted)]"
                  >
                    正文补抓阈值
                  </label>
                  <TextInput
                    id="task-schedule-full-text-fetch-threshold"
                    type="number"
                    inputMode="numeric"
                    min={MIN_FULL_TEXT_FETCH_THRESHOLD}
                    max={MAX_FULL_TEXT_FETCH_THRESHOLD}
                    step={1}
                    value={taskScheduleFullTextFetchThreshold}
                    onChange={(event) => setTaskScheduleFullTextFetchThreshold(event.target.value)}
                    placeholder="例如 80"
                  />
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="task-schedule-per-source-item-limit"
                    className="block text-sm text-[var(--muted)]"
                  >
                    每源处理上限
                  </label>
                  <TextInput
                    id="task-schedule-per-source-item-limit"
                    type="number"
                    inputMode="numeric"
                    min={MIN_PER_SOURCE_ITEM_LIMIT}
                    max={MAX_PER_SOURCE_ITEM_LIMIT}
                    step={1}
                    value={taskSchedulePerSourceItemLimit}
                    onChange={(event) => setTaskSchedulePerSourceItemLimit(event.target.value)}
                    placeholder="例如 20"
                  />
                </div>
              </div>

              {taskScheduleSnapshot.timezone !== DEFAULT_SCHEDULE_TIMEZONE ? (
                <FormField label="时区" htmlFor="task-schedule-timezone">
                  <TextInput
                    id="task-schedule-timezone"
                    value={taskScheduleSnapshot.timezone}
                    readOnly
                    disabled
                  />
                </FormField>
              ) : null}
            </div>
          </div>
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
          onSelect={setInternalActiveSection}
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
  const [isEditing, setIsEditing] = useState(false);
  const initial = group.name.charAt(0).toUpperCase();
  const badgeColor = getStableGroupBadgeColor(group.name);

  return (
    <div
      className="rounded-lg border border-[color:var(--line)] bg-[var(--surface)] px-3 py-3 transition hover:shadow-[0_1px_3px_rgba(0,0,0,0.06)]"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div
            className="flex h-8 w-8 items-center justify-center rounded text-sm font-bold text-white"
            style={{ backgroundColor: badgeColor }}
          >
            {initial || <IconTag className="h-4 w-4" />}
          </div>
          <div className="min-w-0">
            {isEditing ? (
              <TextInput
                className="min-w-[12rem]"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            ) : (
              <h3 className="text-sm font-semibold text-[var(--text-1)]">
                {group.name}
              </h3>
            )}
          </div>
        </div>

        <div className="flex gap-1">
          {isEditing ? (
            <>
              <IconButton
                variant="secondary"
                size="sm"
                title="保存"
                onClick={() => {
                  submitJson(
                    `/api/admin/settings/groups/${group.id}`,
                    "PATCH",
                    { name },
                    "分组已更新。",
                  );
                  setIsEditing(false);
                }}
                disabled={!name.trim()}
              >
                <IconCheck className="h-4 w-4" />
              </IconButton>
              <IconButton
                variant="secondary"
                size="sm"
                title="取消"
                onClick={() => {
                  setName(group.name);
                  setIsEditing(false);
                }}
              >
                <IconX className="h-4 w-4" />
              </IconButton>
            </>
          ) : (
            <IconButton
              variant="secondary"
              size="sm"
              title="编辑"
              onClick={() => setIsEditing(true)}
            >
              <IconEdit className="h-4 w-4" />
            </IconButton>
          )}
          <IconButton
            variant="secondary"
            size="sm"
            title="删除"
            className="text-[var(--danger-ink)] hover:bg-[var(--danger-surface)] hover:text-[var(--danger-ink)]"
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
            <IconTrash className="h-4 w-4" />
          </IconButton>
        </div>
      </div>
    </div>
  );
}
