"use client";

import { useCallback, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { GlobalHeader } from "@/components/ui/global-header";
import { AppFooter } from "@/components/ui/app-footer";
import { ContentReviewPanel } from "@/components/admin/content-review-panel";
import { AdminSettingsPanel } from "@/components/admin/admin-settings-panel";
import { TaskMonitorPanel } from "@/components/admin/task-monitor-panel";
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
} from "@/components/ui/icons";

type PrimaryTab = "monitoring" | "settings";
type MonitorSubSection = "content" | "tasks";
type ContentSubSection = "filtered" | "clusters";
type SettingsSection = "blacklist" | "groups" | "sources" | "tasks" | "ai";
type AISubSection = "model-api" | "prompt";

type AdminPageProps = {
  initialSettings: import("@/lib/settings/types").AdminSettingsSnapshot;
  initialSnapshot: import("@/lib/tasks/types").BackgroundTaskMonitorSnapshot;
};

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
  return value === "tasks" ? "tasks" : "content";
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
    monitoringSubSection: "content",
    contentSubSection: "filtered",
    settingsSection,
    aiSubSection: normalizeAISubSection(searchParams.get("view")),
  };
}

export function AdminPageClient({
  initialSettings,
  initialSnapshot,
}: AdminPageProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const routeState = useMemo(() => resolveRouteState(searchParams), [searchParams]);
  const {
    primaryTab,
    monitoringSubSection,
    contentSubSection,
    settingsSection,
    aiSubSection,
  } = routeState;
  const [collapsedSections, setCollapsedSections] = useState<{
    ai: boolean;
    content: boolean;
  }>(() => ({
    ai: !(routeState.primaryTab === "settings" && routeState.settingsSection === "ai"),
    content: !(routeState.primaryTab === "monitoring" && routeState.monitoringSubSection === "content"),
  }));

  const navigateAdmin = useCallback((nextState: Partial<AdminRouteState>) => {
    const resolvedPrimaryTab = nextState.primaryTab ?? primaryTab;
    const params = new URLSearchParams();

    params.set("tab", resolvedPrimaryTab);

    if (resolvedPrimaryTab === "monitoring") {
      const resolvedSection = nextState.monitoringSubSection ?? monitoringSubSection;
      params.set("section", resolvedSection);

      if (resolvedSection === "content") {
        params.set("view", nextState.contentSubSection ?? contentSubSection);
      }
    } else {
      const resolvedSection = nextState.settingsSection ?? settingsSection;
      params.set("section", resolvedSection);

      if (resolvedSection === "ai") {
        params.set("view", nextState.aiSubSection ?? aiSubSection);
      }
    }

    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }, [
    aiSubSection,
    contentSubSection,
    monitoringSubSection,
    pathname,
    primaryTab,
    router,
    settingsSection,
  ]);

  const handleToggleAISection = useCallback(() => {
    const nextCollapsed = !collapsedSections.ai;
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
  }, [collapsedSections.ai, navigateAdmin]);

  const handleToggleContentSection = useCallback(() => {
    const nextCollapsed = !collapsedSections.content;
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
  }, [collapsedSections.content, navigateAdmin]);

  const renderMainContent = () => {
    // Monitoring - Content Review
    if (primaryTab === "monitoring" && monitoringSubSection === "content") {
      return <ContentReviewPanel embedMode activeTab={contentSubSection} />;
    }

    // Monitoring - Tasks
    if (primaryTab === "monitoring" && monitoringSubSection === "tasks") {
      return (
        <TaskMonitorPanel
          runningTasks={initialSnapshot.runningTasks}
          recentTasks={initialSnapshot.recentTasks}
        />
      );
    }

    // Settings - AI Section
    if (primaryTab === "settings" && settingsSection === "ai") {
      if (aiSubSection === "model-api") {
        return (
          <AdminSettingsPanel
            initialSettings={initialSettings}
            activeSection="ai-model-api"
            embedMode
          />
        );
      }
      if (aiSubSection === "prompt") {
        return (
          <AdminSettingsPanel
            initialSettings={initialSettings}
            activeSection="ai-prompt"
            embedMode
          />
        );
      }
    }

    // Settings - Blacklist
    if (primaryTab === "settings" && settingsSection === "blacklist") {
      return <AdminSettingsPanel initialSettings={initialSettings} activeSection="blacklist" embedMode />;
    }

    // Settings - Groups
    if (primaryTab === "settings" && settingsSection === "groups") {
      return <AdminSettingsPanel initialSettings={initialSettings} activeSection="groups" embedMode />;
    }

    // Settings - Sources
    if (primaryTab === "settings" && settingsSection === "sources") {
      return <AdminSettingsPanel initialSettings={initialSettings} activeSection="sources" embedMode />;
    }

    if (primaryTab === "settings" && settingsSection === "tasks") {
      return <AdminSettingsPanel initialSettings={initialSettings} activeSection="tasks" embedMode />;
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
                  monitoringSubSection: "content",
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
                      <SectionToggleButton
                        label="内容审核"
                        active={monitoringSubSection === "content"}
                        expanded={!collapsedSections.content}
                        onMainClick={handleToggleContentSection}
                        onToggle={handleToggleContentSection}
                        toggleAriaLabel={collapsedSections.content ? "展开" : "收起"}
                        icon={<IconShield className="h-4 w-4" />}
                        expandedIndicator={<IconArrowUp className="h-4 w-4" />}
                        collapsedIndicator={<IconArrowDown className="h-4 w-4" />}
                      />

                      {!collapsedSections.content && (
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
                        expanded={!collapsedSections.ai}
                        onMainClick={handleToggleAISection}
                        onToggle={handleToggleAISection}
                        toggleAriaLabel={collapsedSections.ai ? "展开" : "收起"}
                        icon={<IconRobot className="h-4 w-4" />}
                        expandedIndicator={<IconArrowUp className="h-4 w-4" />}
                        collapsedIndicator={<IconArrowDown className="h-4 w-4" />}
                      />

                      {!collapsedSections.ai && (
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
