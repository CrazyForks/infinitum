import { beforeEach, describe, expect, it, vi } from "vitest";

import { prisma } from "@/lib/db";
import {
  executeDailyReportTask,
  generateDailyReport,
} from "@/lib/daily-report/service";
import { getDailyReportByDate, listDailyReportCandidates } from "@/lib/daily-report/repository";

const {
  generateDailyReportMock,
  repairDailyReportJsonMock,
} = vi.hoisted(() => ({
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
    blocks: [
      {
        type: "text",
        title: "摘要",
        body: "今天 AI 生态的重点变化集中在模型发布、开发者工具更新与工程实践调整，值得关注其对产品迭代和开发流程的影响。",
      },
      {
        type: "section",
        title: "今日大事",
        items: [{
          title: "OpenAI 发布新模型",
          body: "OpenAI 发布新模型，带来更强的推理和工具调用能力，短期内会影响开发者选型和产品功能设计。",
          notes: [{ label: "重点", text: "模型能力继续上探" }],
          sourceIds: [1],
        }],
      },
      {
        type: "section",
        title: "变更与实践",
        items: [{
          title: "开发者工具更新",
          body: "开发者工具更新后，团队需要关注 CLI 与 IDE 工作流是否需要调整，以降低后续迁移成本。",
          sourceIds: [2],
        }],
      },
      {
        type: "text",
        title: "趋势观察",
        body: "整体来看，今天的主线仍是模型能力与工程工具继续耦合，后续需要观察实际开发效率是否随之改善。",
      },
    ],
  });
}

function buildDailyReportOutputWithRepeatedSources() {
  const parsed = JSON.parse(buildDailyReportOutput()) as {
    blocks: Array<
      | { type: "text"; title: string; body: string }
      | { type: "section"; title: string; items: Array<{ title: string; body: string; notes?: unknown[]; sourceIds: number[] }> }
    >;
  };

  return JSON.stringify({
    ...parsed,
    blocks: parsed.blocks.map((block) => {
      if (block.type !== "section" || block.title !== "变更与实践") return block;
      return {
        ...block,
        items: [
          {
            title: "OpenAI 发布新模型实践影响",
            body: "跟进同一事件对开发工作流的影响，避免只按模型发布本身判断后续工程投入。",
            sourceIds: [1],
          },
          {
            title: "开发者工具更新数据",
            body: "同一来源编号即使跨栏目出现也只应计为一个逻辑引用，避免日报来源数量被重复放大。",
            notes: [{ label: "关键数字", text: "2 个来源编号去重" }],
            sourceIds: [2],
          },
        ],
      };
    }),
  });
}

function getLastGeneratedDailyReportArticles() {
  const input = generateDailyReportMock.mock.calls.at(-1)?.[0] as {
    articles: Array<{
      id: number;
      itemId: string;
      clusterId: string | null;
      title: string;
      eventType: string | null;
      eventSubject: string | null;
      eventAction: string | null;
      eventObject: string | null;
      eventDate: string | null;
      qualityScore: number;
      candidateScore: number;
      sourceCount: number;
      itemCount: number;
    }>;
  } | undefined;

  return input?.articles ?? [];
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
      {
        sourceId: source.id,
        originalUrl: "https://example.com/c",
        canonicalUrl: "https://example.com/c",
        urlHash: "daily-item-c",
        dedupeSignature: "daily-item-c",
        originalTitle: "开发者社区发布插件规范",
        publishedAt: new Date("2026-04-24T03:00:00.000Z"),
        createdAt: new Date("2026-04-24T03:00:00.000Z"),
        status: "processed",
        moderationStatus: "allowed",
        summaryText: "开发者社区发布插件规范摘要",
        qualityScore: 75,
      },
      {
        sourceId: source.id,
        originalUrl: "https://example.com/d",
        canonicalUrl: "https://example.com/d",
        urlHash: "daily-item-d",
        dedupeSignature: "daily-item-d",
        originalTitle: "Claude Code 支持子代理工作流",
        publishedAt: new Date("2026-04-24T04:00:00.000Z"),
        createdAt: new Date("2026-04-24T04:00:00.000Z"),
        status: "processed",
        moderationStatus: "allowed",
        summaryText: "Claude Code 支持子代理工作流摘要",
        qualityScore: 70,
      },
    ],
  });
}

async function createEventSignatureCandidates() {
  const source = await prisma.source.create({
    data: {
      name: "Event Source",
      rssUrl: "https://event-source.example.com/feed.xml",
      siteUrl: "https://event-source.example.com",
    },
  });

  await prisma.item.createMany({
    data: [
      {
        sourceId: source.id,
        originalUrl: "https://event-source.example.com/duplicate-model-release",
        canonicalUrl: "https://event-source.example.com/duplicate-model-release",
        urlHash: "event-duplicate-model-release",
        dedupeSignature: "event-duplicate-model-release",
        originalTitle: "Anthropic 发布 Claude 4",
        publishedAt: new Date("2026-04-24T01:00:00.000Z"),
        createdAt: new Date("2026-04-24T01:00:00.000Z"),
        status: "processed",
        moderationStatus: "allowed",
        summaryText: "Anthropic 发布 Claude 4 摘要",
        qualityScore: 99,
        eventType: "release",
        eventSubject: "Anthropic",
        eventAction: "发布",
        eventObject: "Claude 4",
        eventDate: "2026-04-20",
      },
      {
        sourceId: source.id,
        originalUrl: "https://event-source.example.com/new-date-model-release",
        canonicalUrl: "https://event-source.example.com/new-date-model-release",
        urlHash: "event-new-date-model-release",
        dedupeSignature: "event-new-date-model-release",
        originalTitle: "Anthropic 发布 Claude 4 新进展",
        publishedAt: new Date("2026-04-24T02:00:00.000Z"),
        createdAt: new Date("2026-04-24T02:00:00.000Z"),
        status: "processed",
        moderationStatus: "allowed",
        summaryText: "Anthropic 发布 Claude 4 新进展摘要",
        qualityScore: 94,
        eventType: "release",
        eventSubject: "Anthropic",
        eventAction: "发布",
        eventObject: "Claude 4",
        eventDate: REPORT_DATE,
      },
      {
        sourceId: source.id,
        originalUrl: "https://event-source.example.com/model-update",
        canonicalUrl: "https://event-source.example.com/model-update",
        urlHash: "event-model-update",
        dedupeSignature: "event-model-update",
        originalTitle: "Anthropic 更新 Claude 4",
        publishedAt: new Date("2026-04-24T03:00:00.000Z"),
        createdAt: new Date("2026-04-24T03:00:00.000Z"),
        status: "processed",
        moderationStatus: "allowed",
        summaryText: "Anthropic 更新 Claude 4 摘要",
        qualityScore: 93,
        eventType: "update",
        eventSubject: "Anthropic",
        eventAction: "更新",
        eventObject: "Claude 4",
        eventDate: "2026-04-20",
      },
      {
        sourceId: source.id,
        originalUrl: "https://event-source.example.com/other-tool",
        canonicalUrl: "https://event-source.example.com/other-tool",
        urlHash: "event-other-tool",
        dedupeSignature: "event-other-tool",
        originalTitle: "独立工具发布",
        publishedAt: new Date("2026-04-24T04:00:00.000Z"),
        createdAt: new Date("2026-04-24T04:00:00.000Z"),
        status: "processed",
        moderationStatus: "allowed",
        summaryText: "独立工具发布摘要",
        qualityScore: 80,
        eventType: "launch",
        eventSubject: "独立团队",
        eventAction: "发布",
        eventObject: "独立工具",
        eventDate: REPORT_DATE,
      },
    ],
  });
}

async function createClusteredReportCandidates() {
  const [sourceA, sourceB, sourceC, sourceD] = await Promise.all([
    prisma.source.create({
      data: {
        name: "Source A",
        rssUrl: "https://source-a.example.com/feed.xml",
        siteUrl: "https://source-a.example.com",
      },
    }),
    prisma.source.create({
      data: {
        name: "Source B",
        rssUrl: "https://source-b.example.com/feed.xml",
        siteUrl: "https://source-b.example.com",
      },
    }),
    prisma.source.create({
      data: {
        name: "Source C",
        rssUrl: "https://source-c.example.com/feed.xml",
        siteUrl: "https://source-c.example.com",
      },
    }),
    prisma.source.create({
      data: {
        name: "Source D",
        rssUrl: "https://source-d.example.com/feed.xml",
        siteUrl: "https://source-d.example.com",
      },
    }),
  ]);
  const cluster = await prisma.contentCluster.create({
    data: {
      title: "多来源确认的模型发布",
      summary: "多家来源确认同一个模型发布事件，具备更高日报价值。",
      score: 89,
      itemCount: 3,
      latestPublishedAt: new Date("2026-04-24T05:00:00.000Z"),
      fingerprint: "daily-report-clustered-model-launch",
      eventType: "launch",
    },
  });

  await prisma.item.createMany({
    data: [
      {
        sourceId: sourceA.id,
        clusterId: cluster.id,
        originalUrl: "https://source-a.example.com/model-launch",
        canonicalUrl: "https://source-a.example.com/model-launch",
        urlHash: "clustered-item-a",
        dedupeSignature: "clustered-item-a",
        originalTitle: "模型发布 来源 A",
        publishedAt: new Date("2026-04-24T03:00:00.000Z"),
        createdAt: new Date("2026-04-24T03:00:00.000Z"),
        status: "processed",
        moderationStatus: "allowed",
        summaryText: "来源 A 模型发布摘要",
        qualityScore: 89,
      },
      {
        sourceId: sourceB.id,
        clusterId: cluster.id,
        originalUrl: "https://source-b.example.com/model-launch",
        canonicalUrl: "https://source-b.example.com/model-launch",
        urlHash: "clustered-item-b",
        dedupeSignature: "clustered-item-b",
        originalTitle: "模型发布 来源 B",
        publishedAt: new Date("2026-04-24T04:00:00.000Z"),
        createdAt: new Date("2026-04-24T04:00:00.000Z"),
        status: "processed",
        moderationStatus: "allowed",
        summaryText: "来源 B 模型发布摘要",
        qualityScore: 86,
      },
      {
        sourceId: sourceC.id,
        clusterId: cluster.id,
        originalUrl: "https://source-c.example.com/model-launch",
        canonicalUrl: "https://source-c.example.com/model-launch",
        urlHash: "clustered-item-c",
        dedupeSignature: "clustered-item-c",
        originalTitle: "模型发布 来源 C",
        publishedAt: new Date("2026-04-24T05:00:00.000Z"),
        createdAt: new Date("2026-04-24T05:00:00.000Z"),
        status: "processed",
        moderationStatus: "allowed",
        summaryText: "来源 C 模型发布摘要",
        qualityScore: 84,
      },
      {
        sourceId: sourceD.id,
        originalUrl: "https://source-d.example.com/single-high-score",
        canonicalUrl: "https://source-d.example.com/single-high-score",
        urlHash: "daily-single-high-score",
        dedupeSignature: "daily-single-high-score",
        originalTitle: "单篇高分工具更新",
        publishedAt: new Date("2026-04-24T06:00:00.000Z"),
        createdAt: new Date("2026-04-24T06:00:00.000Z"),
        status: "processed",
        moderationStatus: "allowed",
        summaryText: "单篇高分工具更新摘要",
        qualityScore: 95,
      },
    ],
  });

  return { cluster };
}

async function createCreatedAtBoundaryCandidates() {
  const source = await prisma.source.create({
    data: {
      name: "Date Boundary Source",
      rssUrl: "https://date-boundary.example.com/feed.xml",
      siteUrl: "https://date-boundary.example.com",
    },
  });

  await prisma.item.createMany({
    data: [
      {
        sourceId: source.id,
        originalUrl: "https://date-boundary.example.com/created-date-match",
        canonicalUrl: "https://date-boundary.example.com/created-date-match",
        urlHash: "daily-created-date-match",
        dedupeSignature: "daily-created-date-match",
        originalTitle: "入库日期命中日报日期",
        publishedAt: new Date("2026-04-20T01:00:00.000Z"),
        createdAt: new Date("2026-04-24T03:00:00.000Z"),
        status: "processed",
        moderationStatus: "allowed",
        summaryText: "入库日期命中日报日期摘要",
        qualityScore: 90,
        eventDate: "2026-04-20",
      },
      {
        sourceId: source.id,
        originalUrl: "https://date-boundary.example.com/created-date-second-match",
        canonicalUrl: "https://date-boundary.example.com/created-date-second-match",
        urlHash: "daily-created-date-second-match",
        dedupeSignature: "daily-created-date-second-match",
        originalTitle: "入库日期再次命中日报日期",
        publishedAt: new Date("2026-04-24T02:00:00.000Z"),
        createdAt: new Date("2026-04-24T04:00:00.000Z"),
        status: "processed",
        moderationStatus: "allowed",
        summaryText: "入库日期再次命中日报日期摘要",
        qualityScore: 88,
      },
      {
        sourceId: source.id,
        originalUrl: "https://date-boundary.example.com/event-date-only-match",
        canonicalUrl: "https://date-boundary.example.com/event-date-only-match",
        urlHash: "daily-event-date-only-match",
        dedupeSignature: "daily-event-date-only-match",
        originalTitle: "仅事件日期命中日报日期",
        publishedAt: new Date("2026-04-24T03:00:00.000Z"),
        createdAt: new Date("2026-04-20T03:00:00.000Z"),
        status: "processed",
        moderationStatus: "allowed",
        summaryText: "仅事件日期命中日报日期摘要",
        qualityScore: 99,
        eventDate: REPORT_DATE,
      },
      {
        sourceId: source.id,
        originalUrl: "https://date-boundary.example.com/published-date-only-match",
        canonicalUrl: "https://date-boundary.example.com/published-date-only-match",
        urlHash: "daily-published-date-only-match",
        dedupeSignature: "daily-published-date-only-match",
        originalTitle: "仅发布时间命中日报日期",
        publishedAt: new Date("2026-04-24T04:00:00.000Z"),
        createdAt: new Date("2026-04-20T04:00:00.000Z"),
        status: "processed",
        moderationStatus: "allowed",
        summaryText: "仅发布时间命中日报日期摘要",
        qualityScore: 98,
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

async function createHistoricalDailyReportSource(input: {
  date: string;
  status?: "draft" | "published" | "failed";
  itemId?: string | null;
  clusterId?: string | null;
  sourceKey?: string | null;
  title?: string;
  url?: string;
  eventType?: string | null;
  eventSubject?: string | null;
  eventAction?: string | null;
  eventObject?: string | null;
  eventDate?: string | null;
}) {
  const report = await prisma.dailyReport.create({
    data: {
      date: input.date,
      timezone: "Asia/Shanghai",
      status: input.status ?? "published",
      title: `${input.date} AI 日报`,
      openingSummary: "历史摘要",
      closingThought: "历史观察",
      summaryJson: buildDailyReportOutput(),
      renderedMarkdown: "# 历史日报\n",
      inputHash: `historical-${input.date}-${input.title ?? "source"}`,
      publishedAt: input.status === "draft" || input.status === "failed" ? null : new Date(`${input.date}T00:00:00.000Z`),
    },
  });

  return prisma.dailyReportSource.create({
    data: {
      dailyReportId: report.id,
      sourceNumber: 1,
      sourceKey: input.sourceKey ?? null,
      itemId: input.itemId ?? null,
      clusterId: input.clusterId ?? null,
      sourceName: "历史来源",
      title: input.title ?? "历史事件",
      url: input.url ?? `https://history.example.com/${input.date}`,
      sourceSummary: "历史来源摘要",
      sourcePublishedAt: new Date(`${input.date}T01:00:00.000Z`),
      sourceQualityScore: 90,
      eventType: input.eventType ?? null,
      eventSubject: input.eventSubject ?? null,
      eventAction: input.eventAction ?? null,
      eventObject: input.eventObject ?? null,
      eventDate: input.eventDate ?? null,
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
    await prisma.contentCluster.deleteMany();
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

  it("persists stable source numbers and source snapshots when generating a report", async () => {
    await createReportCandidates();
    generateDailyReportMock.mockResolvedValue(buildDailyReportOutput());

    const result = await generateDailyReport({ date: REPORT_DATE, force: true });
    const sources = await prisma.dailyReportSource.findMany({
      where: { dailyReportId: result.report?.id },
      orderBy: { sourceNumber: "asc" },
    });

    expect(sources.map((source) => source.sourceNumber)).toEqual([1, 2]);
    expect(sources[0]).toMatchObject({
      sourceKey: expect.stringMatching(/^item:/),
      sourceSummary: "OpenAI 发布新模型摘要",
      sourceQualityScore: 90,
    });
  });

  it("reports sourceCount as distinct referenced items", async () => {
    await createReportCandidates();
    generateDailyReportMock.mockResolvedValue(buildDailyReportOutputWithRepeatedSources());

    const result = await generateDailyReport({ date: REPORT_DATE, force: true });
    const rows = await prisma.dailyReportSource.count({
      where: { dailyReportId: result.report?.id },
    });
    const detail = await getDailyReportByDate(REPORT_DATE, true);

    expect(rows).toBe(3);
    expect(detail?.sourceCount).toBe(2);
  });

  it("counts expanded cluster items as report sources", async () => {
    await createClusteredReportCandidates();
    generateDailyReportMock.mockResolvedValue(JSON.stringify({
      blocks: [
        {
          type: "text",
          title: "摘要",
          body: "今天的 AI 生态重点集中在多来源确认的模型发布，多个独立来源围绕同一事件提供了互补信息，适合用于验证日报引用计数。",
        },
        {
          type: "section",
          title: "今日大事",
          items: [{
            title: "多来源模型发布",
            body: "多家来源确认同一个模型发布事件，可以用于观察聚合候选展开后的来源数量是否准确。",
            notes: [{ label: "重点", text: "多源确认" }],
            sourceIds: [1],
          }],
        },
        {
          type: "section",
          title: "变更与实践",
          items: [{
            title: "引用计数口径调整",
            body: "按展开后的实际单条内容核算日报来源数量，避免把一个聚合候选误读为一个来源。",
            sourceIds: [1],
          }],
        },
        {
          type: "text",
          title: "趋势观察",
          body: "多来源引用应按展开后的单条内容计数，避免把一个聚合候选误读为一个来源。",
        },
      ],
    }));

    const result = await generateDailyReport({ date: REPORT_DATE, force: true });
    const rows = await prisma.dailyReportSource.count({
      where: { dailyReportId: result.report?.id },
    });
    const detail = await getDailyReportByDate(REPORT_DATE, true);

    expect(rows).toBe(6);
    expect(detail?.sourceCount).toBe(3);
  });

  it("ranks daily report candidates by daily composite score and collapses clustered items", async () => {
    const { cluster } = await createClusteredReportCandidates();

    const candidates = await listDailyReportCandidates(REPORT_DATE, 2);

    expect(candidates).toHaveLength(2);
    expect(candidates[0]).toMatchObject({
      clusterId: cluster.id,
      title: "多来源确认的模型发布",
      summary: "多家来源确认同一个模型发布事件，具备更高日报价值。",
      eventType: "launch",
      sourceCount: 3,
      itemCount: 3,
    });
    expect(candidates[0]?.candidateScore).toBeGreaterThan(candidates[1]?.candidateScore ?? 0);
    expect(candidates[1]).toMatchObject({
      clusterId: null,
      title: "单篇高分工具更新",
      sourceCount: 1,
      itemCount: 1,
    });
    expect(candidates.filter((candidate) => candidate.clusterId === cluster.id)).toHaveLength(1);
  });

  it("expands selected clustered candidates into all clustered source links", async () => {
    const { cluster } = await createClusteredReportCandidates();
    generateDailyReportMock.mockResolvedValue(buildDailyReportOutput());

    const result = await generateDailyReport({ date: REPORT_DATE, force: true });
    const clusteredSources = await prisma.dailyReportSource.findMany({
      where: {
        dailyReportId: result.report?.id,
        sourceNumber: 1,
      },
      orderBy: { title: "asc" },
    });

    expect(clusteredSources).toHaveLength(3);
    expect(new Set(clusteredSources.map((source) => source.clusterId))).toEqual(new Set([cluster.id]));
    expect(clusteredSources.map((source) => source.title)).toEqual([
      "模型发布 来源 A",
      "模型发布 来源 B",
      "模型发布 来源 C",
    ]);
    expect(result.report?.renderedMarkdown).toContain("[模型发布 来源 A](https://source-a.example.com/model-launch)");
    expect(result.report?.renderedMarkdown).toContain("[模型发布 来源 B](https://source-b.example.com/model-launch)");
    expect(result.report?.renderedMarkdown).toContain("[模型发布 来源 C](https://source-c.example.com/model-launch)");
  });

  it("uses created date for daily report candidate boundaries", async () => {
    await createCreatedAtBoundaryCandidates();

    const candidates = await listDailyReportCandidates(REPORT_DATE, 10);
    const titles = candidates.map((candidate) => candidate.title);

    expect(titles).toContain("入库日期命中日报日期");
    expect(titles).toContain("入库日期再次命中日报日期");
    expect(titles).not.toContain("仅事件日期命中日报日期");
    expect(titles).not.toContain("仅发布时间命中日报日期");
  });

  it("limits scheduled daily report candidates and expanded cluster sources to selected groups", async () => {
    const [groupA, groupB] = await Promise.all([
      prisma.sourceGroup.create({ data: { name: "Scoped A" } }),
      prisma.sourceGroup.create({ data: { name: "Scoped B" } }),
    ]);
    const [sourceA, sourceB] = await Promise.all([
      prisma.source.create({
        data: {
          name: "Scoped Source A",
          rssUrl: "https://scoped-a.example.com/feed.xml",
          siteUrl: "https://scoped-a.example.com",
          groupId: groupA.id,
        },
      }),
      prisma.source.create({
        data: {
          name: "Scoped Source B",
          rssUrl: "https://scoped-b.example.com/feed.xml",
          siteUrl: "https://scoped-b.example.com",
          groupId: groupB.id,
        },
      }),
    ]);
    const cluster = await prisma.contentCluster.create({
      data: {
        title: "分组内聚合候选",
        summary: "分组内聚合候选摘要",
        score: 90,
        itemCount: 2,
        latestPublishedAt: new Date("2026-04-24T03:00:00.000Z"),
        fingerprint: "daily-report-scoped-cluster",
      },
    });
    await prisma.item.createMany({
      data: [
        {
          sourceId: sourceA.id,
          clusterId: cluster.id,
          originalUrl: "https://scoped-a.example.com/cluster",
          canonicalUrl: "https://scoped-a.example.com/cluster",
          urlHash: "scoped-a-cluster",
          dedupeSignature: "scoped-a-cluster",
          originalTitle: "分组 A 聚合条目",
          publishedAt: new Date("2026-04-24T01:00:00.000Z"),
          createdAt: new Date("2026-04-24T01:00:00.000Z"),
          status: "processed",
          moderationStatus: "allowed",
          summaryText: "分组 A 聚合条目摘要",
          qualityScore: 95,
        },
        {
          sourceId: sourceB.id,
          clusterId: cluster.id,
          originalUrl: "https://scoped-b.example.com/cluster",
          canonicalUrl: "https://scoped-b.example.com/cluster",
          urlHash: "scoped-b-cluster",
          dedupeSignature: "scoped-b-cluster",
          originalTitle: "分组 B 聚合条目",
          publishedAt: new Date("2026-04-24T02:00:00.000Z"),
          createdAt: new Date("2026-04-24T02:00:00.000Z"),
          status: "processed",
          moderationStatus: "allowed",
          summaryText: "分组 B 聚合条目摘要",
          qualityScore: 94,
        },
        {
          sourceId: sourceA.id,
          originalUrl: "https://scoped-a.example.com/standalone",
          canonicalUrl: "https://scoped-a.example.com/standalone",
          urlHash: "scoped-a-standalone",
          dedupeSignature: "scoped-a-standalone",
          originalTitle: "分组 A 独立条目",
          publishedAt: new Date("2026-04-24T03:00:00.000Z"),
          createdAt: new Date("2026-04-24T03:00:00.000Z"),
          status: "processed",
          moderationStatus: "allowed",
          summaryText: "分组 A 独立条目摘要",
          qualityScore: 70,
        },
      ],
    });
    await prisma.taskSchedule.create({
      data: {
        key: "daily_report_default",
        enabled: false,
        cronExpression: "30 8 * * *",
        sourceConcurrency: 2,
        fullTextFetchThreshold: 80,
        perSourceItemLimit: 20,
        dailyReportCandidateLimit: 10,
        dailyReportOffsetDays: 0,
        dailyReportAutoPublish: false,
        dailyReportGroupIdsJson: JSON.stringify([groupA.id]),
        timezone: "Asia/Shanghai",
        nextRunAt: new Date("2026-04-25T00:30:00.000Z"),
      },
    });
    generateDailyReportMock.mockResolvedValue(buildDailyReportOutput());

    const result = await generateDailyReport({ date: REPORT_DATE, force: true });
    const articleTitles = getLastGeneratedDailyReportArticles().map((article) => article.title);
    const savedSources = await prisma.dailyReportSource.findMany({
      where: { dailyReportId: result.report?.id },
      orderBy: { title: "asc" },
    });

    expect(articleTitles).toEqual(["分组 A 聚合条目", "分组 A 独立条目"]);
    expect(savedSources.map((source) => source.title)).toEqual(["分组 A 独立条目", "分组 A 聚合条目"]);
    expect(savedSources.map((source) => source.url)).not.toContain("https://scoped-b.example.com/cluster");
  });

  it("filters candidates that match a source from the previous 7 days by cluster", async () => {
    const { cluster } = await createClusteredReportCandidates();
    await createReportCandidates();
    await createHistoricalDailyReportSource({
      date: "2026-04-20",
      clusterId: cluster.id,
      sourceKey: `cluster:${cluster.id}`,
      title: "多来源确认的模型发布",
    });
    generateDailyReportMock.mockResolvedValue(buildDailyReportOutput());

    await generateDailyReport({ date: REPORT_DATE, force: true });

    const articles = getLastGeneratedDailyReportArticles();
    expect(articles).toHaveLength(5);
    expect(articles.map((article) => article.id)).toEqual([1, 2, 3, 4, 5]);
    expect(articles.some((article) => article.clusterId === cluster.id)).toBe(false);
    expect(articles.map((article) => article.title)).not.toContain("多来源确认的模型发布");
  });

  it("filters different-source candidates with the same strict event signature from recent reports", async () => {
    await createEventSignatureCandidates();
    await createHistoricalDailyReportSource({
      date: "2026-04-20",
      title: "另一来源报道 Anthropic 发布 Claude 4",
      eventType: "release",
      eventSubject: "Anthropic",
      eventAction: "发布",
      eventObject: "Claude 4",
      eventDate: "2026-04-20",
    });
    generateDailyReportMock.mockResolvedValue(buildDailyReportOutput());

    await generateDailyReport({ date: REPORT_DATE, force: true });

    const articles = getLastGeneratedDailyReportArticles();
    expect(articles.map((article) => article.title)).not.toContain("Anthropic 发布 Claude 4");
    expect(articles.map((article) => article.title)).toEqual(expect.arrayContaining([
      "Anthropic 发布 Claude 4 新进展",
      "Anthropic 更新 Claude 4",
      "独立工具发布",
    ]));
  });

  it("keeps same-subject follow-ups when event date or action changed", async () => {
    await createEventSignatureCandidates();
    await createHistoricalDailyReportSource({
      date: "2026-04-20",
      title: "另一来源报道 Anthropic 发布 Claude 4",
      eventType: "release",
      eventSubject: "Anthropic",
      eventAction: "发布",
      eventObject: "Claude 4",
      eventDate: "2026-04-20",
    });
    generateDailyReportMock.mockResolvedValue(buildDailyReportOutput());

    await generateDailyReport({ date: REPORT_DATE, force: true });

    const articles = getLastGeneratedDailyReportArticles();
    expect(articles).toEqual(expect.arrayContaining([
      expect.objectContaining({
        title: "Anthropic 发布 Claude 4 新进展",
        eventDate: REPORT_DATE,
      }),
      expect.objectContaining({
        title: "Anthropic 更新 Claude 4",
        eventAction: "更新",
      }),
    ]));
  });

  it("does not filter candidates against reports older than 7 days", async () => {
    await createEventSignatureCandidates();
    await createHistoricalDailyReportSource({
      date: "2026-04-16",
      title: "另一来源报道 Anthropic 发布 Claude 4",
      eventType: "release",
      eventSubject: "Anthropic",
      eventAction: "发布",
      eventObject: "Claude 4",
      eventDate: "2026-04-20",
    });
    generateDailyReportMock.mockResolvedValue(buildDailyReportOutput());

    await generateDailyReport({ date: REPORT_DATE, force: true });

    expect(getLastGeneratedDailyReportArticles().map((article) => article.title)).toContain("Anthropic 发布 Claude 4");
  });

  it("does not filter candidates against failed historical reports", async () => {
    await createEventSignatureCandidates();
    await createHistoricalDailyReportSource({
      date: "2026-04-20",
      status: "failed",
      title: "另一来源报道 Anthropic 发布 Claude 4",
      eventType: "release",
      eventSubject: "Anthropic",
      eventAction: "发布",
      eventObject: "Claude 4",
      eventDate: "2026-04-20",
    });
    generateDailyReportMock.mockResolvedValue(buildDailyReportOutput());

    await generateDailyReport({ date: REPORT_DATE, force: true });

    expect(getLastGeneratedDailyReportArticles().map((article) => article.title)).toContain("Anthropic 发布 Claude 4");
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
        metrics: [{ label: "总候选数", value: 4 }],
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
