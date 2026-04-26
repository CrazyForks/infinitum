import { beforeEach, describe, expect, it, vi } from "vitest";

import { prisma } from "@/lib/db";
import { executeDailyReportTask, generateDailyReport } from "@/lib/daily-report/service";

const { generateDailyReportMock, repairDailyReportJsonMock } = vi.hoisted(() => ({
  generateDailyReportMock: vi.fn(),
  repairDailyReportJsonMock: vi.fn(),
}));

vi.mock("@/lib/ai/provider", () => ({
  createAiProvider: vi.fn(() => ({
    generateDailyReport: generateDailyReportMock,
    repairDailyReportJson: repairDailyReportJsonMock,
  })),
}));

const REPORT_DATE = "2026-04-24";

function buildDailyReportOutput() {
  return JSON.stringify({
    openingSummary: "今天 AI 生态的重点变化集中在模型发布、开发者工具更新与工程实践调整，值得关注其对产品迭代和开发流程的影响。",
    sections: {
      今日大事: [{
        topic: "OpenAI 发布新模型",
        summary: "OpenAI 发布新模型，带来更强的推理和工具调用能力，短期内会影响开发者选型和产品功能设计。",
        whyImportant: "模型能力继续上探",
        sourceIds: [1],
      }],
      变更与实践: [{
        topic: "开发者工具更新",
        action: "关注 CLI 与 IDE 工作流是否需要调整。",
        sourceIds: [2],
      }],
      安全与风险: [],
      开源与工具: [],
      数据与洞察: [],
    },
    closingThought: "整体来看，今天的主线仍是模型能力与工程工具继续耦合，后续需要观察实际开发效率是否随之改善。",
  });
}

async function createReportCandidates() {
  const source = await prisma.source.create({
    data: {
      name: "Test Source",
      rssUrl: "https://example.com/feed.xml",
      siteUrl: "https://example.com",
    },
  });

  await prisma.item.createMany({
    data: [
      {
        sourceId: source.id,
        originalUrl: "https://example.com/a",
        canonicalUrl: "https://example.com/a",
        urlHash: "daily-item-a",
        dedupeSignature: "daily-item-a",
        originalTitle: "OpenAI 发布新模型",
        publishedAt: new Date("2026-04-24T01:00:00.000Z"),
        createdAt: new Date("2026-04-24T01:00:00.000Z"),
        status: "processed",
        moderationStatus: "allowed",
        summaryText: "OpenAI 发布新模型摘要",
        qualityScore: 90,
      },
      {
        sourceId: source.id,
        originalUrl: "https://example.com/b",
        canonicalUrl: "https://example.com/b",
        urlHash: "daily-item-b",
        dedupeSignature: "daily-item-b",
        originalTitle: "开发者工具更新",
        publishedAt: new Date("2026-04-24T02:00:00.000Z"),
        createdAt: new Date("2026-04-24T02:00:00.000Z"),
        status: "processed",
        moderationStatus: "allowed",
        summaryText: "开发者工具更新摘要",
        qualityScore: 80,
      },
    ],
  });
}

async function createPublishedReport() {
  return prisma.dailyReport.create({
    data: {
      date: REPORT_DATE,
      timezone: "Asia/Shanghai",
      status: "published",
      title: `${REPORT_DATE} AI 日报`,
      openingSummary: "已发布摘要",
      closingThought: "已发布观察",
      summaryJson: buildDailyReportOutput(),
      renderedMarkdown: "# 已发布日报\n",
      inputHash: "old-input",
      modelName: "old-model",
      publishedAt: new Date("2026-04-25T00:00:00.000Z"),
    },
  });
}

async function createDailyReportSchedule(input: { autoPublish: boolean }) {
  return prisma.taskSchedule.create({
    data: {
      key: "daily_report_default",
      enabled: false,
      cronExpression: "30 8 * * *",
      sourceConcurrency: 2,
      fullTextFetchThreshold: 80,
      perSourceItemLimit: 20,
      dailyReportCandidateLimit: 120,
      dailyReportOffsetDays: 0,
      dailyReportAutoPublish: input.autoPublish,
      timezone: "Asia/Shanghai",
      nextRunAt: new Date("2026-04-25T00:30:00.000Z"),
    },
  });
}

describe("daily report service", () => {
  beforeEach(async () => {
    generateDailyReportMock.mockReset();
    repairDailyReportJsonMock.mockReset();
    await prisma.dailyReportSource.deleteMany();
    await prisma.dailyReport.deleteMany();
    await prisma.item.deleteMany();
    await prisma.fetchRun.deleteMany();
    await prisma.backgroundTaskRun.deleteMany();
    await prisma.promptConfig.deleteMany();
    await prisma.modelApiConfig.deleteMany();
    await prisma.source.deleteMany();
    await prisma.sourceGroup.deleteMany();
    await prisma.blacklistKeyword.deleteMany();
    await prisma.taskSchedule.deleteMany();
  });

  it("turns an existing published report into a clean draft when regenerated", async () => {
    await createReportCandidates();
    await createPublishedReport();
    generateDailyReportMock.mockResolvedValue(buildDailyReportOutput());

    await generateDailyReport({ date: REPORT_DATE, force: true });

    const report = await prisma.dailyReport.findFirstOrThrow({
      where: { date: REPORT_DATE, timezone: "Asia/Shanghai" },
    });
    expect(report.status).toBe("draft");
    expect(report.publishedAt).toBeNull();
    expect(report.errorMessage).toBeNull();
    expect(report.renderedMarkdown).toContain(`# ${REPORT_DATE} AI 日报`);
  });

  it("publishes the report immediately when daily report auto publish is enabled", async () => {
    await createDailyReportSchedule({ autoPublish: true });
    await createReportCandidates();
    generateDailyReportMock.mockResolvedValue(buildDailyReportOutput());

    await generateDailyReport({ date: REPORT_DATE, force: true });

    const report = await prisma.dailyReport.findFirstOrThrow({
      where: { date: REPORT_DATE, timezone: "Asia/Shanghai" },
    });
    expect(report.status).toBe("published");
    expect(report.publishedAt).toBeInstanceOf(Date);
  });

  it("records candidate and selected counts in the daily report task timeline", async () => {
    await createReportCandidates();
    const taskRun = await prisma.backgroundTaskRun.create({
      data: {
        kind: "daily_report_generate",
        triggerType: "manual",
        status: "queued",
        label: "AI 日报生成",
        entityId: REPORT_DATE,
      },
    });
    generateDailyReportMock.mockResolvedValue(buildDailyReportOutput());

    await executeDailyReportTask(taskRun);

    const storedTaskRun = await prisma.backgroundTaskRun.findUniqueOrThrow({
      where: { id: taskRun.id },
    });
    const timeline = JSON.parse(storedTaskRun.taskTimelineJson ?? "[]") as Array<{
      key: string;
      label: string;
      metrics: Array<{ label: string; value: number }>;
    }>;

    expect(timeline).toMatchObject([
      {
        key: "daily_report_generate",
        label: "AI 日报生成",
        metrics: [{ label: "总候选数", value: 2 }],
      },
      {
        key: "task_finished",
        label: "已完成",
        metrics: [{ label: "最后入选数", value: 2 }],
      },
    ]);
  });

  it("preserves an existing report status and content when regeneration fails", async () => {
    await createReportCandidates();
    const existing = await createPublishedReport();
    const taskRun = await prisma.backgroundTaskRun.create({
      data: {
        kind: "daily_report_generate",
        triggerType: "manual",
        status: "queued",
        label: "AI 日报生成",
        entityId: REPORT_DATE,
      },
    });
    generateDailyReportMock.mockResolvedValue(JSON.stringify({
      openingSummary: "太短",
      sections: {},
      closingThought: "太短",
    }));
    repairDailyReportJsonMock.mockResolvedValue(null);

    await executeDailyReportTask(taskRun);

    const report = await prisma.dailyReport.findFirstOrThrow({
      where: { date: REPORT_DATE, timezone: "Asia/Shanghai" },
    });
    expect(report.id).toBe(existing.id);
    expect(report.status).toBe("published");
    expect(report.renderedMarkdown).toBe("# 已发布日报\n");
    expect(report.errorMessage).toContain("日报输出校验失败");
    expect(report.taskRunId).toBe(taskRun.id);
  });

  it("does not create a failed report placeholder when first generation fails", async () => {
    await createReportCandidates();
    const taskRun = await prisma.backgroundTaskRun.create({
      data: {
        kind: "daily_report_generate",
        triggerType: "manual",
        status: "queued",
        label: "AI 日报生成",
        entityId: REPORT_DATE,
      },
    });
    generateDailyReportMock.mockResolvedValue(JSON.stringify({
      openingSummary: "太短",
      sections: {},
      closingThought: "太短",
    }));
    repairDailyReportJsonMock.mockResolvedValue(null);

    await executeDailyReportTask(taskRun);

    await expect(prisma.dailyReport.findFirst({
      where: { date: REPORT_DATE, timezone: "Asia/Shanghai" },
    })).resolves.toBeNull();
    await expect(prisma.backgroundTaskRun.findUniqueOrThrow({
      where: { id: taskRun.id },
    })).resolves.toMatchObject({
      status: "failed",
      errorSummary: expect.stringContaining("日报输出校验失败"),
    });
  });
});
