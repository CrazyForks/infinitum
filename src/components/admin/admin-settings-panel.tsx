"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import styles from "@/components/admin/admin.module.css";
import type { AdminSettingsSnapshot } from "@/lib/settings/types";

type AdminSettingsPanelProps = {
  initialSettings: AdminSettingsSnapshot;
};

function refreshPage() {
  if (typeof window !== "undefined") {
    window.location.reload();
  }
}

export function AdminSettingsPanel({ initialSettings }: AdminSettingsPanelProps) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
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

  const submitJson = (url: string, method: string, body: unknown, successMessage: string, reload = false) => {
    startTransition(async () => {
      const response = await fetch(url, {
        method,
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok || payload.error) {
        setMessage(payload.error ?? "保存失败");
        return;
      }

      setMessage(successMessage);

      if (reload) {
        refreshPage();
      }
    });
  };

  const resolveSourceFromRss = () => {
    if (!newSource.rssUrl.trim()) {
      setMessage("请先输入 RSS URL。");
      return;
    }

    startTransition(async () => {
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
        setMessage(payload.error ?? "RSS 解析失败");
        return;
      }

      setNewSource((current) => ({
        ...current,
        name: payload.source!.name,
        siteUrl: payload.source!.siteUrl,
      }));
      setMessage("已根据 RSS 自动填充信息源基本信息。");
    });
  };

  const importOpml = () => {
    if (!opmlFile) {
      setMessage("请先选择 OPML 文件。");
      return;
    }

    startTransition(async () => {
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
        setMessage(payload.error ?? "OPML 导入失败");
        return;
      }

      setMessage(
        `OPML 导入完成：新建 ${payload.summary.createdCount} 个，更新 ${payload.summary.updatedCount} 个，失败 ${payload.summary.failedCount} 个。`,
      );
      window.setTimeout(() => {
        refreshPage();
      }, 600);
    });
  };

  return (
    <div className={styles.settingsShell}>
      <div className={styles.toolbar}>
        <div>
          <div className={styles.kicker}>Settings</div>
          <h1 className={styles.title}>后台配置</h1>
          <p className={styles.description}>这里的所有修改都会直接写入数据库，并用于后续抓取与重生成流程。</p>
        </div>
        <div className={styles.toolbarActions}>
          <Link className={styles.linkButton} href="/">
            返回首页
          </Link>
          <Link className={styles.linkButton} href="/admin/content">
            内容审核
          </Link>
          <Link className={styles.linkButton} href="/admin/monitor">
            任务监控
          </Link>
          <button
            className={styles.linkButton}
            type="button"
            onClick={() => submitJson("/api/admin/logout", "POST", {}, "已退出登录，即将返回登录页。")}
          >
            退出登录
          </button>
        </div>
      </div>

      {message ? <p className={styles.message}>{message}</p> : null}

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>基础配置</h2>
        <div className={styles.formGrid}>
          <label className={styles.field}>
            <span>模型 API Base URL</span>
            <input className={styles.input} value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} />
          </label>
          <label className={styles.field}>
            <span>模型名</span>
            <input className={styles.input} value={model} onChange={(event) => setModel(event.target.value)} />
          </label>
          <label className={styles.field}>
            <span>并发数</span>
            <input
              className={styles.input}
              aria-label="并发数"
              type="number"
              min={1}
              max={10}
              value={itemConcurrency}
              onChange={(event) => setItemConcurrency(event.target.value)}
            />
          </label>
          <label className={styles.field}>
            <span>API Key</span>
            <input
              className={styles.input}
              placeholder={initialSettings.appConfig.modelApi.apiKeyMasked || "留空保持不变"}
              value={apiKey}
              onChange={(event) => {
                setApiKey(event.target.value);
                setApiKeyMode(event.target.value ? "replace" : "keep");
              }}
            />
          </label>
          <label className={styles.field}>
            <span>内容分析提示词</span>
            <textarea
              aria-label="内容分析提示词"
              className={styles.textarea}
              value={itemAnalysisPrompt}
              onChange={(event) => setItemAnalysisPrompt(event.target.value)}
            />
          </label>
          <label className={styles.field}>
            <span>聚合摘要提示词</span>
            <textarea
              aria-label="聚合摘要提示词"
              className={styles.textarea}
              value={clusterSummaryPrompt}
              onChange={(event) => setClusterSummaryPrompt(event.target.value)}
            />
          </label>
          <label className={styles.field}>
            <span>归组判定提示词</span>
            <textarea
              aria-label="归组判定提示词"
              className={styles.textarea}
              value={clusterMatchPrompt}
              onChange={(event) => setClusterMatchPrompt(event.target.value)}
            />
          </label>
        </div>

        <div className={styles.inlineActions}>
          <button
            className={styles.secondaryButton}
            type="button"
            onClick={() => {
              setApiKey("");
              setApiKeyMode("clear");
            }}
          >
            清空 API Key
          </button>
          <button
            className={styles.primaryButton}
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
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>黑名单</h2>
        <label className={styles.field}>
          <span>关键词列表（每行一个）</span>
          <textarea
            className={styles.textarea}
            value={blacklistText}
            onChange={(event) => setBlacklistText(event.target.value)}
          />
        </label>
        <button
          className={styles.primaryButton}
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
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>分组管理</h2>
        <div className={styles.inlineForm}>
          <input
            className={styles.input}
            placeholder="新分组名称"
            value={newGroupName}
            onChange={(event) => setNewGroupName(event.target.value)}
          />
          <button
            className={styles.primaryButton}
            type="button"
            onClick={() =>
              submitJson("/api/admin/settings/groups", "POST", { name: newGroupName }, "分组已创建。", true)
            }
            disabled={isPending || !newGroupName.trim()}
          >
            创建分组
          </button>
        </div>
        <div className={styles.list}>
          {initialSettings.groups.map((group) => (
            <GroupRow key={group.id} group={group} submitJson={submitJson} />
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>信息源管理</h2>
        <div className={styles.inlineForm}>
          <input
            className={styles.input}
            aria-label="OPML 文件"
            type="file"
            accept=".opml,.xml,text/xml,application/xml"
            onChange={(event) => setOpmlFile(event.target.files?.[0] ?? null)}
          />
          <button className={styles.secondaryButton} type="button" onClick={importOpml} disabled={isPending || !opmlFile}>
            导入 OPML
          </button>
        </div>
        <div className={styles.sourceEditor}>
          <input
            className={styles.input}
            placeholder="名称"
            value={newSource.name}
            onChange={(event) => setNewSource((current) => ({ ...current, name: event.target.value }))}
          />
          <input
            className={styles.input}
            placeholder="RSS URL"
            value={newSource.rssUrl}
            onChange={(event) => setNewSource((current) => ({ ...current, rssUrl: event.target.value }))}
          />
          <input
            className={styles.input}
            placeholder="站点 URL"
            value={newSource.siteUrl}
            onChange={(event) => setNewSource((current) => ({ ...current, siteUrl: event.target.value }))}
          />
          <select
            className={styles.select}
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
          <label className={styles.checkbox}>
            <input
              type="checkbox"
              checked={newSource.enabled}
              onChange={(event) => setNewSource((current) => ({ ...current, enabled: event.target.checked }))}
            />
            启用
          </label>
          <label className={styles.checkbox}>
            <input
              type="checkbox"
            checked={newSource.fetchFullTextWhenMissing}
            onChange={(event) =>
              setNewSource((current) => ({ ...current, fetchFullTextWhenMissing: event.target.checked }))
            }
          />
          缺全文时补抓
          </label>
          <button
            className={styles.secondaryButton}
            type="button"
            onClick={resolveSourceFromRss}
            disabled={isPending || !newSource.rssUrl.trim()}
          >
            根据 RSS 自动填充
          </button>
          <button
            className={styles.primaryButton}
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

        <div className={styles.list}>
          {initialSettings.sources.map((source) => (
            <SourceRow key={source.id} source={source} groups={initialSettings.groups} submitJson={submitJson} />
          ))}
        </div>
      </section>
    </div>
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
    <div className={styles.row}>
      <input className={styles.input} value={name} onChange={(event) => setName(event.target.value)} />
      <div className={styles.inlineActions}>
        <button
          className={styles.secondaryButton}
          type="button"
          onClick={() => submitJson(`/api/admin/settings/groups/${group.id}`, "PATCH", { name }, "分组已更新。")}
        >
          保存
        </button>
        <button
          className={styles.linkButton}
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
    <div className={styles.sourceEditor}>
      <input
        className={styles.input}
        value={draft.name}
        onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
      />
      <input
        className={styles.input}
        value={draft.rssUrl}
        onChange={(event) => setDraft((current) => ({ ...current, rssUrl: event.target.value }))}
      />
      <input
        className={styles.input}
        value={draft.siteUrl}
        onChange={(event) => setDraft((current) => ({ ...current, siteUrl: event.target.value }))}
      />
      <select
        className={styles.select}
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
      <label className={styles.checkbox}>
        <input
          type="checkbox"
          checked={draft.enabled}
          onChange={(event) => setDraft((current) => ({ ...current, enabled: event.target.checked }))}
        />
        启用
      </label>
      <label className={styles.checkbox}>
        <input
          type="checkbox"
          checked={draft.fetchFullTextWhenMissing}
          onChange={(event) =>
            setDraft((current) => ({ ...current, fetchFullTextWhenMissing: event.target.checked }))
          }
        />
        缺全文时补抓
      </label>
      <div className={styles.inlineActions}>
        <button
          className={styles.secondaryButton}
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
          className={styles.linkButton}
          type="button"
          onClick={() => submitJson(`/api/admin/settings/sources/${source.id}`, "DELETE", {}, "信息源已删除。", true)}
        >
          删除
        </button>
      </div>
    </div>
  );
}
