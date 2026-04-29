import { beforeEach, describe, expect, it, vi } from "vitest";

import { prisma } from "@/lib/db";
import {
  addDailyReportRefinementSources,
  executeDailyReportTask,
  generateDailyReport,
  getLatestDailyReportRefinementSession,
  saveDailyReportRefinementCandidate,
  searchDailyReportRefinementSources,
  streamDailyReportRefinement,
} from "@/lib/daily-report/service";

const {
  generateDailyReportMock,
  repairDailyReportJsonMock,
  streamDailyReportRefinementMock,
  streamDailyReportRefinementChatMock,
} = vi.hoisted(() => ({
  generateDailyReportMock: vi.fn(),
  repairDailyReportJsonMock: vi.fn(),
  streamDailyReportRefinementMock: vi.fn(),
  streamDailyReportRefinementChatMock: vi.fn(),
}));

vi.mock("@/lib/ai/provider", () => ({
  createAiProvider: vi.fn(() => ({
    generateDailyReport: generateDailyReportMock,
    repairDailyReportJson: repairDailyReportJsonMock,
    streamDailyReportRefinement: streamDailyReportRefinementMock,
    streamDailyReportRefinementChat: streamDailyReportRefinementChatMock,
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

function buildRefinedDailyReportOutput() {
  const parsed = JSON.parse(buildDailyReportOutput()) as {
    openingSummary: string;
    sections: {
      今日大事: Array<{ topic: string; summary: string; whyImportant: string; sourceIds: number[] }>;
      变更与实践: Array<{ topic: string; action: string; sourceIds: number[] }>;
      安全与风险: unknown[];
      开源与工具: unknown[];
      数据与洞察: unknown[];
    };
    closingThought: string;
  };

  return JSON.stringify({
    ...parsed,
    openingSummary: "微调后，今天 AI 生态的重点变化被重新组织为更紧凑的摘要，强调模型发布与开发者工具更新对产品迭代的影响。",
    sections: {
      ...parsed.sections,
      今日大事: [{
        ...parsed.sections.今日大事[0],
        summary: "微调后的 OpenAI 新模型条目更聚焦推理能力和工具调用变化，便于管理员快速判断发布价值。",
      }],
    },
  });
}

function buildRefinedDailyReportOutputWithRecalledSource() {
  const parsed = JSON.parse(buildDailyReportOutput()) as {
    openingSummary: string;
    sections: {
      今日大事: Array<{ topic: string; summary: string; whyImportant: string; sourceIds: number[] }>;
      变更与实践: Array<{ topic: string; action: string; sourceIds: number[] }>;
      安全与风险: unknown[];
      开源与工具: Array<{ topic: string; reason: string; sourceIds: number[] }>;
      数据与洞察: unknown[];
    };
    closingThought: string;
  };

  return JSON.stringify({
    ...parsed,
    sections: {
      ...parsed.sections,
      开源与工具: [{
        topic: "Claude Code 子代理工作流",
        reason: "新增召回来源显示 Claude Code 子代理工作流正在改善复杂任务拆分和上下文协作。",
        sourceIds: [4],
      }],
    },
  });
}

function createStreamFromText(text: string) {
  return (async function* stream() {
    yield text;
  })();
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
    streamDailyReportRefinementMock.mockReset();
    streamDailyReportRefinementChatMock.mockReset();
    await prisma.dailyReportRefinementMessage.deleteMany();
    await prisma.dailyReportRefinementSession.deleteMany();
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

  it("streams a refinement candidate and saves it to a draft report", async () => {
    await createReportCandidates();
    generateDailyReportMock.mockResolvedValue(buildDailyReportOutput());
    const result = await generateDailyReport({ date: REPORT_DATE, force: true });
    streamDailyReportRefinementMock.mockReturnValue(createStreamFromText(buildRefinedDailyReportOutput()));

    const events = [];
    for await (const event of streamDailyReportRefinement({
      date: REPORT_DATE,
      instruction: "压缩开头摘要，保留来源。",
      mode: "generate",
    })) {
      events.push(event);
    }

    const candidate = events.find((event) => event.event === "candidate");
    expect(candidate).toMatchObject({
      event: "candidate",
      messageId: expect.any(String),
    });
    expect(streamDailyReportRefinementMock).toHaveBeenCalledWith(expect.objectContaining({
      currentContent: expect.objectContaining({
        openingSummary: expect.stringContaining("今天 AI 生态"),
      }),
      sourceRegistry: expect.arrayContaining([
        expect.objectContaining({ sourceNumber: 1, summary: "OpenAI 发布新模型摘要" }),
      ]),
      instruction: "压缩开头摘要，保留来源。",
    }));

    const sessionEvent = events.find((event) => event.event === "session");
    if (!sessionEvent || sessionEvent.event !== "session" || !candidate || candidate.event !== "candidate") {
      throw new Error("missing refinement events");
    }

    await saveDailyReportRefinementCandidate({
      date: REPORT_DATE,
      sessionId: sessionEvent.sessionId,
      messageId: candidate.messageId,
    });

    const report = await prisma.dailyReport.findUniqueOrThrow({
      where: { id: result.report?.id },
    });
    const savedSources = await prisma.dailyReportSource.findMany({
      where: { dailyReportId: report.id },
      orderBy: { sourceNumber: "asc" },
    });

    expect(report.openingSummary).toContain("微调后");
    expect(report.renderedMarkdown).toContain("微调后的 OpenAI 新模型条目");
    expect(savedSources.map((source) => source.sourceNumber)).toEqual([1, 2]);
  });

  it("restores generated refinement candidates without exposing raw JSON as chat text", async () => {
    await createReportCandidates();
    generateDailyReportMock.mockResolvedValue(buildDailyReportOutput());
    await generateDailyReport({ date: REPORT_DATE, force: true });
    streamDailyReportRefinementMock.mockReturnValue(createStreamFromText(buildRefinedDailyReportOutput()));

    const events = [];
    for await (const event of streamDailyReportRefinement({
      date: REPORT_DATE,
      instruction: "确认，生成候选稿。",
      mode: "generate",
    })) {
      events.push(event);
    }

    const candidate = events.find((event) => event.event === "candidate");
    if (!candidate || candidate.event !== "candidate") {
      throw new Error("missing refinement candidate");
    }

    const restoredSession = await getLatestDailyReportRefinementSession({ date: REPORT_DATE });

    expect(restoredSession.session?.candidate).toMatchObject({
      messageId: candidate.messageId,
      content: expect.objectContaining({
        openingSummary: expect.stringContaining("微调后"),
      }),
      renderedMarkdown: expect.stringContaining("微调后的 OpenAI 新模型条目"),
    });
    expect(restoredSession.session?.messages).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: candidate.messageId,
        role: "assistant",
        content: "候选稿已生成，可在预览区检查后保存。",
      }),
    ]));
    expect(restoredSession.session?.messages.some((message) => message.content.includes("\"openingSummary\""))).toBe(false);
  });

  it("stores chat refinement turns without generating a candidate", async () => {
    await createReportCandidates();
    generateDailyReportMock.mockResolvedValue(buildDailyReportOutput());
    await generateDailyReport({ date: REPORT_DATE, force: true });
    streamDailyReportRefinementChatMock.mockReturnValue(createStreamFromText("可以先把安全风险提前，但需要确认是否压缩今日大事。"));

    const events = [];
    for await (const event of streamDailyReportRefinement({
      date: REPORT_DATE,
      instruction: "先讨论一下结构调整。",
      mode: "chat",
    })) {
      events.push(event);
    }

    expect(events).toContainEqual(expect.objectContaining({
      event: "message_delta",
      text: expect.stringContaining("安全风险"),
    }));
    expect(events.some((event) => event.event === "candidate")).toBe(false);
    expect(streamDailyReportRefinementChatMock).toHaveBeenCalledWith(expect.objectContaining({
      currentContent: expect.objectContaining({
        openingSummary: expect.stringContaining("今天 AI 生态"),
      }),
      sourceRegistry: expect.arrayContaining([
        expect.objectContaining({ sourceNumber: 1, summary: "OpenAI 发布新模型摘要" }),
      ]),
      instruction: "先讨论一下结构调整。",
    }));

    const messages = await prisma.dailyReportRefinementMessage.findMany({
      orderBy: { createdAt: "asc" },
    });
    expect(messages.map((message) => message.role)).toEqual(["user", "assistant"]);
    expect(messages[1].candidateJson).toBeNull();
  });

  it("recalls unselected sources by keyword and allows generated candidates to cite added sources", async () => {
    await createReportCandidates();
    generateDailyReportMock.mockResolvedValue(buildDailyReportOutput());
    const result = await generateDailyReport({ date: REPORT_DATE, force: true });

    const selectedSearch = await searchDailyReportRefinementSources({
      date: REPORT_DATE,
      query: "OpenAI",
    });
    expect(selectedSearch.sources).toEqual([]);

    const search = await searchDailyReportRefinementSources({
      date: REPORT_DATE,
      sessionId: selectedSearch.sessionId,
      query: "Claude",
    });
    expect(search.sources).toHaveLength(1);
    expect(search.sources[0]).toMatchObject({
      sourceKey: expect.stringMatching(/^item:/),
      title: "Claude Code 支持子代理工作流",
    });

    const selectedNumberSearch = await searchDailyReportRefinementSources({
      date: REPORT_DATE,
      sessionId: selectedSearch.sessionId,
      query: "#1",
    });
    expect(selectedNumberSearch.sources).toEqual([]);

    const numberSearch = await searchDailyReportRefinementSources({
      date: REPORT_DATE,
      sessionId: selectedSearch.sessionId,
      query: "#4",
    });
    expect(numberSearch.sources).toHaveLength(1);
    expect(numberSearch.sources[0]).toMatchObject({
      candidateNumber: 4,
      title: "Claude Code 支持子代理工作流",
    });

    const added = await addDailyReportRefinementSources({
      date: REPORT_DATE,
      sessionId: search.sessionId,
      sourceKeys: [search.sources[0].sourceKey],
    });
    expect(added.sourceRegistry).toEqual(expect.arrayContaining([
      expect.objectContaining({
        sourceNumber: 4,
        title: "Claude Code 支持子代理工作流",
      }),
    ]));

    const restoredSession = await getLatestDailyReportRefinementSession({ date: REPORT_DATE });
    expect(restoredSession.session).toMatchObject({
      id: search.sessionId,
      sourceRegistry: expect.arrayContaining([
        expect.objectContaining({
          sourceNumber: 4,
          title: "Claude Code 支持子代理工作流",
        }),
      ]),
    });

    streamDailyReportRefinementChatMock.mockReturnValue(createStreamFromText("可以把 #4 纳入开源与工具，作为复杂任务拆分能力的补充背景。"));
    for await (const event of streamDailyReportRefinement({
      date: REPORT_DATE,
      sessionId: search.sessionId,
      instruction: "先基于刚加入的 Claude Code 来源讨论怎么补充。",
      mode: "chat",
    })) {
      expect(event.event).toBeTruthy();
      // Drain stream.
    }

    expect(streamDailyReportRefinementChatMock).toHaveBeenCalledWith(expect.objectContaining({
      sourceRegistry: expect.arrayContaining([
        expect.objectContaining({
          sourceNumber: 4,
          title: "Claude Code 支持子代理工作流",
        }),
      ]),
      messages: expect.arrayContaining([
        expect.objectContaining({
          role: "system",
          content: expect.stringContaining("#4 Claude Code 支持子代理工作流"),
        }),
      ]),
    }));

    streamDailyReportRefinementMock.mockReturnValue(createStreamFromText(buildRefinedDailyReportOutputWithRecalledSource()));
    const events = [];
    for await (const event of streamDailyReportRefinement({
      date: REPORT_DATE,
      sessionId: search.sessionId,
      instruction: "把 Claude Code 子代理补到开源与工具。",
      mode: "generate",
    })) {
      events.push(event);
    }

    const candidate = events.find((event) => event.event === "candidate");
    if (!candidate || candidate.event !== "candidate") {
      throw new Error("missing refinement candidate");
    }

    await saveDailyReportRefinementCandidate({
      date: REPORT_DATE,
      sessionId: search.sessionId,
      messageId: candidate.messageId,
    });

    const savedSources = await prisma.dailyReportSource.findMany({
      where: { dailyReportId: result.report?.id },
      orderBy: { sourceNumber: "asc" },
    });
    expect(savedSources.map((source) => source.sourceNumber)).toEqual([1, 2, 4]);
    expect(savedSources.at(-1)).toMatchObject({
      title: "Claude Code 支持子代理工作流",
      sourceSummary: "Claude Code 支持子代理工作流摘要",
    });

    const restoredAfterSave = await getLatestDailyReportRefinementSession({ date: REPORT_DATE });
    expect(restoredAfterSave.session).toMatchObject({
      id: search.sessionId,
      sourceRegistry: expect.arrayContaining([
        expect.objectContaining({
          sourceNumber: 4,
          title: "Claude Code 支持子代理工作流",
        }),
      ]),
      messages: expect.arrayContaining([
        expect.objectContaining({
          role: "user",
          content: "先基于刚加入的 Claude Code 来源讨论怎么补充。",
        }),
        expect.objectContaining({
          role: "assistant",
          content: expect.stringContaining("可以把 #4 纳入开源与工具"),
        }),
      ]),
    });
  });

  it("recovers stable source numbers for an existing report before refinement", async () => {
    await createReportCandidates();
    generateDailyReportMock.mockResolvedValue(buildDailyReportOutput());
    const result = await generateDailyReport({ date: REPORT_DATE, force: true });
    await prisma.dailyReportSource.updateMany({
      where: { dailyReportId: result.report?.id },
      data: {
        sourceNumber: null,
        sourceKey: null,
        sourceSummary: null,
      },
    });
    streamDailyReportRefinementMock.mockReturnValue(createStreamFromText(buildRefinedDailyReportOutput()));

    const events = [];
    for await (const event of streamDailyReportRefinement({
      date: REPORT_DATE,
      instruction: "基于当前日报继续微调。",
      mode: "generate",
    })) {
      events.push(event);
    }

    expect(events.some((event) => event.event === "candidate")).toBe(true);
    expect(streamDailyReportRefinementMock).toHaveBeenCalledWith(expect.objectContaining({
      sourceRegistry: expect.arrayContaining([
        expect.objectContaining({ sourceNumber: 1, summary: "OpenAI 发布新模型摘要" }),
        expect.objectContaining({ sourceNumber: 2, summary: "开发者工具更新摘要" }),
      ]),
    }));

    const recoveredSources = await prisma.dailyReportSource.findMany({
      where: { dailyReportId: result.report?.id },
      orderBy: { sourceNumber: "asc" },
    });
    expect(recoveredSources.map((source) => source.sourceNumber)).toEqual([1, 2]);
    expect(recoveredSources[0].sourceSummary).toBe("OpenAI 发布新模型摘要");
  });

  it("returns invalid_ai_output when a refinement candidate cannot be validated", async () => {
    await createReportCandidates();
    generateDailyReportMock.mockResolvedValue(buildDailyReportOutput());
    await generateDailyReport({ date: REPORT_DATE, force: true });
    streamDailyReportRefinementMock.mockReturnValue(createStreamFromText(JSON.stringify({
      openingSummary: "太短",
      sections: {},
      closingThought: "太短",
    })));
    repairDailyReportJsonMock.mockResolvedValue(null);

    const events = [];
    for await (const event of streamDailyReportRefinement({
      date: REPORT_DATE,
      instruction: "输出一个非法结构。",
      mode: "generate",
    })) {
      events.push(event);
    }

    expect(events).toContainEqual(expect.objectContaining({
      event: "error",
      code: "invalid_ai_output",
    }));
    expect(events).toContainEqual({ event: "done", ok: false });
  });

  it("does not save a refinement candidate directly over a published report", async () => {
    await createReportCandidates();
    generateDailyReportMock.mockResolvedValue(buildDailyReportOutput());
    const result = await generateDailyReport({ date: REPORT_DATE, force: true });
    streamDailyReportRefinementMock.mockReturnValue(createStreamFromText(buildRefinedDailyReportOutput()));

    const events = [];
    for await (const event of streamDailyReportRefinement({
      date: REPORT_DATE,
      instruction: "压缩开头摘要。",
      mode: "generate",
    })) {
      events.push(event);
    }
    const sessionEvent = events.find((event) => event.event === "session");
    const candidate = events.find((event) => event.event === "candidate");
    if (!sessionEvent || sessionEvent.event !== "session" || !candidate || candidate.event !== "candidate") {
      throw new Error("missing refinement events");
    }

    await prisma.dailyReport.update({
      where: { id: result.report?.id },
      data: {
        status: "published",
        publishedAt: new Date("2026-04-25T00:00:00.000Z"),
      },
    });

    await expect(saveDailyReportRefinementCandidate({
      date: REPORT_DATE,
      sessionId: sessionEvent.sessionId,
      messageId: candidate.messageId,
    })).rejects.toThrow(/先撤回为草稿/);
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
