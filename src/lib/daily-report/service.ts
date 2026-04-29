import { createHash } from "node:crypto";

import type { BackgroundTaskRun } from "@prisma/client";

import { createAiProvider } from "@/lib/ai/provider";
import { prisma } from "@/lib/db";
import { getDailyReportDateRange, getTodayDailyReportDate, normalizeDailyReportDate } from "@/lib/daily-report/date";
import { invalidateDailyReportCache } from "@/lib/daily-report/cache";
import { listDailyReportCandidates } from "@/lib/daily-report/repository";
import { renderDailyReportMarkdown } from "@/lib/daily-report/renderer";
import {
  DAILY_REPORT_SECTION_NAMES,
  DAILY_REPORT_TIMEZONE,
  type DailyReportCandidate,
  type DailyReportContent,
  type DailyReportRefineMode,
  type DailyReportRefinementSourceSearchResult,
  type DailyReportSourceRegistryEntry,
  type DailyReportSectionName,
} from "@/lib/daily-report/types";
import { parseDailyReportContent } from "@/lib/daily-report/validator";
import { getIngestionRuntimeConfig } from "@/lib/settings/runtime-service";
import { DEFAULT_DAILY_REPORT_TASK_LABEL, type TaskTimelineNodeSnapshot } from "@/lib/tasks/types";
import { enqueueTaskRun, ensureDefaultDailyReportSchedule, updateTaskRun } from "@/lib/tasks/service";

const MIN_CANDIDATE_COUNT = 2;

export class DailyReportRefinementError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "DailyReportRefinementError";
    this.code = code;
    this.status = status;
  }
}

type DailyReportSourceRegistryRow = Parameters<typeof buildDailyReportSourceRegistryFromRows>[0][number];

function buildDailyReportTitle(date: string) {
  return `${date} AI 日报`;
}

function buildInputHash(date: string, candidates: DailyReportCandidate[]) {
  const hash = createHash("sha256");
  hash.update(date);
  for (const candidate of candidates) {
    hash.update(JSON.stringify({
      itemId: candidate.itemId,
      clusterId: candidate.clusterId,
      title: candidate.title,
      summary: candidate.summary,
      qualityScore: candidate.qualityScore,
    }));
  }
  return hash.digest("hex");
}

function getSectionSourceIds(content: DailyReportContent) {
  const rows: Array<{ sectionName: DailyReportSectionName; topic: string; sourceId: number }> = [];

  for (const sectionName of DAILY_REPORT_SECTION_NAMES) {
    for (const item of content.sections[sectionName]) {
      for (const sourceId of item.sourceIds) {
        rows.push({ sectionName, topic: item.topic, sourceId });
      }
    }
  }

  return rows;
}

function buildDailyReportSourceKey(input: { itemId: string | null; clusterId: string | null; url: string }) {
  if (input.itemId) return `item:${input.itemId}`;
  if (input.clusterId) return `cluster:${input.clusterId}`;
  return `url:${input.url.trim().toLowerCase()}`;
}

function toDailyReportSourceRegistryRow(input: {
  sourceNumber: number | null;
  sourceKey: string | null;
  itemId: string | null;
  clusterId: string | null;
  sourceName: string;
  title: string;
  url: string;
  sourceSummary: string | null;
  sourcePublishedAt: Date | null;
  sourceQualityScore: number | null;
  eventType: string | null;
  eventSubject: string | null;
  eventAction: string | null;
  eventObject: string | null;
  eventDate: string | null;
}): DailyReportSourceRegistryRow {
  return input;
}

function candidateToDailyReportSourceRegistryRow(candidate: DailyReportCandidate): DailyReportSourceRegistryRow {
  return toDailyReportSourceRegistryRow({
    sourceNumber: candidate.id,
    sourceKey: buildDailyReportSourceKey(candidate),
    itemId: candidate.itemId,
    clusterId: candidate.clusterId,
    sourceName: candidate.sourceName,
    title: candidate.title,
    url: candidate.url,
    sourceSummary: candidate.summary,
    sourcePublishedAt: new Date(candidate.publishedAt),
    sourceQualityScore: candidate.qualityScore,
    eventType: candidate.eventType,
    eventSubject: candidate.eventSubject,
    eventAction: candidate.eventAction,
    eventObject: candidate.eventObject,
    eventDate: candidate.eventDate,
  });
}

function candidateToDailyReportSourceRegistryEntry(
  candidate: DailyReportCandidate,
  sourceNumber = candidate.id,
): DailyReportSourceRegistryEntry {
  return {
    sourceNumber,
    sourceKey: buildDailyReportSourceKey(candidate),
    itemId: candidate.itemId,
    clusterId: candidate.clusterId,
    sourceName: candidate.sourceName,
    title: candidate.title,
    url: candidate.url,
    summary: candidate.summary,
    publishedAt: candidate.publishedAt,
    qualityScore: candidate.qualityScore,
    eventType: candidate.eventType,
    eventSubject: candidate.eventSubject,
    eventAction: candidate.eventAction,
    eventObject: candidate.eventObject,
    eventDate: candidate.eventDate,
  };
}

function candidateToRefinementSourceSearchResult(candidate: DailyReportCandidate): DailyReportRefinementSourceSearchResult {
  const entry = candidateToDailyReportSourceRegistryEntry(candidate);
  return {
    candidateNumber: candidate.id,
    sourceKey: entry.sourceKey,
    itemId: entry.itemId,
    clusterId: entry.clusterId,
    sourceName: entry.sourceName,
    title: entry.title,
    url: entry.url,
    summary: entry.summary,
    publishedAt: entry.publishedAt,
    qualityScore: entry.qualityScore,
    eventType: entry.eventType,
    eventSubject: entry.eventSubject,
    eventAction: entry.eventAction,
    eventObject: entry.eventObject,
    eventDate: entry.eventDate,
  };
}

function countSelectedDailyReportCandidates(content: DailyReportContent) {
  const selectedIds = new Set<number>();

  for (const row of getSectionSourceIds(content)) {
    selectedIds.add(row.sourceId);
  }

  return selectedIds.size;
}

function parseSavedDailyReportContent(value: string): DailyReportContent {
  return JSON.parse(value) as DailyReportContent;
}

function getDailyReportContentSourceIds(content: DailyReportContent) {
  return new Set(getSectionSourceIds(content).map((row) => row.sourceId));
}

function assertDailyReportSourceIdsExist(content: DailyReportContent, registry: DailyReportSourceRegistryEntry[]) {
  const validIds = new Set(registry.map((entry) => entry.sourceNumber));
  const invalidIds = Array.from(getDailyReportContentSourceIds(content)).filter((sourceId) => !validIds.has(sourceId));

  if (invalidIds.length > 0) {
    throw new Error(`日报输出引用了不存在的来源：${invalidIds.join(", ")}`);
  }
}

function registryToCandidates(registry: DailyReportSourceRegistryEntry[]): DailyReportCandidate[] {
  return registry.map((entry) => ({
    id: entry.sourceNumber,
    itemId: entry.itemId ?? "",
    clusterId: entry.clusterId,
    title: entry.title,
    sourceName: entry.sourceName,
    url: entry.url,
    summary: entry.summary ?? "",
    qualityScore: entry.qualityScore ?? 0,
    createdAt: entry.publishedAt ?? new Date(0).toISOString(),
    publishedAt: entry.publishedAt ?? new Date(0).toISOString(),
    eventType: entry.eventType,
    eventSubject: entry.eventSubject,
    eventAction: entry.eventAction,
    eventObject: entry.eventObject,
    eventDate: entry.eventDate,
  }));
}

function buildSourceRegistryVersion(registry: DailyReportSourceRegistryEntry[]) {
  return createHash("sha256")
    .update(JSON.stringify(registry.map((entry) => ({
      sourceNumber: entry.sourceNumber,
      sourceKey: entry.sourceKey,
      title: entry.title,
      url: entry.url,
      summary: entry.summary,
    }))))
    .digest("hex")
    .slice(0, 16);
}

function parseCandidateNumberQuery(query: string) {
  const match = query.trim().match(/^#?\s*(\d+)$/);
  if (!match) return null;

  const candidateNumber = Number(match[1]);
  return Number.isSafeInteger(candidateNumber) && candidateNumber > 0 ? candidateNumber : null;
}

function candidateMatchesSourceRecallQuery(candidate: DailyReportCandidate, query: string) {
  const candidateNumber = parseCandidateNumberQuery(query);
  if (candidateNumber != null) {
    return candidate.id === candidateNumber;
  }

  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return false;

  return [
    candidate.title,
    candidate.sourceName,
    candidate.url,
    candidate.summary,
    candidate.eventType ?? "",
    candidate.eventSubject ?? "",
    candidate.eventAction ?? "",
    candidate.eventObject ?? "",
    candidate.eventDate ?? "",
  ].some((value) => value.toLowerCase().includes(normalizedQuery));
}

function toInvalidAiOutputError(error: unknown) {
  return new DailyReportRefinementError(
    "invalid_ai_output",
    error instanceof Error ? error.message : "AI 微调输出无法解析。",
    422,
  );
}

async function validateRefinementOutputWithRepair(input: {
  rawOutput: string;
  registry: DailyReportSourceRegistryEntry[];
  repair: (rawOutput: string) => Promise<string | null>;
}) {
  try {
    return {
      content: await validateDailyReportContentForRegistry(input.rawOutput, input.registry),
      rawOutput: input.rawOutput,
    };
  } catch (error) {
    const repairedOutput = await input.repair(input.rawOutput);
    if (!repairedOutput) {
      throw toInvalidAiOutputError(error);
    }

    try {
      return {
        content: await validateDailyReportContentForRegistry(repairedOutput, input.registry),
        rawOutput: repairedOutput,
      };
    } catch (repairError) {
      throw toInvalidAiOutputError(repairError);
    }
  }
}

export function buildDailyReportSourceRegistryFromRows(rows: Array<{
  sourceNumber: number | null;
  sourceKey: string | null;
  itemId: string | null;
  clusterId: string | null;
  sourceName: string;
  title: string;
  url: string;
  sourceSummary: string | null;
  sourcePublishedAt: Date | null;
  sourceQualityScore: number | null;
  eventType: string | null;
  eventSubject: string | null;
  eventAction: string | null;
  eventObject: string | null;
  eventDate: string | null;
}>): DailyReportSourceRegistryEntry[] {
  const entries = new Map<number, DailyReportSourceRegistryEntry>();

  for (const row of rows) {
    if (!row.sourceNumber || row.sourceNumber < 1 || entries.has(row.sourceNumber)) {
      continue;
    }

    entries.set(row.sourceNumber, {
      sourceNumber: row.sourceNumber,
      sourceKey: row.sourceKey ?? buildDailyReportSourceKey(row),
      itemId: row.itemId,
      clusterId: row.clusterId,
      sourceName: row.sourceName,
      title: row.title,
      url: row.url,
      summary: row.sourceSummary,
      publishedAt: row.sourcePublishedAt?.toISOString() ?? null,
      qualityScore: row.sourceQualityScore,
      eventType: row.eventType,
      eventSubject: row.eventSubject,
      eventAction: row.eventAction,
      eventObject: row.eventObject,
      eventDate: row.eventDate,
    });
  }

  return Array.from(entries.values()).sort((left, right) => left.sourceNumber - right.sourceNumber);
}

export async function getDailyReportSourceRegistry(dailyReportId: string) {
  const rows = await prisma.dailyReportSource.findMany({
    where: { dailyReportId },
    orderBy: [{ sourceNumber: "asc" }, { createdAt: "asc" }],
  });

  return buildDailyReportSourceRegistryFromRows(rows);
}

async function loadDailyReportForRefinement(date: string) {
  const normalizedDate = normalizeDailyReportDate(date);
  const report = await prisma.dailyReport.findUnique({
    where: {
      date_timezone: {
        date: normalizedDate,
        timezone: DAILY_REPORT_TIMEZONE,
      },
    },
    include: {
      sources: true,
    },
  });

  if (!report) {
    throw new DailyReportRefinementError("not_found", "日报不存在。", 404);
  }

  if (report.status === "failed") {
    throw new DailyReportRefinementError("invalid_report_status", "失败状态的日报不能微调。", 409);
  }

  return report;
}

async function recoverDailyReportSourceRegistryRows(input: {
  date: string;
  rows: DailyReportSourceRegistryRow[];
}) {
  if (input.rows.every((row) => row.sourceNumber)) {
    return input.rows;
  }

  const candidates = await listDailyReportCandidates(input.date);
  const candidatesByKey = new Map(candidates.map((candidate) => [buildDailyReportSourceKey(candidate), candidate]));

  return input.rows.map((row) => {
    const candidate = candidatesByKey.get(buildDailyReportSourceKey(row));
    return candidate ? candidateToDailyReportSourceRegistryRow(candidate) : row;
  });
}

async function backfillRecoveredDailyReportSourceRows(input: {
  rows: Array<{ id: string } & DailyReportSourceRegistryRow>;
  recoveredRows: DailyReportSourceRegistryRow[];
}) {
  await Promise.all(input.rows.map(async (row, index) => {
    if (row.sourceNumber) return;
    const recovered = input.recoveredRows[index];
    if (!recovered?.sourceNumber) return;

    await prisma.dailyReportSource.update({
      where: { id: row.id },
      data: {
        sourceNumber: recovered.sourceNumber,
        sourceKey: recovered.sourceKey,
        sourceSummary: recovered.sourceSummary,
        sourcePublishedAt: recovered.sourcePublishedAt,
        sourceQualityScore: recovered.sourceQualityScore,
        eventType: recovered.eventType,
        eventSubject: recovered.eventSubject,
        eventAction: recovered.eventAction,
        eventObject: recovered.eventObject,
        eventDate: recovered.eventDate,
      },
    });
  }));
}

async function getRegistryOrThrow(input: {
  date: string;
  rows: Array<{ id: string } & DailyReportSourceRegistryRow>;
}) {
  const recoveredRows = await recoverDailyReportSourceRegistryRows({
    date: input.date,
    rows: input.rows,
  });
  const registry = buildDailyReportSourceRegistryFromRows(recoveredRows);

  if (registry.length === 0) {
    throw new DailyReportRefinementError(
      "source_registry_unavailable",
      "这篇日报缺少稳定来源编号，请重新生成日报后再微调。",
      409,
    );
  }

  await backfillRecoveredDailyReportSourceRows({
    rows: input.rows,
    recoveredRows,
  });

  return registry;
}

async function getOrCreateRefinementSession(input: {
  date: string;
  sessionId?: string | null;
  modelName: string | null;
}) {
  const report = await loadDailyReportForRefinement(input.date);
  const registry = await getRegistryOrThrow({
    date: report.date,
    rows: report.sources,
  });
  const reportContent = await validateDailyReportContentForRegistry(report.summaryJson, registry);

  if (input.sessionId) {
    const session = await prisma.dailyReportRefinementSession.findUnique({
      where: { id: input.sessionId },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    });

    if (!session || session.dailyReportId !== report.id) {
      throw new DailyReportRefinementError("not_found", "微调 session 不存在。", 404);
    }

    return {
      report,
      session,
      registry: JSON.parse(session.sourceRegistryJson) as DailyReportSourceRegistryEntry[],
      currentContent: parseSavedDailyReportContent(session.currentDraftJson),
      messages: session.messages.map((message) => ({ role: message.role, content: message.content })),
    };
  }

  const session = await prisma.dailyReportRefinementSession.create({
    data: {
      dailyReportId: report.id,
      baseContentJson: JSON.stringify(reportContent),
      currentDraftJson: JSON.stringify(reportContent),
      sourceRegistryJson: JSON.stringify(registry),
      modelName: input.modelName,
    },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });

  return {
    report,
    session,
    registry,
    currentContent: reportContent,
    messages: [] as Array<{ role: string; content: string }>,
  };
}

async function countExistingSelectedDailyReportCandidates(dailyReportId: string) {
  const rows = await prisma.dailyReportSource.findMany({
    where: { dailyReportId },
    select: {
      itemId: true,
      clusterId: true,
      url: true,
    },
  });

  return new Set(rows.map((row) => row.itemId ?? row.clusterId ?? row.url)).size;
}

function getDailyReportTaskFinishedLabel(status: "succeeded" | "failed" | "skipped") {
  if (status === "failed") return "失败";
  if (status === "skipped") return "已跳过";
  return "已完成";
}

function buildDailyReportTaskTimeline(input: {
  taskRun: BackgroundTaskRun;
  status: "running" | "succeeded" | "failed" | "skipped";
  candidateCount?: number | null;
  selectedCount?: number | null;
  finishedAt?: Date | null;
}): TaskTimelineNodeSnapshot[] {
  const taskStartedAt = input.taskRun.startedAt ?? input.taskRun.createdAt;
  const startedAt = taskStartedAt.toISOString();
  const finishedAt = input.finishedAt?.toISOString() ?? null;
  const durationMs = input.finishedAt ? input.finishedAt.getTime() - taskStartedAt.getTime() : null;

  const generationNode: TaskTimelineNodeSnapshot = {
    key: "daily_report_generate",
    label: "AI 日报生成",
    status: input.status === "running" ? "running" : input.status === "failed" ? "failed" : "succeeded",
    startedAt,
    finishedAt: input.status === "running" ? null : finishedAt,
    durationMs: input.status === "running" ? null : durationMs,
    metrics: [
      { label: "总候选数", value: input.candidateCount ?? 0 },
    ],
  };

  if (input.status === "running") {
    return [generationNode];
  }

  return [
    generationNode,
    {
      key: "task_finished",
      label: getDailyReportTaskFinishedLabel(input.status),
      status: input.status === "failed" ? "failed" : input.status === "skipped" ? "skipped" : "succeeded",
      startedAt: finishedAt,
      finishedAt,
      durationMs: null,
      metrics: [
        { label: "最后入选数", value: input.selectedCount ?? 0 },
      ],
    },
  ];
}

async function markDailyScheduleRunFinished(taskRun: BackgroundTaskRun, status: "succeeded" | "failed" | "partial") {
  if (taskRun.triggerType !== "scheduled") {
    return;
  }

  const schedule = await ensureDefaultDailyReportSchedule();
  const now = new Date();
  await prisma.taskSchedule.update({
    where: { id: schedule.id },
    data: {
      lastRunStartedAt: taskRun.startedAt ?? taskRun.createdAt,
      lastRunFinishedAt: now,
      lastRunStatus: status,
    },
  });
}

export async function enqueueDailyReportGeneration(date: string, triggerType: "manual" | "scheduled" | "admin_action" = "manual") {
  const normalizedDate = normalizeDailyReportDate(date);
  const existingActive = await prisma.backgroundTaskRun.findFirst({
    where: {
      kind: "daily_report_generate",
      entityId: normalizedDate,
      status: {
        in: ["queued", "running"],
      },
    },
  });

  if (existingActive) {
    return existingActive;
  }

  return enqueueTaskRun({
    kind: "daily_report_generate",
    triggerType,
    label: `${DEFAULT_DAILY_REPORT_TASK_LABEL} ${normalizedDate}`,
    entityId: normalizedDate,
  });
}

export async function generateDailyReport(input: {
  date: string;
  taskRunId?: string | null;
  force?: boolean;
  onCandidatesLoaded?: (candidateCount: number) => Promise<void>;
}) {
  const { date } = getDailyReportDateRange(input.date);
  const schedule = await ensureDefaultDailyReportSchedule();
  const candidates = await listDailyReportCandidates(date, schedule.dailyReportCandidateLimit);
  await input.onCandidatesLoaded?.(candidates.length);
  const inputHash = buildInputHash(date, candidates);
  const existing = await prisma.dailyReport.findUnique({
    where: {
      date_timezone: {
        date,
        timezone: DAILY_REPORT_TIMEZONE,
      },
    },
  });

  if (existing && existing.inputHash === inputHash && !input.force) {
    return {
      report: existing,
      skipped: true,
      reason: "日报输入未变化，已跳过生成。",
      candidateCount: candidates.length,
      selectedCount: await countExistingSelectedDailyReportCandidates(existing.id),
    };
  }

  if (candidates.length < MIN_CANDIDATE_COUNT) {
    return {
      report: null,
      skipped: true,
      reason: `候选内容不足 ${MIN_CANDIDATE_COUNT} 条，已跳过生成。`,
      candidateCount: candidates.length,
      selectedCount: 0,
    };
  }

  const runtimeConfig = await getIngestionRuntimeConfig();
  const provider = createAiProvider(runtimeConfig.modelApi, runtimeConfig.selectedPromptConfigs);
  const rawOutput = await provider.generateDailyReport({
    date,
    timezone: DAILY_REPORT_TIMEZONE,
    articles: candidates,
  });

  if (!rawOutput) {
    throw new Error("模型未返回日报内容。");
  }

  let content: DailyReportContent;
  try {
    content = parseDailyReportContent(rawOutput, candidates.length);
  } catch (error) {
    const repairedOutput = await provider.repairDailyReportJson(rawOutput);
    if (!repairedOutput) {
      throw error;
    }
    content = parseDailyReportContent(repairedOutput, candidates.length);
  }
  assertDailyReportSourceIdsExist(content, candidates.map((candidate) => ({
    sourceNumber: candidate.id,
    sourceKey: buildDailyReportSourceKey(candidate),
    itemId: candidate.itemId,
    clusterId: candidate.clusterId,
    sourceName: candidate.sourceName,
    title: candidate.title,
    url: candidate.url,
    summary: candidate.summary,
    publishedAt: candidate.publishedAt,
    qualityScore: candidate.qualityScore,
    eventType: candidate.eventType,
    eventSubject: candidate.eventSubject,
    eventAction: candidate.eventAction,
    eventObject: candidate.eventObject,
    eventDate: candidate.eventDate,
  })));
  const title = buildDailyReportTitle(date);
  const renderedMarkdown = renderDailyReportMarkdown(content, candidates, title);
  const sourceRows = getSectionSourceIds(content);
  const selectedCount = countSelectedDailyReportCandidates(content);
  const candidatesById = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const shouldAutoPublish = schedule.dailyReportAutoPublish;
  const publishedAt = shouldAutoPublish ? new Date() : null;

  const report = await prisma.$transaction(async (tx) => {
    const saved = await tx.dailyReport.upsert({
      where: {
        date_timezone: {
          date,
          timezone: DAILY_REPORT_TIMEZONE,
        },
      },
      update: {
        status: shouldAutoPublish ? "published" : "draft",
        title,
        openingSummary: content.openingSummary,
        closingThought: content.closingThought,
        summaryJson: JSON.stringify(content),
        renderedMarkdown,
        inputHash,
        modelName: runtimeConfig.modelApi.model,
        taskRunId: input.taskRunId ?? null,
        errorMessage: null,
        publishedAt,
        generatedAt: new Date(),
      },
      create: {
        date,
        timezone: DAILY_REPORT_TIMEZONE,
        status: shouldAutoPublish ? "published" : "draft",
        title,
        openingSummary: content.openingSummary,
        closingThought: content.closingThought,
        summaryJson: JSON.stringify(content),
        renderedMarkdown,
        inputHash,
        modelName: runtimeConfig.modelApi.model,
        taskRunId: input.taskRunId ?? null,
        publishedAt,
      },
    });

    await tx.dailyReportSource.deleteMany({
      where: { dailyReportId: saved.id },
    });
    await tx.dailyReportSource.createMany({
      data: sourceRows.flatMap((row) => {
        const candidate = candidatesById.get(row.sourceId);
        if (!candidate) {
          return [];
        }
        return [{
          dailyReportId: saved.id,
          sourceNumber: candidate.id,
          sourceKey: buildDailyReportSourceKey(candidate),
          itemId: candidate.itemId,
          clusterId: candidate.clusterId,
          sourceName: candidate.sourceName,
          title: candidate.title,
          url: candidate.url,
          sourceSummary: candidate.summary,
          sourcePublishedAt: new Date(candidate.publishedAt),
          sourceQualityScore: candidate.qualityScore,
          eventType: candidate.eventType,
          eventSubject: candidate.eventSubject,
          eventAction: candidate.eventAction,
          eventObject: candidate.eventObject,
          eventDate: candidate.eventDate,
          sectionName: row.sectionName,
          topic: row.topic,
        }];
      }),
    });

    return saved;
  });

  invalidateDailyReportCache();

  return {
    report,
    skipped: false,
    reason: null,
    candidateCount: candidates.length,
    selectedCount,
  };
}

export async function executeDailyReportTask(taskRun: BackgroundTaskRun) {
  const date = taskRun.entityId && /^\d{4}-\d{2}-\d{2}$/.test(taskRun.entityId)
    ? taskRun.entityId
    : getTodayDailyReportDate();
  let candidateCount = 0;

  try {
    await updateTaskRun(taskRun.id, {
      status: "running",
      progressCurrent: 0,
      progressTotal: 1,
      progressLabel: `正在生成 ${date} AI 日报`,
      taskTimeline: buildDailyReportTaskTimeline({
        taskRun,
        status: "running",
      }),
      aiCallCountEstimated: 1,
      aiCallBreakdown: [
        { key: "daily_report", label: "AI 日报", actual: 0, estimated: 1 },
      ],
    });

    const result = await generateDailyReport({
      date,
      taskRunId: taskRun.id,
      force: taskRun.triggerType !== "scheduled",
      onCandidatesLoaded: async (loadedCandidateCount) => {
        candidateCount = loadedCandidateCount;
        await updateTaskRun(taskRun.id, {
          taskTimeline: buildDailyReportTaskTimeline({
            taskRun,
            status: "running",
            candidateCount,
          }),
        });
      },
    });

    const finishedAt = new Date();
    await updateTaskRun(taskRun.id, {
      status: "succeeded",
      progressCurrent: 1,
      progressTotal: 1,
      progressLabel: result.skipped
        ? result.reason
        : `已生成 ${date} AI 日报${result.report?.status === "published" ? "并发布" : "草稿"}`,
      aiCallCountActual: result.skipped ? 0 : 1,
      aiCallCountEstimated: 1,
      aiCallBreakdown: [
        { key: "daily_report", label: "AI 日报", actual: result.skipped ? 0 : 1, estimated: 1 },
      ],
      taskTimeline: buildDailyReportTaskTimeline({
        taskRun,
        status: result.skipped ? "skipped" : "succeeded",
        candidateCount: result.candidateCount,
        selectedCount: result.selectedCount,
        finishedAt,
      }),
      finishedAt,
    });
    await markDailyScheduleRunFinished(taskRun, "succeeded");
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI 日报生成失败。";
    const existingReport = await prisma.dailyReport.findUnique({
      where: {
        date_timezone: {
          date,
          timezone: DAILY_REPORT_TIMEZONE,
        },
      },
    });

    if (existingReport) {
      await prisma.dailyReport.update({
        where: { id: existingReport.id },
        data: {
          errorMessage: message,
          taskRunId: taskRun.id,
        },
      });
    }
    invalidateDailyReportCache();
    const finishedAt = new Date();
    await updateTaskRun(taskRun.id, {
      status: "failed",
      progressLabel: message,
      errorSummary: message,
      taskTimeline: buildDailyReportTaskTimeline({
        taskRun,
        status: "failed",
        candidateCount,
        finishedAt,
      }),
      finishedAt,
    });
    await markDailyScheduleRunFinished(taskRun, "failed");

    // 自动重试：检查重试次数是否未达上限
    const schedule = await ensureDefaultDailyReportSchedule();
    const maxRetries = schedule.dailyReportMaxRetries ?? 0;
    if (maxRetries > 0) {
      const existingAttempts = await prisma.backgroundTaskRun.count({
        where: {
          kind: "daily_report_generate",
          entityId: date,
        },
      });
      if (existingAttempts <= maxRetries) {
        await enqueueTaskRun({
          kind: "daily_report_generate",
          triggerType: taskRun.triggerType,
          label: `${DEFAULT_DAILY_REPORT_TASK_LABEL} ${date} (自动重试)`,
          entityId: date,
        });
      }
    }
  }
}

export async function* streamDailyReportRefinement(input: {
  date: string;
  sessionId?: string | null;
  instruction: string;
  mode?: DailyReportRefineMode;
}) {
  const instruction = input.instruction.trim();
  const mode = input.mode ?? "chat";

  if (!instruction || instruction.length > 2000) {
    throw new DailyReportRefinementError("invalid_instruction", "微调指令不能为空，且不能超过 2000 字。", 400);
  }

  const runtimeConfig = await getIngestionRuntimeConfig();
  const provider = createAiProvider(runtimeConfig.modelApi, runtimeConfig.selectedPromptConfigs);
  const context = await getOrCreateRefinementSession({
    date: input.date,
    sessionId: input.sessionId,
    modelName: runtimeConfig.modelApi.model,
  });
  const sourceRegistryVersion = buildSourceRegistryVersion(context.registry);

  yield {
    event: "session" as const,
    sessionId: context.session.id,
    reportDate: context.report.date,
    sourceRegistryVersion,
  };

  await prisma.dailyReportRefinementMessage.create({
    data: {
      sessionId: context.session.id,
      role: "user",
      content: instruction,
    },
  });

  let rawOutput = "";

  try {
    const stream = mode === "generate"
      ? provider.streamDailyReportRefinement({
        date: context.report.date,
        timezone: context.report.timezone,
        currentContent: context.currentContent,
        sourceRegistry: context.registry,
        instruction,
        messages: context.messages,
      })
      : provider.streamDailyReportRefinementChat({
        date: context.report.date,
        timezone: context.report.timezone,
        currentContent: context.currentContent,
        sourceRegistry: context.registry,
        instruction,
        messages: context.messages,
      });

    for await (const delta of stream) {
      rawOutput += delta;
      if (mode === "chat") {
        yield {
          event: "message_delta" as const,
          text: delta,
        };
      }
    }

    if (mode === "chat") {
      const message = await prisma.dailyReportRefinementMessage.create({
        data: {
          sessionId: context.session.id,
          role: "assistant",
          content: rawOutput,
        },
      });

      yield {
        event: "message_done" as const,
        messageId: message.id,
      };
      yield {
        event: "done" as const,
        ok: true,
      };
      return;
    }

    const validated = await validateRefinementOutputWithRepair({
      rawOutput,
      registry: context.registry,
      repair: (value) => provider.repairDailyReportJson(value),
    });
    rawOutput = validated.rawOutput;

    const renderedMarkdown = renderDailyReportMarkdownFromRegistry(validated.content, context.registry, context.report.title);
    const message = await prisma.dailyReportRefinementMessage.create({
      data: {
        sessionId: context.session.id,
        role: "assistant",
        content: rawOutput,
        candidateJson: JSON.stringify(validated.content),
      },
    });

    await prisma.dailyReportRefinementSession.update({
      where: { id: context.session.id },
      data: {
        currentDraftJson: JSON.stringify(validated.content),
      },
    });

    yield {
      event: "candidate" as const,
      messageId: message.id,
      content: validated.content,
      renderedMarkdown,
    };
    yield {
      event: "done" as const,
      ok: true,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI 微调失败。";
    await prisma.dailyReportRefinementMessage.create({
      data: {
        sessionId: context.session.id,
        role: "assistant",
        content: rawOutput,
        errorMessage: message,
      },
    });

    yield {
      event: "error" as const,
      code: error instanceof DailyReportRefinementError ? error.code : "provider_error",
      message,
    };
    yield {
      event: "done" as const,
      ok: false,
    };
  }
}

export async function searchDailyReportRefinementSources(input: {
  date: string;
  sessionId?: string | null;
  query: string;
  limit?: number | null;
}) {
  const query = input.query.trim();
  if (!query || query.length > 120) {
    throw new DailyReportRefinementError("invalid_query", "召回关键词不能为空，且不能超过 120 字。", 400);
  }

  const runtimeConfig = await getIngestionRuntimeConfig();
  const context = await getOrCreateRefinementSession({
    date: input.date,
    sessionId: input.sessionId,
    modelName: runtimeConfig.modelApi.model,
  });
  const schedule = await ensureDefaultDailyReportSchedule();
  const candidates = await listDailyReportCandidates(context.report.date, schedule.dailyReportCandidateLimit);
  const existingSourceKeys = new Set(context.registry.map((entry) => entry.sourceKey));
  const limit = Math.max(1, Math.min(input.limit ?? 10, 20));
  const sources = candidates
    .filter((candidate) => !existingSourceKeys.has(buildDailyReportSourceKey(candidate)))
    .filter((candidate) => candidateMatchesSourceRecallQuery(candidate, query))
    .slice(0, limit)
    .map(candidateToRefinementSourceSearchResult);

  return {
    sessionId: context.session.id,
    reportDate: context.report.date,
    sourceRegistryVersion: buildSourceRegistryVersion(context.registry),
    sources,
  };
}

export async function addDailyReportRefinementSources(input: {
  date: string;
  sessionId: string;
  sourceKeys: string[];
}) {
  const sourceKeys = Array.from(new Set(input.sourceKeys.map((key) => key.trim()).filter(Boolean)));
  if (sourceKeys.length === 0 || sourceKeys.length > 20) {
    throw new DailyReportRefinementError("invalid_source_keys", "请选择 1 到 20 个要加入的来源。", 400);
  }

  const runtimeConfig = await getIngestionRuntimeConfig();
  const context = await getOrCreateRefinementSession({
    date: input.date,
    sessionId: input.sessionId,
    modelName: runtimeConfig.modelApi.model,
  });
  const schedule = await ensureDefaultDailyReportSchedule();
  const candidates = await listDailyReportCandidates(context.report.date, schedule.dailyReportCandidateLimit);
  const candidatesByKey = new Map(candidates.map((candidate) => [buildDailyReportSourceKey(candidate), candidate]));
  const existingSourceKeys = new Set(context.registry.map((entry) => entry.sourceKey));
  const existingSourceNumbers = new Set(context.registry.map((entry) => entry.sourceNumber));
  const nextRegistry = [...context.registry];

  for (const sourceKey of sourceKeys) {
    if (existingSourceKeys.has(sourceKey)) {
      continue;
    }
    const candidate = candidatesByKey.get(sourceKey);
    if (!candidate) {
      continue;
    }
    if (existingSourceNumbers.has(candidate.id)) {
      continue;
    }
    const entry = candidateToDailyReportSourceRegistryEntry(candidate);
    nextRegistry.push(entry);
    existingSourceKeys.add(sourceKey);
    existingSourceNumbers.add(candidate.id);
  }

  if (nextRegistry.length === context.registry.length) {
    throw new DailyReportRefinementError("source_not_found", "没有找到可加入的候选来源。", 404);
  }

  nextRegistry.sort((left, right) => left.sourceNumber - right.sourceNumber);
  const addedEntries = nextRegistry.filter((entry) => !context.registry.some((existing) => existing.sourceKey === entry.sourceKey));
  await prisma.$transaction(async (tx) => {
    await tx.dailyReportRefinementSession.update({
      where: { id: context.session.id },
      data: {
        sourceRegistryJson: JSON.stringify(nextRegistry),
      },
    });
    await tx.dailyReportRefinementMessage.create({
      data: {
        sessionId: context.session.id,
        role: "system",
        content: [
          "已加入来源上下文，后续对话和候选稿生成可直接基于这些来源讨论或引用：",
          ...addedEntries.map((entry) => `#${entry.sourceNumber} ${entry.title}（${entry.sourceName}${entry.qualityScore != null ? `，评分 ${entry.qualityScore}` : ""}）`),
        ].join("\n"),
      },
    });
  });

  return {
    sessionId: context.session.id,
    reportDate: context.report.date,
    sourceRegistryVersion: buildSourceRegistryVersion(nextRegistry),
    sourceRegistry: nextRegistry,
  };
}

export async function getLatestDailyReportRefinementSession(input: {
  date: string;
}) {
  const report = await loadDailyReportForRefinement(input.date);
  const session = await prisma.dailyReportRefinementSession.findFirst({
    where: {
      dailyReportId: report.id,
      status: { in: ["active", "saved"] },
    },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });

  if (!session) {
    return {
      session: null,
    };
  }

  const sourceRegistry = JSON.parse(session.sourceRegistryJson) as DailyReportSourceRegistryEntry[];
  const candidateMessage = [...session.messages].reverse().find((message) => message.candidateJson);
  let candidate: {
    messageId: string;
    content: DailyReportContent;
    renderedMarkdown: string;
  } | null = null;
  if (candidateMessage?.candidateJson) {
    try {
      const content = parseDailyReportContent(
        candidateMessage.candidateJson,
        Math.max(0, ...sourceRegistry.map((entry) => entry.sourceNumber)),
      );
      assertDailyReportSourceIdsExist(content, sourceRegistry);
      candidate = {
        messageId: candidateMessage.id,
        content,
        renderedMarkdown: renderDailyReportMarkdownFromRegistry(content, sourceRegistry, report.title),
      };
    } catch {
      candidate = null;
    }
  }

  return {
    session: {
      id: session.id,
      reportDate: report.date,
      sourceRegistryVersion: buildSourceRegistryVersion(sourceRegistry),
      sourceRegistry,
      candidate,
      messages: session.messages
        .filter((message) => message.role === "user" || message.role === "assistant")
        .map((message) => ({
          id: message.id,
          role: message.role as "user" | "assistant",
          content: message.candidateJson ? "候选稿已生成，可在预览区检查后保存。" : message.content,
        })),
    },
  };
}

export async function discardDailyReportRefinementSession(input: {
  date: string;
  sessionId: string;
}) {
  const report = await loadDailyReportForRefinement(input.date);
  const session = await prisma.dailyReportRefinementSession.findUnique({
    where: { id: input.sessionId },
  });

  if (!session || session.dailyReportId !== report.id) {
    throw new DailyReportRefinementError("not_found", "微调 session 不存在。", 404);
  }

  await prisma.dailyReportRefinementSession.update({
    where: { id: session.id },
    data: {
      status: "discarded",
      finishedAt: new Date(),
    },
  });

  return { discarded: true };
}

export async function saveDailyReportRefinementCandidate(input: {
  date: string;
  sessionId: string;
  messageId?: string | null;
}) {
  const report = await loadDailyReportForRefinement(input.date);

  if (report.status === "published") {
    throw new DailyReportRefinementError("invalid_report_status", "已发布日报不能直接覆盖，请先撤回为草稿。", 409);
  }

  const session = await prisma.dailyReportRefinementSession.findUnique({
    where: { id: input.sessionId },
  });

  if (!session || session.dailyReportId !== report.id) {
    throw new DailyReportRefinementError("not_found", "微调 session 不存在。", 404);
  }

  const message = input.messageId
    ? await prisma.dailyReportRefinementMessage.findFirst({
      where: {
        id: input.messageId,
        sessionId: session.id,
        candidateJson: { not: null },
      },
      orderBy: { createdAt: "desc" },
    })
    : await prisma.dailyReportRefinementMessage.findFirst({
      where: {
        sessionId: session.id,
        candidateJson: { not: null },
      },
      orderBy: { createdAt: "desc" },
    });

  if (!message?.candidateJson) {
    throw new DailyReportRefinementError("not_found", "没有可保存的微调候选内容。", 404);
  }

  const registry = JSON.parse(session.sourceRegistryJson) as DailyReportSourceRegistryEntry[];
  let content: DailyReportContent;
  try {
    content = await validateDailyReportContentForRegistry(message.candidateJson, registry);
  } catch (error) {
    throw toInvalidAiOutputError(error);
  }
  const renderedMarkdown = renderDailyReportMarkdownFromRegistry(content, registry, report.title);
  const registryByNumber = new Map(registry.map((entry) => [entry.sourceNumber, entry]));
  const sourceRows = getSectionSourceIds(content);

  const saved = await prisma.$transaction(async (tx) => {
    const updated = await tx.dailyReport.update({
      where: { id: report.id },
      data: {
        openingSummary: content.openingSummary,
        closingThought: content.closingThought,
        summaryJson: JSON.stringify(content),
        renderedMarkdown,
        generatedAt: new Date(),
        errorMessage: null,
      },
    });

    await tx.dailyReportSource.deleteMany({
      where: { dailyReportId: report.id },
    });
    await tx.dailyReportSource.createMany({
      data: sourceRows.flatMap((row) => {
        const source = registryByNumber.get(row.sourceId);
        if (!source) return [];
        return [{
          dailyReportId: report.id,
          sourceNumber: source.sourceNumber,
          sourceKey: source.sourceKey,
          itemId: source.itemId,
          clusterId: source.clusterId,
          sourceName: source.sourceName,
          title: source.title,
          url: source.url,
          sourceSummary: source.summary,
          sourcePublishedAt: source.publishedAt ? new Date(source.publishedAt) : null,
          sourceQualityScore: source.qualityScore,
          eventType: source.eventType,
          eventSubject: source.eventSubject,
          eventAction: source.eventAction,
          eventObject: source.eventObject,
          eventDate: source.eventDate,
          sectionName: row.sectionName,
          topic: row.topic,
        }];
      }),
    });

    await tx.dailyReportRefinementSession.update({
      where: { id: session.id },
      data: {
        status: "saved",
        currentDraftJson: JSON.stringify(content),
        finishedAt: new Date(),
      },
    });

    return updated;
  });

  invalidateDailyReportCache();
  return saved;
}

export async function publishDailyReport(date: string) {
  const report = await prisma.dailyReport.update({
    where: {
      date_timezone: {
        date: normalizeDailyReportDate(date),
        timezone: DAILY_REPORT_TIMEZONE,
      },
    },
    data: {
      status: "published",
      publishedAt: new Date(),
    },
  });
  invalidateDailyReportCache();
  return report;
}

export async function unpublishDailyReport(date: string) {
  const report = await prisma.dailyReport.update({
    where: {
      date_timezone: {
        date: normalizeDailyReportDate(date),
        timezone: DAILY_REPORT_TIMEZONE,
      },
    },
    data: {
      status: "draft",
      publishedAt: null,
    },
  });
  invalidateDailyReportCache();
  return report;
}

export async function deleteDailyReport(date: string) {
  const report = await prisma.dailyReport.delete({
    where: {
      date_timezone: {
        date: normalizeDailyReportDate(date),
        timezone: DAILY_REPORT_TIMEZONE,
      },
    },
  });
  invalidateDailyReportCache();
  return report;
}

export async function validateDailyReportContentForRegistry(rawContent: string, registry: DailyReportSourceRegistryEntry[]) {
  const maxSourceId = Math.max(0, ...registry.map((entry) => entry.sourceNumber));
  const content = parseDailyReportContent(rawContent, maxSourceId);
  assertDailyReportSourceIdsExist(content, registry);
  return content;
}

export function renderDailyReportMarkdownFromRegistry(content: DailyReportContent, registry: DailyReportSourceRegistryEntry[], title: string) {
  return renderDailyReportMarkdown(content, registryToCandidates(registry), title);
}
