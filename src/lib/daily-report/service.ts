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
  type DailyReportSectionName,
} from "@/lib/daily-report/types";
import { parseDailyReportContent } from "@/lib/daily-report/validator";
import { getIngestionRuntimeConfig } from "@/lib/settings/runtime-service";
import { DEFAULT_DAILY_REPORT_TASK_LABEL, type TaskTimelineNodeSnapshot } from "@/lib/tasks/types";
import { enqueueTaskRun, ensureDefaultDailyReportSchedule, updateTaskRun } from "@/lib/tasks/service";

const MIN_CANDIDATE_COUNT = 2;

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

function countSelectedDailyReportCandidates(content: DailyReportContent) {
  const selectedIds = new Set<number>();

  for (const row of getSectionSourceIds(content)) {
    selectedIds.add(row.sourceId);
  }

  return selectedIds.size;
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
          itemId: candidate.itemId,
          clusterId: candidate.clusterId,
          sourceName: candidate.sourceName,
          title: candidate.title,
          url: candidate.url,
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
