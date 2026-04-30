import type {
  DailyReportContent,
  DailyReportDetailDTO,
  DailyReportRefineMode,
  DailyReportRefineStreamEvent,
  DailyReportRefinementSourceSearchResult,
  DailyReportSourceRegistryEntry,
} from "@/lib/daily-report/types";

type ApiResult<T> = {
  ok: boolean;
  status: number;
  data: T;
};

type TaskRunPayload = {
  taskRun?: { id: string } | null;
  error?: string;
};

async function requestJsonWithMeta<T>(input: RequestInfo | URL, init?: RequestInit): Promise<ApiResult<T>> {
  const response = await fetch(input, init);
  return {
    ok: response.ok,
    status: response.status,
    data: (await response.json()) as T,
  };
}

export function requestDailyReportGeneration(date: string) {
  return requestJsonWithMeta<TaskRunPayload>("/api/admin/daily-reports/generate", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ date }),
  });
}

export function publishDailyReport(date: string) {
  return requestJsonWithMeta<{ error?: string }>(`/api/admin/daily-reports/${date}/publish`, {
    method: "POST",
  });
}

export function unpublishDailyReport(date: string) {
  return requestJsonWithMeta<{ error?: string }>(`/api/admin/daily-reports/${date}/unpublish`, {
    method: "POST",
  });
}

export function deleteDailyReport(date: string) {
  return requestJsonWithMeta<{ deleted?: boolean; error?: string }>(`/api/admin/daily-reports/${date}`, {
    method: "DELETE",
  });
}

export function getAdminDailyReportDetail(date: string) {
  return requestJsonWithMeta<{ report?: DailyReportDetailDTO | null; error?: string }>(
    `/api/admin/daily-reports/${date}`,
  );
}

export function getDailyReportRefinementSession(date: string) {
  return requestJsonWithMeta<{
    session: {
      id: string;
      reportDate: string;
      sourceRegistryVersion: string;
      sourceRegistry: DailyReportSourceRegistryEntry[];
      candidate?: DailyReportRefinementCandidate | null;
      messages: Array<{ id: string; role: "user" | "assistant"; content: string }>;
    } | null;
    error?: string;
    code?: string;
  }>(`/api/admin/daily-reports/${date}/refine/session`);
}

export function discardDailyReportRefinementSession(date: string, input: { sessionId: string }) {
  return requestJsonWithMeta<{ discarded?: boolean; error?: string; code?: string }>(
    `/api/admin/daily-reports/${date}/refine/session`,
    {
      method: "DELETE",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(input),
    },
  );
}

export async function streamDailyReportRefinement(
  date: string,
  input: { sessionId?: string | null; instruction: string; mode?: DailyReportRefineMode },
  onEvent: (event: DailyReportRefineStreamEvent) => void,
) {
  const response = await fetch(`/api/admin/daily-reports/${date}/refine`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      sessionId: input.sessionId ?? undefined,
      instruction: input.instruction,
      mode: input.mode ?? "chat",
    }),
  });

  if (!response.ok || !response.body) {
    const data = await response.json().catch(() => ({ error: "AI 微调请求失败。" })) as { error?: string };
    throw new Error(data.error ?? "AI 微调请求失败。");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() ?? "";

    for (const chunk of chunks) {
      const dataLine = chunk.split("\n").find((line) => line.startsWith("data: "));
      if (!dataLine) continue;
      onEvent(JSON.parse(dataLine.slice("data: ".length)) as DailyReportRefineStreamEvent);
    }
  }
}

export function saveDailyReportRefinement(date: string, input: { sessionId: string; messageId?: string | null }) {
  return requestJsonWithMeta<{
    saved?: boolean;
    report?: unknown;
    error?: string;
    code?: string;
  }>(`/api/admin/daily-reports/${date}/refine/save`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      sessionId: input.sessionId,
      messageId: input.messageId ?? undefined,
    }),
  });
}

export function searchDailyReportRefinementSources(
  date: string,
  input: { sessionId?: string | null; query: string; limit?: number },
) {
  return requestJsonWithMeta<{
    sessionId: string;
    reportDate: string;
    sourceRegistryVersion: string;
    sources: DailyReportRefinementSourceSearchResult[];
    error?: string;
    code?: string;
  }>(`/api/admin/daily-reports/${date}/refine/sources/search`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      sessionId: input.sessionId ?? undefined,
      query: input.query,
      limit: input.limit ?? 10,
    }),
  });
}

export function addDailyReportRefinementSources(
  date: string,
  input: { sessionId: string; sourceKeys: string[] },
) {
  return requestJsonWithMeta<{
    sessionId: string;
    reportDate: string;
    sourceRegistryVersion: string;
    sourceRegistry: DailyReportSourceRegistryEntry[];
    error?: string;
    code?: string;
  }>(`/api/admin/daily-reports/${date}/refine/sources/add`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(input),
  });
}

export type DailyReportRefinementCandidate = {
  messageId: string;
  content: DailyReportContent;
  renderedMarkdown: string;
};
