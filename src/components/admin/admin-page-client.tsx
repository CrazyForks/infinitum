"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

import { GlobalHeader } from "@/components/ui/global-header";
import { AppFooter } from "@/components/ui/app-footer";
import { ContentReviewPanel } from "@/components/admin/content-review-panel";
import { AdminSettingsPanel } from "@/components/admin/admin-settings-panel";
import { TaskMonitorPanel } from "@/components/admin/task-monitor-panel";
import { IngestionDashboard } from "@/components/admin/ingestion-dashboard";
import { SelectableButton } from "@/components/ui/selectable-button";
import { SectionToggleButton } from "@/components/ui/section-toggle-button";
import {
  IconTag,
  IconList,
  IconRobot,
  IconNote,
  IconPlug,
  IconShield,
  IconGlobe,
  IconClock,
  IconArrowUp,
  IconArrowDown,
  IconFilter,
  IconMonitor,
} from "@/components/ui/icons";
import type { AdminSettingsSnapshot, PromptConfigType } from "@/lib/settings/types";

type PrimaryTab = "monitoring" | "settings";
type MonitorSubSection = "dashboard" | "content" | "tasks";
type ContentSubSection = "filtered" | "clusters";
type SettingsSection = "blacklist" | "groups" | "sources" | "tasks" | "ai";
type AISubSection = "model-api" | "prompt";

type AdminPageProps = Record<string, never>;

type AdminRouteState = {
  primaryTab: PrimaryTab;
  monitoringSubSection: MonitorSubSection;
  contentSubSection: ContentSubSection;
  settingsSection: SettingsSection;
  aiSubSection: AISubSection;
};

type AdminSearchParams = {
  get: (key: string) => string | null;
};

function normalizePrimaryTab(value: string | null): PrimaryTab {
  return value === "settings" ? "settings" : "monitoring";
}

function normalizeMonitorSubSection(value: string | null): MonitorSubSection {
  if (value === "content") {
    return "content";
  }

  return value === "tasks" ? "tasks" : "dashboard";
}

function normalizeContentSubSection(value: string | null): ContentSubSection {
  return value === "clusters" ? "clusters" : "filtered";
}

function normalizeSettingsSection(value: string | null): SettingsSection {
  if (value === "blacklist" || value === "groups" || value === "sources" || value === "tasks" || value === "ai") {
    return value;
  }

  return "ai";
}

function normalizeAISubSection(value: string | null): AISubSection {
  return value === "prompt" ? "prompt" : "model-api";
}

function normalizePromptType(value: string | null): PromptConfigType {
  if (
    value === "item_summary" ||
    value === "item_analysis" ||
    value === "cluster_summary" ||
    value === "cluster_match" ||
    value === "cluster_merge" ||
    value === "daily_report_refinement_chat" ||
    value === "daily_report_refinement_generate" ||
    value === "daily_report"
  ) {
    return value;
  }

  return "item_summary";
}

function normalizeTaskId(value: string | null): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function normalizePositiveInteger(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function resolveRouteState(searchParams: AdminSearchParams): AdminRouteState {
  const primaryTab = normalizePrimaryTab(searchParams.get("tab"));

  if (primaryTab === "monitoring") {
    const monitoringSubSection = normalizeMonitorSubSection(searchParams.get("section"));
    return {
      primaryTab,
      monitoringSubSection,
      contentSubSection: normalizeContentSubSection(searchParams.get("view")),
      settingsSection: "ai",
      aiSubSection: "model-api",
    };
  }

  const settingsSection = normalizeSettingsSection(searchParams.get("section"));
  return {
    primaryTab,
    monitoringSubSection: "dashboard",
    contentSubSection: "filtered",
    settingsSection,
    aiSubSection: normalizeAISubSection(searchParams.get("view")),
  };
}

export function AdminPageClient(_props: AdminPageProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Use local state for route so tab navigation doesn't trigger RSC fetch.
  const [routeState, setRouteState] = useState<AdminRouteState>(() =>
    resolveRouteState(searchParams),
  );
  const {
    primaryTab,
    monitoringSubSection,
    contentSubSection,
    settingsSection,
    aiSubSection,
  } = routeState;

  // Fetch settings eagerly so all settings sections have data.
  const [settings, setSettings] = useState<AdminSettingsSnapshot | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/settings")
      .then((r) => r.json())
      .then((data: AdminSettingsSnapshot) => {
        if (!cancelled) setSettings(data);
      })
      .catch(() => { /* settings load failed */ });
    return () => { cancelled = true; };
  }, []);

  // Sync route state on browser back/forward (popstate). We listen to
  // popstate directly rather than depending on useSearchParams to avoid
  // reference-churn re-render loops.
  useEffect(() => {
    const handlePopState = () => {
      const nextSearchParams = new URLSearchParams(window.location.search);
      setRouteState(resolveRouteState(nextSearchParams));
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const focusedTaskId = normalizeTaskId(searchParams.get("task"));
  const taskPage = normalizePositiveInteger(searchParams.get("taskPage"));
  const taskPageSize = normalizePositiveInteger(searchParams.get("taskPageSize"));
  const contentPage = normalizePositiveInteger(searchParams.get("contentPage"));
  const contentPageSize = normalizePositiveInteger(searchParams.get("contentPageSize"));
  const selectedPromptType = normalizePromptType(searchParams.get("promptType"));
  const [collapsedSections, setCollapsedSections] = useState<{
    ai: boolean;
    content: boolean;
  }>(() => ({
    ai: !(routeState.primaryTab === "settings" && routeState.settingsSection === "ai"),
    content: !(routeState.primaryTab === "monitoring" && routeState.monitoringSubSection === "content"),
  }));
  const isAISectionCollapsed =
    primaryTab === "settings" && settingsSection === "ai" ? false : collapsedSections.ai;
  const isContentSectionCollapsed =
    !(primaryTab === "monitoring" && monitoringSubSection === "content");

  const navigateAdmin = useCallback((nextState: Partial<AdminRouteState>) => {
    setRouteState((prev) => ({
      primaryTab: nextState.primaryTab ?? prev.primaryTab,
      monitoringSubSection: nextState.monitoringSubSection ?? prev.monitoringSubSection,
      contentSubSection: nextState.contentSubSection ?? prev.contentSubSection,
      settingsSection: nextState.settingsSection ?? prev.settingsSection,
      aiSubSection: nextState.aiSubSection ?? prev.aiSubSection,
    }));
  }, []);

  // Sync URL to reflect current route state — runs after render, not during
  // the event handler, so Next.js's patched history.replaceState won't
  // trigger a second re-render that causes child re-mounts / double-fetches.
  useEffect(() => {
    const params = new URLSearchParams();
    params.set("tab", routeState.primaryTab);

    if (routeState.primaryTab === "monitoring") {
      params.set("section", routeState.monitoringSubSection);
      if (routeState.monitoringSubSection === "content") {
        params.set("view", routeState.contentSubSection);
      }
    } else {
      params.set("section", routeState.settingsSection);
      if (routeState.settingsSection === "ai") {
        params.set("view", routeState.aiSubSection);
      }
    }

    window.history.replaceState(null, "", `${pathname}?${params.toString()}`);
  }, [routeState, pathname]);

  const navigateTaskDetail = useCallback((taskId: string | null, state?: { page: number; pageSize: number }) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", "monitoring");
    params.set("section", "tasks");
    params.delete("view");

    if (state) {
      params.set("taskPage", String(state.page));
      params.set("taskPageSize", String(state.pageSize));
    }

    if (taskId) {
      params.set("task", taskId);
    } else {
      params.delete("task");
    }
    window.history.replaceState(null, "", `${pathname}?${params.toString()}`);
  }, [pathname, searchParams]);

  const replaceContentPageState = useCallback((state: { page: number; pageSize: number }) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", "monitoring");
    params.set("section", "content");
    params.set("view", contentSubSection);
    params.set("contentPage", String(state.page));
    params.set("contentPageSize", String(state.pageSize));
    window.history.replaceState(null, "", `${pathname}?${params.toString()}`);
  }, [contentSubSection, pathname, searchParams]);

  const navigateTaskFromContent = useCallback((taskId: string, state: { page: number; pageSize: number }) => {
    replaceContentPageState(state);
    window.open(
      `${pathname}?tab=monitoring&section=tasks&task=${encodeURIComponent(taskId)}&taskPage=1&taskPageSize=${taskPageSize ?? 10}`,
      "_blank",
      "noopener,noreferrer",
    );
  }, [pathname, replaceContentPageState, taskPageSize]);

  const handleToggleAISection = useCallback(() => {
    const nextCollapsed = !isAISectionCollapsed;
    setCollapsedSections((prev) => ({
      ...prev,
      ai: nextCollapsed,
    }));
    if (!nextCollapsed) {
      navigateAdmin({
        primaryTab: "settings",
        settingsSection: "ai",
      });
    }
  }, [isAISectionCollapsed, navigateAdmin]);

  const handleToggleContentSection = useCallback(() => {
    const nextCollapsed = !isContentSectionCollapsed;
    setCollapsedSections((prev) => ({
      ...prev,
      content: nextCollapsed,
    }));
    if (!nextCollapsed) {
      navigateAdmin({
        primaryTab: "monitoring",
        monitoringSubSection: "content",
      });
    }
  }, [isContentSectionCollapsed, navigateAdmin]);

  const renderMainContent = () => {
    // Monitoring - Dashboard
    if (primaryTab === "monitoring" && monitoringSubSection === "dashboard") {
      return <IngestionDashboard />;
    }

    // Monitoring - Content Review
    if (primaryTab === "monitoring" && monitoringSubSection === "content") {
      return (
        <ContentReviewPanel
          embedMode
          activeTab={contentSubSection}
          initialPage={contentPage}
          initialPageSize={contentPageSize}
          onPageStateChange={replaceContentPageState}
          onTaskCreated={navigateTaskFromContent}
        />
      );
    }

    // Monitoring - Tasks
    if (primaryTab === "monitoring" && monitoringSubSection === "tasks") {
      return (
        <TaskMonitorPanel
          initialFocusTaskId={focusedTaskId}
          initialPage={taskPage}
          initialPageSize={taskPageSize}
          onDetailRouteChange={navigateTaskDetail}
        />
      );
    }

    // Settings tabs need loaded data; show skeleton while fetching.
    if (primaryTab === "settings" && !settings) {
      return (
        <div className="space-y-6 animate-pulse">
          <div className="h-8 w-48 rounded bg-[var(--bg-muted)]" />
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-[88px] rounded-sm bg-[var(--bg-muted)]" />
            ))}
          </div>
        </div>
      );
    }

    // Settings - AI Section
    if (primaryTab === "settings" && settingsSection === "ai") {
      if (aiSubSection === "model-api") {
        return (
          <AdminSettingsPanel
            initialSettings={settings!}
            activeSection="ai-model-api"
            embedMode
          />
        );
      }
      if (aiSubSection === "prompt") {
        return (
          <AdminSettingsPanel
            initialSettings={settings!}
            activeSection="ai-prompt"
            initialPromptType={selectedPromptType}
            embedMode
          />
        );
      }
    }

    // Settings - Blacklist
    if (primaryTab === "settings" && settingsSection === "blacklist") {
      return <AdminSettingsPanel initialSettings={settings!} activeSection="blacklist" embedMode />;
    }

    // Settings - Groups
    if (primaryTab === "settings" && settingsSection === "groups") {
      return <AdminSettingsPanel initialSettings={settings!} activeSection="groups" embedMode />;
    }

    // Settings - Sources
    if (primaryTab === "settings" && settingsSection === "sources") {
      return <AdminSettingsPanel initialSettings={settings!} activeSection="sources" embedMode />;
    }

    if (primaryTab === "settings" && settingsSection === "tasks") {
      return <AdminSettingsPanel initialSettings={settings!} activeSection="tasks" embedMode />;
    }

    return null;
  };

  return (
    <>
      <GlobalHeader activeNav="admin" isAdmin={true} />
      <div className="flex min-h-screen flex-col bg-[var(--background)]">
        <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 pt-6">
          <div className="flex gap-1 border-b border-[color:var(--line)]">
            <SelectableButton
              onClick={() => {
                navigateAdmin({
                  primaryTab: "monitoring",
                  monitoringSubSection: "dashboard",
                });
              }}
              active={primaryTab === "monitoring"}
              variant="tab"
            >
              监控
            </SelectableButton>
            <SelectableButton
              onClick={() => {
                navigateAdmin({
                  primaryTab: "settings",
                  settingsSection: "ai",
                  aiSubSection: "model-api",
                });
              }}
              active={primaryTab === "settings"}
              variant="tab"
            >
              设置
            </SelectableButton>
          </div>
        </div>

        <div className="max-w-7xl mx-auto w-full flex-1 px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex min-w-0 gap-6">
            <aside className="w-64 flex-shrink-0">
              <div className="bg-[var(--surface)] rounded-lg shadow-[var(--shadow-sm)] border border-[color:var(--line)] p-4">
                <h2 className="font-semibold text-[var(--foreground)] mb-4">
                  {primaryTab === "monitoring" ? "监控模块" : "设置模块"}
                </h2>
                <div className="space-y-2">
                  {primaryTab === "monitoring" ? (
                    <>
                      <SelectableButton
                        onClick={() => {
                          navigateAdmin({
                            primaryTab: "monitoring",
                            monitoringSubSection: "dashboard",
                          });
                        }}
                        active={monitoringSubSection === "dashboard"}
                        variant="menu"
                      >
                        <span className="inline-flex items-center gap-2">
                          <IconMonitor className="h-4 w-4" />
                          <span>数据监控</span>
                        </span>
                      </SelectableButton>

                      <SectionToggleButton
                        label="内容审核"
                        active={monitoringSubSection === "content"}
                        expanded={!isContentSectionCollapsed}
                        onMainClick={handleToggleContentSection}
                        onToggle={handleToggleContentSection}
                        toggleAriaLabel={isContentSectionCollapsed ? "展开" : "收起"}
                        icon={<IconShield className="h-4 w-4" />}
                        expandedIndicator={<IconArrowUp className="h-4 w-4" />}
                        collapsedIndicator={<IconArrowDown className="h-4 w-4" />}
                      />

                      {!isContentSectionCollapsed && (
                        <>
                          <SelectableButton
                            onClick={() => {
                              navigateAdmin({
                                primaryTab: "monitoring",
                                monitoringSubSection: "content",
                                contentSubSection: "filtered",
                              });
                            }}
                            active={
                              monitoringSubSection === "content" &&
                              contentSubSection === "filtered"
                            }
                            variant="submenu"
                          >
                            <span className="inline-flex items-center gap-2">
                              <IconFilter className="h-4 w-4" />
                              <span>过滤内容</span>
                            </span>
                          </SelectableButton>
                          <SelectableButton
                            onClick={() => {
                              navigateAdmin({
                                primaryTab: "monitoring",
                                monitoringSubSection: "content",
                                contentSubSection: "clusters",
                              });
                            }}
                            active={
                              monitoringSubSection === "content" &&
                              contentSubSection === "clusters"
                            }
                            variant="submenu"
                          >
                            <span className="inline-flex items-center gap-2">
                              <IconGlobe className="h-4 w-4" />
                              <span>聚合管理</span>
                            </span>
                          </SelectableButton>
                        </>
                      )}

                      <SelectableButton
                        onClick={() => {
                          navigateAdmin({
                            primaryTab: "monitoring",
                            monitoringSubSection: "tasks",
                          });
                        }}
                        active={monitoringSubSection === "tasks"}
                        variant="menu"
                      >
                        <span className="inline-flex items-center gap-2">
                          <IconList className="h-4 w-4" />
                          <span>任务监控</span>
                        </span>
                      </SelectableButton>
                    </>
                  ) : (
                    <>
                      <SectionToggleButton
                        label="AI配置"
                        active={settingsSection === "ai"}
                        expanded={!isAISectionCollapsed}
                        onMainClick={handleToggleAISection}
                        onToggle={handleToggleAISection}
                        toggleAriaLabel={isAISectionCollapsed ? "展开" : "收起"}
                        icon={<IconRobot className="h-4 w-4" />}
                        expandedIndicator={<IconArrowUp className="h-4 w-4" />}
                        collapsedIndicator={<IconArrowDown className="h-4 w-4" />}
                      />

                      {!isAISectionCollapsed && (
                        <>
                          <SelectableButton
                            onClick={() => {
                              navigateAdmin({
                                primaryTab: "settings",
                                settingsSection: "ai",
                                aiSubSection: "model-api",
                              });
                            }}
                            active={
                              settingsSection === "ai" &&
                              aiSubSection === "model-api"
                            }
                            variant="submenu"
                          >
                            <span className="inline-flex items-center gap-2">
                              <IconPlug className="h-4 w-4" />
                              <span>模型API</span>
                            </span>
                          </SelectableButton>
                          <SelectableButton
                            onClick={() => {
                              navigateAdmin({
                                primaryTab: "settings",
                                settingsSection: "ai",
                                aiSubSection: "prompt",
                              });
                            }}
                            active={
                              settingsSection === "ai" &&
                              aiSubSection === "prompt"
                            }
                            variant="submenu"
                          >
                            <span className="inline-flex items-center gap-2">
                              <IconNote className="h-4 w-4" />
                              <span>提示词</span>
                            </span>
                          </SelectableButton>
                        </>
                      )}

                      <SelectableButton
                        onClick={() =>
                          navigateAdmin({
                            primaryTab: "settings",
                            settingsSection: "blacklist",
                          })
                        }
                        active={settingsSection === "blacklist"}
                        variant="menu"
                      >
                        <span className="inline-flex items-center gap-2">
                          <IconShield className="h-4 w-4" />
                          <span>黑名单</span>
                        </span>
                      </SelectableButton>

                      <SelectableButton
                        onClick={() =>
                          navigateAdmin({
                            primaryTab: "settings",
                            settingsSection: "groups",
                          })
                        }
                        active={settingsSection === "groups"}
                        variant="menu"
                      >
                        <span className="inline-flex items-center gap-2">
                          <IconTag className="h-4 w-4" />
                          <span>分组管理</span>
                        </span>
                      </SelectableButton>

                      <SelectableButton
                        onClick={() =>
                          navigateAdmin({
                            primaryTab: "settings",
                            settingsSection: "sources",
                          })
                        }
                        active={settingsSection === "sources"}
                        variant="menu"
                      >
                        <span className="inline-flex items-center gap-2">
                          <IconGlobe className="h-4 w-4" />
                          <span>信息源管理</span>
                        </span>
                      </SelectableButton>

                      <SelectableButton
                        onClick={() =>
                          navigateAdmin({
                            primaryTab: "settings",
                            settingsSection: "tasks",
                          })
                        }
                        active={settingsSection === "tasks"}
                        variant="menu"
                      >
                        <span className="inline-flex items-center gap-2">
                          <IconClock className="h-4 w-4" />
                          <span>任务配置</span>
                        </span>
                      </SelectableButton>
                    </>
                  )}
                </div>
              </div>
            </aside>

            {/* Main Content - matches Lumina structure */}
            <main className="flex-1 w-full min-w-0">
              <div className="bg-[var(--surface)] rounded-sm shadow-[var(--shadow-sm)] border border-[color:var(--line)] p-6 w-full min-w-0">
                {renderMainContent()}
              </div>
            </main>
          </div>
        </div>
        <AppFooter />
      </div>
    </>
  );
}
