"use client";

import { useCallback, useState } from "react";

import { GlobalHeader } from "@/components/ui/global-header";
import { ContentReviewPanel } from "@/components/admin/content-review-panel";
import { AdminMonitorPanel } from "@/components/admin/admin-monitor-panel";
import { AdminSettingsPanel } from "@/components/admin/admin-settings-panel";
import { SelectableButton } from "@/components/ui/selectable-button";
import { SectionToggleButton } from "@/components/ui/section-toggle-button";
import {
  IconSettings,
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
} from "@/components/ui/icons";

type PrimaryTab = "monitoring" | "settings";
type MonitorSubSection = "content" | "tasks";
type SettingsSection = "basic" | "blacklist" | "groups" | "sources" | "ai";
type AISubSection = "model-api" | "prompt";

type AdminPageProps = {
  initialSettings: import("@/lib/settings/types").AdminSettingsSnapshot;
  initialSnapshot: import("@/lib/tasks/types").BackgroundTaskMonitorSnapshot;
};

export function AdminPageClient({
  initialSettings,
  initialSnapshot,
}: AdminPageProps) {
  const [primaryTab, setPrimaryTab] = useState<PrimaryTab>("monitoring");
  const [monitoringSubSection, setMonitoringSubSection] =
    useState<MonitorSubSection>("content");
  const [settingsSection, setSettingsSection] = useState<SettingsSection>("basic");
  const [aiSubSection, setAiSubSection] = useState<AISubSection>("model-api");
  const [collapsedSections, setCollapsedSections] = useState<{
    ai: boolean;
  }>({
    ai: true,
  });

  const handleToggleAISection = useCallback(() => {
    const nextCollapsed = !collapsedSections.ai;
    setCollapsedSections((prev) => ({
      ...prev,
      ai: nextCollapsed,
    }));
    if (!nextCollapsed) {
      setSettingsSection("ai");
    }
  }, [collapsedSections.ai]);

  const renderMainContent = () => {
    // Monitoring - Content Review
    if (primaryTab === "monitoring" && monitoringSubSection === "content") {
      return <ContentReviewPanel embedMode />;
    }

    // Monitoring - Tasks
    if (primaryTab === "monitoring" && monitoringSubSection === "tasks") {
      return (
        <AdminMonitorPanel
          initialSnapshot={initialSnapshot}
          embedMode
          showSchedule={false}
        />
      );
    }

    // Settings - Basic (Model API & Prompts combined)
    if (primaryTab === "settings" && settingsSection === "basic") {
      return <AdminSettingsPanel initialSettings={initialSettings} activeSection="basic" embedMode />;
    }

    // Settings - AI Section
    if (primaryTab === "settings" && settingsSection === "ai") {
      if (aiSubSection === "model-api") {
        return <AdminSettingsPanel initialSettings={initialSettings} activeSection="basic" embedMode />;
      }
      if (aiSubSection === "prompt") {
        return <AdminSettingsPanel initialSettings={initialSettings} activeSection="basic" embedMode />;
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

    return null;
  };

  return (
    <>
      <GlobalHeader activeNav="admin" isAdmin={true} />
      <div className="flex-1 bg-[var(--background)]">
        {/* Primary Tabs - pt-6 matches Lumina exactly */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
          <div className="flex gap-1 border-b border-[color:var(--line)]">
            <SelectableButton
              onClick={() => {
                setPrimaryTab("monitoring");
                setMonitoringSubSection("content");
              }}
              active={primaryTab === "monitoring"}
              variant="tab"
            >
              监控
            </SelectableButton>
            <SelectableButton
              onClick={() => {
                setPrimaryTab("settings");
                setSettingsSection("basic");
              }}
              active={primaryTab === "settings"}
              variant="tab"
            >
              设置
            </SelectableButton>
          </div>
        </div>

        {/* Main Content Area - py-6 matches Lumina exactly */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex min-w-0 gap-6">
            {/* Sidebar - w-64 matches Lumina exactly */}
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
                          setMonitoringSubSection("content");
                        }}
                        active={monitoringSubSection === "content"}
                        variant="menu"
                      >
                        <span className="inline-flex items-center gap-2">
                          <IconShield className="h-4 w-4" />
                          <span>内容审核</span>
                        </span>
                      </SelectableButton>
                      <SelectableButton
                        onClick={() => {
                          setMonitoringSubSection("tasks");
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
                      <SelectableButton
                        onClick={() => setSettingsSection("basic")}
                        active={settingsSection === "basic"}
                        variant="menu"
                      >
                        <span className="inline-flex items-center gap-2">
                          <IconSettings className="h-4 w-4" />
                          <span>基础配置</span>
                        </span>
                      </SelectableButton>

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
                              setSettingsSection("ai");
                              setAiSubSection("model-api");
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
                              setSettingsSection("ai");
                              setAiSubSection("prompt");
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
                        onClick={() => setSettingsSection("blacklist")}
                        active={settingsSection === "blacklist"}
                        variant="menu"
                      >
                        <span className="inline-flex items-center gap-2">
                          <IconShield className="h-4 w-4" />
                          <span>黑名单</span>
                        </span>
                      </SelectableButton>

                      <SelectableButton
                        onClick={() => setSettingsSection("groups")}
                        active={settingsSection === "groups"}
                        variant="menu"
                      >
                        <span className="inline-flex items-center gap-2">
                          <IconTag className="h-4 w-4" />
                          <span>分组管理</span>
                        </span>
                      </SelectableButton>

                      <SelectableButton
                        onClick={() => setSettingsSection("sources")}
                        active={settingsSection === "sources"}
                        variant="menu"
                      >
                        <span className="inline-flex items-center gap-2">
                          <IconGlobe className="h-4 w-4" />
                          <span>信息源管理</span>
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
      </div>
    </>
  );
}
