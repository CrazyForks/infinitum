import type { AdminSettingsSnapshot } from "@/lib/settings/types";

type SourceResolvePayload = {
  source?: {
    name: string;
    rssUrl: string;
    siteUrl: string;
    suggestedAiParsingEnabled: boolean;
  };
  error?: string;
};

type SourceImportPayload = {
  summary?: {
    createdCount: number;
    updatedCount: number;
    failedCount: number;
  };
  error?: string;
};

type SchedulePayload = {
  error?: string;
  schedule?: AdminSettingsSnapshot["taskSchedule"];
};

type DailyReportSchedulePayload = {
  error?: string;
  schedule?: AdminSettingsSnapshot["dailyReportSchedule"];
};

type GroupReorderPayload = {
  error?: string;
  groups?: AdminSettingsSnapshot["groups"];
};

async function requestAdminSettingsJson<T extends { error?: string }>(
  url: string,
  method: string,
  body?: unknown,
  fallbackMessage = "请求失败",
): Promise<T> {
  const response = await fetch(url, {
    method,
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body ?? {}),
  });
  const payload = (await response.json()) as T;

  if (!response.ok || payload.error) {
    throw new Error(payload.error ?? fallbackMessage);
  }

  return payload;
}

export function submitAdminSettingsAction(url: string, method: string, body: unknown) {
  return requestAdminSettingsJson<{ error?: string }>(url, method, body, "保存失败");
}

export async function resolveSourceFromRssUrl(rssUrl: string) {
  const payload = await requestAdminSettingsJson<SourceResolvePayload>(
    "/api/admin/settings/sources/resolve",
    "POST",
    { rssUrl },
    "RSS 解析失败",
  );

  if (!payload.source) {
    throw new Error("RSS 解析失败");
  }

  return payload.source;
}

export async function importSourcesFromOpmlText(opmlText: string) {
  const payload = await requestAdminSettingsJson<SourceImportPayload>(
    "/api/admin/settings/sources/import",
    "POST",
    { opmlText },
    "OPML 导入失败",
  );

  if (!payload.summary) {
    throw new Error("OPML 导入失败");
  }

  return payload.summary;
}

export async function saveDefaultIngestionSchedule(input: {
  enabled: boolean;
  cronExpression: string;
  sourceConcurrency: number;
  fullTextFetchThreshold: number;
  perSourceItemLimit: number;
  processingStartAt: string | null;
}) {
  const payload = await requestAdminSettingsJson<SchedulePayload>(
    "/api/admin/monitor/schedule/ingestion-default",
    "PATCH",
    input,
    "任务配置保存失败。",
  );

  if (!payload.schedule) {
    throw new Error("任务配置保存失败。");
  }

  return payload.schedule;
}

export async function saveDefaultDailyReportSchedule(input: {
  enabled: boolean;
  cronExpression: string;
  dailyReportCandidateLimit: number;
  dailyReportOffsetDays: number;
  dailyReportAutoPublish: boolean;
}) {
  const payload = await requestAdminSettingsJson<DailyReportSchedulePayload>(
    "/api/admin/monitor/schedule/daily-report-default",
    "PATCH",
    input,
    "日报任务配置保存失败。",
  );

  if (!payload.schedule) {
    throw new Error("日报任务配置保存失败。");
  }

  return payload.schedule;
}

export async function reorderSourceGroups(groupIds: string[]) {
  const payload = await requestAdminSettingsJson<GroupReorderPayload>(
    "/api/admin/settings/groups/reorder",
    "PATCH",
    { groupIds },
    "分组排序保存失败。",
  );

  if (!payload.groups) {
    throw new Error("分组排序保存失败。");
  }

  return payload.groups;
}
