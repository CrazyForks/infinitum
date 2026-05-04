import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AiProvider } from "@/lib/ai/provider";
import { normalizeFingerprint } from "@/lib/clusters/helpers";
import { executeClusterSummaryTask } from "@/lib/clusters/service";
import { prisma } from "@/lib/db";
import {
  enqueueItemReanalyzeTask,
  enqueueItemRegenerationTask,
  executeItemReanalyzeTask,
  executeItemRegenerationTask,
  regenerateItemContent,
} from "@/lib/items/service";

function buildEventSignature(
  overrides: Partial<{
    eventType: "release" | "launch" | "update" | "funding" | "acquisition" | "partnership" | "policy" | "research" | "security" | "other" | null;
    eventSubject: string | null;
    eventAction: string | null;
    eventObject: string | null;
    eventDate: string | null;
  }> = {},
) {
  return {
    eventType: null,
    eventSubject: null,
    eventAction: null,
    eventObject: null,
    eventDate: null,
    ...overrides,
  };
}

function buildAiProviderMock(
  overrides?: Partial<{
    summarizeItem: ReturnType<typeof vi.fn>;
    enrichContent: ReturnType<typeof vi.fn>;
    summarizeCluster: ReturnType<typeof vi.fn>;
    matchClusterCandidate: ReturnType<typeof vi.fn>;
  }>,
): AiProvider {
  const base = {
    summarizeItem: vi.fn().mockResolvedValue("默认条目摘要"),
    enrichContent: vi.fn().mockResolvedValue({
      translatedTitle: "默认中文标题",
      moderationStatus: "allowed",
      moderationReason: null,
      moderationDetail: null,
      qualityScore: 80,
      qualityRationale: "高质量",
      eventSignature: buildEventSignature(),
    }),
    summarizeCluster: vi.fn().mockResolvedValue("默认聚合摘要"),
    matchClusterCandidate: vi.fn().mockResolvedValue(null),
  };
  return { ...base, ...(overrides as unknown as Partial<AiProvider>) } as AiProvider;
}

describe("regenerateItemContent", () => {
  beforeEach(async () => {
    await prisma.item.deleteMany();
    await prisma.contentCluster.deleteMany();
    await prisma.fetchRun.deleteMany();
    await prisma.backgroundTaskRun.deleteMany();
    await prisma.source.deleteMany();
    await prisma.sourceGroup.deleteMany();
    await prisma.blacklistKeyword.deleteMany();
    await prisma.taskSchedule.deleteMany();
  });

  it("queues a summary regeneration task", async () => {
    const taskRun = await enqueueItemRegenerationTask("item-1", "summary");

    expect(taskRun.kind).toBe("item_regenerate_summary");
    expect(taskRun.entityId).toBe("item-1");
    expect(taskRun.status).toBe("queued");
  });

  it("queues an item reanalyze task", async () => {
    const taskRun = await enqueueItemReanalyzeTask("item-1");

    expect(taskRun.kind).toBe("item_reanalyze");
    expect(taskRun.entityId).toBe("item-1");
    expect(taskRun.status).toBe("queued");
  });

  it("regenerates only the translated title when requested", async () => {
    const source = await prisma.source.create({
      data: {
        name: "Example Feed",
        rssUrl: "https://example.com/feed.xml",
        siteUrl: "https://example.com",
        enabled: true,
        aiParsingEnabled: true,
      },
    });

    const item = await prisma.item.create({
      data: {
        sourceId: source.id,
        originalUrl: "https://example.com/posts/1",
        canonicalUrl: "https://example.com/posts/1",
        urlHash: "hash-1",
        dedupeSignature: "example|story|2026-04-10t09:00:00.000z",
        originalTitle: "OpenAI ships a new toolkit",
        translatedTitle: "旧标题",
        summaryText: "旧摘要",
        publishedAt: new Date("2026-04-10T09:00:00.000Z"),
        status: "processed",
        language: "en",
        fullText: "Full article body",
      },
    });

    const regenerated = await regenerateItemContent(item.id, "translation", {
      aiProvider: buildAiProviderMock({
        enrichContent: vi.fn().mockResolvedValue({
          translatedTitle: "新的中文标题",
          moderationStatus: "allowed",
          moderationReason: null,
          moderationDetail: null,
          qualityScore: 80,
          qualityRationale: "高质量",
          eventSignature: buildEventSignature({
            eventType: "launch",
            eventSubject: "OpenAI",
            eventAction: "发布",
            eventObject: "toolkit",
          }),
        }),
        summarizeCluster: vi.fn().mockResolvedValue("聚合摘要"),
        matchClusterCandidate: vi.fn().mockResolvedValue(null),
      }),
    });

    expect(regenerated.translatedTitle).toBe("新的中文标题");
    expect(regenerated.summaryText).toBe("旧摘要");
  });

  it("regenerates only the summary when requested and preserves the title", async () => {
    const source = await prisma.source.create({
      data: {
        name: "Example Feed",
        rssUrl: "https://example.com/feed.xml",
        siteUrl: "https://example.com",
        enabled: true,
        aiParsingEnabled: true,
      },
    });

    const item = await prisma.item.create({
      data: {
        sourceId: source.id,
        originalUrl: "https://example.com/posts/2",
        canonicalUrl: "https://example.com/posts/2",
        urlHash: "hash-2",
        dedupeSignature: "example|story-2|2026-04-10t09:30:00.000z",
        originalTitle: "OpenAI launches a benchmark",
        translatedTitle: "现有中文标题",
        summaryText: "现有摘要",
        publishedAt: new Date("2026-04-10T09:30:00.000Z"),
        status: "processed",
        language: "en",
        fullText: "A full text body used for summarization",
      },
    });

    const regenerated = await regenerateItemContent(item.id, "summary", {
      aiProvider: buildAiProviderMock({
        summarizeItem: vi.fn().mockResolvedValue("新的摘要内容"),
        summarizeCluster: vi.fn().mockResolvedValue("聚合摘要"),
        matchClusterCandidate: vi.fn().mockResolvedValue(null),
      }),
    });

    expect(regenerated.translatedTitle).toBe("现有中文标题");
    expect(regenerated.summaryText).toBe("新的摘要内容");
  });

  it("retries item summary regeneration once when the first AI summary is English", async () => {
    const source = await prisma.source.create({
      data: {
        name: "Example Feed",
        rssUrl: "https://example.com/feed.xml",
        siteUrl: "https://example.com",
        enabled: true,
        aiParsingEnabled: true,
      },
    });

    const item = await prisma.item.create({
      data: {
        sourceId: source.id,
        originalUrl: "https://example.com/posts/english-summary",
        canonicalUrl: "https://example.com/posts/english-summary",
        urlHash: "hash-english-summary",
        dedupeSignature: "example|english-summary|2026-04-10t09:45:00.000z",
        originalTitle: "Anthropic launches an enterprise AI services company",
        translatedTitle: "Anthropic 推出企业 AI 服务公司",
        summaryText: "旧摘要",
        publishedAt: new Date("2026-04-10T09:45:00.000Z"),
        status: "processed",
        language: "en",
        fullText: "Anthropic announced a new enterprise AI services company with several financial partners.",
      },
    });
    const summarizeItem = vi
      .fn()
      .mockResolvedValueOnce("Anthropic announced a new enterprise AI services company with financial partners.")
      .mockResolvedValueOnce("Anthropic 与多家金融机构共同成立企业 AI 服务公司。");

    const regenerated = await regenerateItemContent(item.id, "summary", {
      aiProvider: buildAiProviderMock({
        summarizeItem,
        summarizeCluster: vi.fn().mockResolvedValue("聚合摘要"),
        matchClusterCandidate: vi.fn().mockResolvedValue(null),
      }),
    });

    expect(summarizeItem).toHaveBeenCalledTimes(2);
    expect(regenerated.summaryText).toBe("Anthropic 与多家金融机构共同成立企业 AI 服务公司。");
  });

  it("keeps the old value and records the error when regeneration fails", async () => {
    const source = await prisma.source.create({
      data: {
        name: "Example Feed",
        rssUrl: "https://example.com/feed.xml",
        siteUrl: "https://example.com",
        enabled: true,
        aiParsingEnabled: true,
      },
    });

    const item = await prisma.item.create({
      data: {
        sourceId: source.id,
        originalUrl: "https://example.com/posts/3",
        canonicalUrl: "https://example.com/posts/3",
        urlHash: "hash-3",
        dedupeSignature: "example|story-3|2026-04-10t10:00:00.000z",
        originalTitle: "OpenAI model update",
        translatedTitle: "保留原标题",
        summaryText: "保留原摘要",
        publishedAt: new Date("2026-04-10T10:00:00.000Z"),
        status: "processed",
        language: "en",
        fullText: "Body for regeneration",
      },
    });

    const regenerated = await regenerateItemContent(item.id, "summary", {
      aiProvider: buildAiProviderMock({
        summarizeItem: vi.fn().mockRejectedValue(new Error("Upstream regeneration failed")),
        summarizeCluster: vi.fn().mockResolvedValue("聚合摘要"),
        matchClusterCandidate: vi.fn().mockResolvedValue(null),
      }),
    });

    expect(regenerated.summaryText).toBe("保留原摘要");
    expect(regenerated.errorMessage).toContain("Upstream regeneration failed");
  });

  it("keeps the old value and records the error when regenerated summaries remain English", async () => {
    const source = await prisma.source.create({
      data: {
        name: "Example Feed",
        rssUrl: "https://example.com/feed.xml",
        siteUrl: "https://example.com",
        enabled: true,
        aiParsingEnabled: true,
      },
    });

    const item = await prisma.item.create({
      data: {
        sourceId: source.id,
        originalUrl: "https://example.com/posts/english-after-retry",
        canonicalUrl: "https://example.com/posts/english-after-retry",
        urlHash: "hash-english-after-retry",
        dedupeSignature: "example|english-after-retry|2026-04-10t10:15:00.000z",
        originalTitle: "SAS sells AI to Fortune 500 companies",
        translatedTitle: "SAS 向财富500强企业推销AI",
        summaryText: "保留中文旧摘要",
        publishedAt: new Date("2026-04-10T10:15:00.000Z"),
        status: "processed",
        language: "en",
        fullText: "Body for regeneration",
      },
    });
    const summarizeItem = vi
      .fn()
      .mockResolvedValueOnce("SAS explains AI is just a tool for enterprise customers.")
      .mockResolvedValueOnce("SAS still explains AI is just a tool for enterprise customers.");

    const regenerated = await regenerateItemContent(item.id, "summary", {
      aiProvider: buildAiProviderMock({
        summarizeItem,
        summarizeCluster: vi.fn().mockResolvedValue("聚合摘要"),
        matchClusterCandidate: vi.fn().mockResolvedValue(null),
      }),
    });

    expect(summarizeItem).toHaveBeenCalledTimes(2);
    expect(regenerated.summaryText).toBe("保留中文旧摘要");
    expect(regenerated.summaryStatus).toBe("failed");
    expect(regenerated.errorMessage).toContain("AI summary is not Chinese after retry");
  });

  it("records ai usage for item summary regeneration tasks", async () => {
    const source = await prisma.source.create({
      data: {
        name: "Example Feed",
        rssUrl: "https://example.com/feed.xml",
        siteUrl: "https://example.com",
        enabled: true,
        aiParsingEnabled: true,
      },
    });
    const cluster = await prisma.contentCluster.create({
      data: {
        id: "cluster-regeneration",
        kind: "topic",
        title: "OpenAI Toolkit",
        summary: "旧聚合摘要",
        score: 80,
        itemCount: 2,
        latestPublishedAt: new Date("2026-04-10T10:00:00.000Z"),
        status: "active",
        fingerprint: "openai-toolkit",
      },
    });

    await prisma.item.createMany({
      data: [
        {
          id: "item-regeneration-target",
          sourceId: source.id,
          clusterId: cluster.id,
          originalUrl: "https://example.com/posts/summary-1",
          canonicalUrl: "https://example.com/posts/summary-1",
          urlHash: "summary-1",
          dedupeSignature: "summary|1",
          originalTitle: "OpenAI ships a new toolkit",
          translatedTitle: "OpenAI 发布新工具包",
          summaryText: "旧摘要一",
          publishedAt: new Date("2026-04-10T10:00:00.000Z"),
          status: "processed",
          moderationStatus: "allowed",
          qualityScore: 86,
          qualityRationale: "高质量",
          language: "en",
          fullText: "Summary body one",
        },
        {
          id: "item-regeneration-peer",
          sourceId: source.id,
          clusterId: cluster.id,
          originalUrl: "https://example.com/posts/summary-2",
          canonicalUrl: "https://example.com/posts/summary-2",
          urlHash: "summary-2",
          dedupeSignature: "summary|2",
          originalTitle: "Another toolkit update",
          translatedTitle: "另一条工具包更新",
          summaryText: "旧摘要二",
          publishedAt: new Date("2026-04-10T09:30:00.000Z"),
          status: "processed",
          moderationStatus: "allowed",
          qualityScore: 82,
          qualityRationale: "高质量",
          language: "en",
          fullText: "Summary body two",
        },
      ],
    });

    const taskRun = await prisma.backgroundTaskRun.create({
      data: {
        kind: "item_regenerate_summary",
        triggerType: "admin_action",
        status: "queued",
        label: "重生成摘要",
        entityId: "item-regeneration-target",
      },
    });

    await executeItemRegenerationTask(taskRun, "summary", {
      aiProvider: buildAiProviderMock({
        summarizeItem: vi.fn().mockResolvedValue("新的摘要内容"),
        summarizeCluster: vi.fn().mockResolvedValue("新的聚合摘要"),
        matchClusterCandidate: vi.fn().mockResolvedValue(null),
      }),
    });

    const storedTaskRun = await prisma.backgroundTaskRun.findUniqueOrThrow({
      where: { id: taskRun.id },
    });

    expect(storedTaskRun.status).toBe("succeeded");
    expect(storedTaskRun.aiCallCountActual).toBe(1);
    expect(storedTaskRun.aiCallCountEstimated).toBe(1);
  });

  it("reattaches summary regeneration targets to a matching cluster and records the match in task progress", async () => {
    const source = await prisma.source.create({
      data: {
        name: "Example Feed",
        rssUrl: "https://example.com/feed.xml",
        siteUrl: "https://example.com",
        enabled: true,
        aiParsingEnabled: true,
      },
    });
    const matchingFingerprint = normalizeFingerprint("launch|OpenAI|发布|toolkit|2026-04-10");
    const matchingCluster = await prisma.contentCluster.create({
      data: {
        id: "matching-cluster",
        kind: "topic",
        title: "OpenAI Toolkit 发布",
        summary: "已有聚合摘要",
        score: 88,
        itemCount: 1,
        latestPublishedAt: new Date("2026-04-10T09:00:00.000Z"),
        status: "active",
        fingerprint: matchingFingerprint,
        eventType: "launch",
        eventSubject: "OpenAI",
        eventAction: "发布",
        eventObject: "toolkit",
        eventDate: "2026-04-10",
      },
    });
    const previousCluster = await prisma.contentCluster.create({
      data: {
        id: "previous-single-cluster",
        kind: "topic",
        title: "旧单条聚合",
        summary: "旧单条摘要",
        score: 70,
        itemCount: 1,
        latestPublishedAt: new Date("2026-04-10T10:00:00.000Z"),
        status: "active",
        fingerprint: "previous-single-cluster",
      },
    });

    await prisma.item.create({
      data: {
        id: "matching-seed-item",
        sourceId: source.id,
        clusterId: matchingCluster.id,
        originalUrl: "https://example.com/posts/matching-seed",
        canonicalUrl: "https://example.com/posts/matching-seed",
        urlHash: "matching-seed",
        dedupeSignature: "matching-seed|1",
        originalTitle: "OpenAI toolkit seed",
        translatedTitle: "OpenAI 工具包发布",
        summaryText: "已有聚合条目",
        publishedAt: new Date("2026-04-10T09:00:00.000Z"),
        status: "processed",
        moderationStatus: "allowed",
        qualityScore: 88,
        qualityRationale: "高质量",
        eventType: "launch",
        eventSubject: "OpenAI",
        eventAction: "发布",
        eventObject: "toolkit",
        eventDate: "2026-04-10",
        language: "en",
        fullText: "Seed body",
      },
    });
    await prisma.item.create({
      data: {
        id: "summary-regeneration-match-target",
        sourceId: source.id,
        clusterId: previousCluster.id,
        originalUrl: "https://example.com/posts/matching-target",
        canonicalUrl: "https://example.com/posts/matching-target",
        urlHash: "matching-target",
        dedupeSignature: "matching-target|1",
        originalTitle: "OpenAI ships toolkit",
        translatedTitle: "OpenAI 发布工具包",
        summaryText: "旧摘要",
        publishedAt: new Date("2026-04-10T10:00:00.000Z"),
        status: "processed",
        moderationStatus: "allowed",
        qualityScore: 86,
        qualityRationale: "高质量",
        eventType: "launch",
        eventSubject: "OpenAI",
        eventAction: "发布",
        eventObject: "toolkit",
        eventDate: "2026-04-10",
        language: "en",
        fullText: "Target body",
      },
    });

    const taskRun = await prisma.backgroundTaskRun.create({
      data: {
        kind: "item_regenerate_summary",
        triggerType: "admin_action",
        status: "queued",
        label: "重生成摘要",
        entityId: "summary-regeneration-match-target",
      },
    });

    await executeItemRegenerationTask(taskRun, "summary", {
      aiProvider: buildAiProviderMock({
        summarizeItem: vi.fn().mockResolvedValue("新的摘要内容"),
        summarizeCluster: vi.fn().mockResolvedValue("新的聚合摘要"),
        matchClusterCandidate: vi.fn().mockResolvedValue(null),
      }),
    });

    const [storedTaskRun, updatedItem] = await Promise.all([
      prisma.backgroundTaskRun.findUniqueOrThrow({ where: { id: taskRun.id } }),
      prisma.item.findUniqueOrThrow({ where: { id: "summary-regeneration-match-target" } }),
    ]);

    expect(updatedItem.clusterId).toBe(matchingCluster.id);
    expect(storedTaskRun.progressLabel).toBe("已完成条目更新，聚合匹配成功：OpenAI Toolkit 发布");
  });

  it("records ai usage for item reanalyze tasks", async () => {
    const source = await prisma.source.create({
      data: {
        name: "Example Feed",
        rssUrl: "https://example.com/feed.xml",
        siteUrl: "https://example.com",
        enabled: true,
        aiParsingEnabled: true,
      },
    });
    const existingCluster = await prisma.contentCluster.create({
      data: {
        id: "cluster-reanalyze",
        kind: "topic",
        title: "OpenAI Toolkit",
        summary: "现有聚合摘要",
        score: 84,
        itemCount: 1,
        latestPublishedAt: new Date("2026-04-10T09:00:00.000Z"),
        status: "active",
        fingerprint: "openai-toolkit-launch",
      },
    });

    await prisma.item.create({
      data: {
        id: "cluster-seed-item",
        sourceId: source.id,
        clusterId: existingCluster.id,
        originalUrl: "https://example.com/posts/seed",
        canonicalUrl: "https://example.com/posts/seed",
        urlHash: "seed-item",
        dedupeSignature: "seed|1",
        originalTitle: "OpenAI toolkit launch",
        translatedTitle: "OpenAI 工具包发布",
        summaryText: "现有聚合中的条目",
        publishedAt: new Date("2026-04-10T09:00:00.000Z"),
        status: "processed",
        moderationStatus: "allowed",
        qualityScore: 84,
        qualityRationale: "高质量",
        language: "en",
        fullText: "Existing seed body",
      },
    });
    await prisma.item.create({
      data: {
        id: "reanalyze-target",
        sourceId: source.id,
        originalUrl: "https://example.com/posts/reanalyze",
        canonicalUrl: "https://example.com/posts/reanalyze",
        urlHash: "reanalyze-target",
        dedupeSignature: "reanalyze|1",
        originalTitle: "Another OpenAI toolkit report",
        translatedTitle: null,
        summaryText: "旧摘要",
        publishedAt: new Date("2026-04-10T10:00:00.000Z"),
        status: "processed",
        moderationStatus: "allowed",
        qualityScore: 70,
        qualityRationale: "中等",
        language: "en",
        fullText: "Target body",
      },
    });

    const taskRun = await prisma.backgroundTaskRun.create({
      data: {
        kind: "item_reanalyze",
        triggerType: "admin_action",
        status: "queued",
        label: "重新 AI 判定",
        entityId: "reanalyze-target",
      },
    });

    await executeItemReanalyzeTask(taskRun, {
      aiProvider: buildAiProviderMock({
        summarizeItem: vi.fn().mockResolvedValue("新的重分析摘要"),
        enrichContent: vi.fn().mockResolvedValue({
          translatedTitle: "另一篇 OpenAI 工具包报道",
          moderationStatus: "allowed",
          moderationReason: null,
          moderationDetail: null,
          qualityScore: 88,
          qualityRationale: "高质量",
          eventSignature: buildEventSignature({
            eventType: "launch",
            eventSubject: "OpenAI",
            eventAction: "发布",
            eventObject: "toolkit",
          }),
        }),
        summarizeCluster: vi.fn().mockResolvedValue("重算后的聚合摘要"),
        matchClusterCandidate: vi.fn().mockImplementation(async (_input, metadata: { candidates: Array<{ id: string }> }) => {
          return metadata.candidates[0]?.id ?? null;
        }),
      }),
    });

    const storedTaskRun = await prisma.backgroundTaskRun.findUniqueOrThrow({
      where: { id: taskRun.id },
    });
    const updatedItem = await prisma.item.findUniqueOrThrow({
      where: { id: "reanalyze-target" },
    });

    expect(storedTaskRun.status).toBe("succeeded");
    expect(storedTaskRun.aiCallCountActual).toBe(3);
    expect(storedTaskRun.aiCallCountEstimated).toBe(4);
    expect(updatedItem.eventType).toBe("launch");
    expect(updatedItem.eventSubject).toBe("OpenAI");
    expect(updatedItem.eventAction).toBe("发布");
    expect(updatedItem.eventObject).toBe("toolkit");
  });

  it("uses every cluster item summary and event signature when regenerating cluster summaries", async () => {
    const source = await prisma.source.create({
      data: {
        name: "Example Feed",
        rssUrl: "https://example.com/feed.xml",
        siteUrl: "https://example.com",
        enabled: true,
        aiParsingEnabled: true,
      },
    });
    const cluster = await prisma.contentCluster.create({
      data: {
        id: "cluster-summary-task",
        kind: "topic",
        title: "OpenAI Toolkit",
        summary: "旧聚合摘要",
        score: 80,
        itemCount: 2,
        latestPublishedAt: new Date("2026-04-10T10:00:00.000Z"),
        status: "active",
        fingerprint: "openai-toolkit-summary",
      },
    });

    await prisma.item.createMany({
      data: [
        {
          id: "cluster-summary-item-1",
          sourceId: source.id,
          clusterId: cluster.id,
          originalUrl: "https://example.com/posts/cluster-1",
          canonicalUrl: "https://example.com/posts/cluster-1",
          urlHash: "cluster-summary-1",
          dedupeSignature: "cluster-summary|1",
          originalTitle: "Toolkit launch",
          translatedTitle: "工具包发布",
          summaryText: "内容一",
          publishedAt: new Date("2026-04-10T10:00:00.000Z"),
          status: "processed",
          moderationStatus: "allowed",
          qualityScore: 88,
          qualityRationale: "高质量",
          eventType: "launch",
          eventSubject: "OpenAI",
          eventAction: "发布",
          eventObject: "toolkit",
          eventDate: "2026-04-10",
          language: "en",
          fullText: "Cluster body one",
        },
        {
          id: "cluster-summary-item-2",
          sourceId: source.id,
          clusterId: cluster.id,
          originalUrl: "https://example.com/posts/cluster-2",
          canonicalUrl: "https://example.com/posts/cluster-2",
          urlHash: "cluster-summary-2",
          dedupeSignature: "cluster-summary|2",
          originalTitle: "Toolkit follow-up",
          translatedTitle: "工具包后续",
          summaryText: "内容二",
          publishedAt: new Date("2026-04-10T09:30:00.000Z"),
          status: "processed",
          moderationStatus: "allowed",
          qualityScore: 85,
          qualityRationale: "高质量",
          eventType: "launch",
          eventSubject: "OpenAI",
          eventAction: "补充",
          eventObject: "toolkit API",
          eventDate: "2026-04-10",
          language: "en",
          fullText: "Cluster body two",
        },
        {
          id: "cluster-summary-item-3",
          sourceId: source.id,
          clusterId: cluster.id,
          originalUrl: "https://example.com/posts/cluster-3",
          canonicalUrl: "https://example.com/posts/cluster-3",
          urlHash: "cluster-summary-3",
          dedupeSignature: "cluster-summary|3",
          originalTitle: "Toolkit pricing details",
          translatedTitle: "工具包价格细节",
          summaryText: "内容三",
          publishedAt: new Date("2026-04-10T09:00:00.000Z"),
          status: "processed",
          moderationStatus: "allowed",
          qualityScore: 83,
          qualityRationale: "高质量",
          eventType: "launch",
          eventSubject: "OpenAI",
          eventAction: "披露",
          eventObject: "toolkit pricing",
          eventDate: "2026-04-10",
          language: "en",
          fullText: "Cluster body three",
        },
        {
          id: "cluster-summary-item-4",
          sourceId: source.id,
          clusterId: cluster.id,
          originalUrl: "https://example.com/posts/cluster-4",
          canonicalUrl: "https://example.com/posts/cluster-4",
          urlHash: "cluster-summary-4",
          dedupeSignature: "cluster-summary|4",
          originalTitle: "Toolkit enterprise rollout",
          translatedTitle: "工具包企业版推广",
          summaryText: "内容四",
          publishedAt: new Date("2026-04-10T08:30:00.000Z"),
          status: "processed",
          moderationStatus: "allowed",
          qualityScore: 82,
          qualityRationale: "高质量",
          eventType: "launch",
          eventSubject: "OpenAI",
          eventAction: "上线",
          eventObject: "toolkit enterprise",
          eventDate: "2026-04-10",
          language: "en",
          fullText: "Cluster body four",
        },
      ],
    });

    const taskRun = await prisma.backgroundTaskRun.create({
      data: {
        kind: "cluster_regenerate_summary",
        triggerType: "admin_action",
        status: "queued",
        label: "重新生成聚合摘要",
        entityId: cluster.id,
      },
    });

    const summarizeCluster = vi.fn().mockResolvedValue("新的聚合摘要");

    await executeClusterSummaryTask(taskRun, {
      aiProvider: buildAiProviderMock({
        summarizeCluster,
        matchClusterCandidate: vi.fn().mockResolvedValue(null),
      }),
    });

    const storedTaskRun = await prisma.backgroundTaskRun.findUniqueOrThrow({
      where: { id: taskRun.id },
    });

    expect(storedTaskRun.status).toBe("succeeded");
    expect(storedTaskRun.aiCallCountActual).toBe(1);
    expect(storedTaskRun.aiCallCountEstimated).toBe(1);

    const summarySeed = summarizeCluster.mock.calls[0]?.[0] as string;
    expect(summarySeed).toContain("候选 1");
    expect(summarySeed).toContain("候选 4");
    expect(summarySeed).toContain("摘要：内容一");
    expect(summarySeed).toContain("摘要：内容四");
    expect(summarySeed).toContain("事件主体：OpenAI");
    expect(summarySeed).toContain("事件动作：上线");
    expect(summarySeed).toContain("关键对象：toolkit enterprise");

    const secondTaskRun = await prisma.backgroundTaskRun.create({
      data: {
        kind: "cluster_regenerate_summary",
        triggerType: "admin_action",
        status: "queued",
        label: "重新生成聚合摘要",
        entityId: cluster.id,
      },
    });

    await executeClusterSummaryTask(secondTaskRun, {
      aiProvider: buildAiProviderMock({
        summarizeCluster,
        matchClusterCandidate: vi.fn().mockResolvedValue(null),
      }),
    });

    const storedCluster = await prisma.contentCluster.findUniqueOrThrow({
      where: { id: cluster.id },
    });
    const storedSecondTaskRun = await prisma.backgroundTaskRun.findUniqueOrThrow({
      where: { id: secondTaskRun.id },
    });

    expect(storedCluster.summaryInputHash).not.toBeNull();
    expect(summarizeCluster).toHaveBeenCalledTimes(2);
    expect(storedSecondTaskRun.aiCallCountActual).toBe(1);
  });

  it("recovers cluster presentation JSON when the summary contains unescaped quotes", async () => {
    const source = await prisma.source.create({
      data: {
        name: "Example Feed",
        rssUrl: "https://example.com/feed.xml",
        siteUrl: "https://example.com",
        enabled: true,
        aiParsingEnabled: true,
      },
    });
    const cluster = await prisma.contentCluster.create({
      data: {
        id: "cluster-malformed-summary-json",
        kind: "topic",
        title: "旧聚合标题",
        summary: "旧聚合摘要",
        score: 80,
        itemCount: 2,
        latestPublishedAt: new Date("2026-04-21T10:00:00.000Z"),
        status: "active",
        fingerprint: "openai-gpt-image-2",
      },
    });

    await prisma.item.createMany({
      data: [
        {
          id: "cluster-malformed-summary-json-item-1",
          sourceId: source.id,
          clusterId: cluster.id,
          originalUrl: "https://example.com/posts/gpt-image-2-1",
          canonicalUrl: "https://example.com/posts/gpt-image-2-1",
          urlHash: "cluster-malformed-summary-json-1",
          dedupeSignature: "cluster-malformed-summary-json|1",
          originalTitle: "OpenAI launches GPT Image 2",
          translatedTitle: "OpenAI 上线 GPT Image 2",
          summaryText: "OpenAI 推出文生图模型 GPT Image 2。",
          publishedAt: new Date("2026-04-21T10:00:00.000Z"),
          status: "processed",
          moderationStatus: "allowed",
          qualityScore: 88,
          qualityRationale: "高质量",
          eventType: "launch",
          eventSubject: "OpenAI",
          eventAction: "上线",
          eventObject: "GPT Image 2",
          eventDate: "2026-04-21",
          language: "en",
          fullText: "Cluster body one",
        },
        {
          id: "cluster-malformed-summary-json-item-2",
          sourceId: source.id,
          clusterId: cluster.id,
          originalUrl: "https://example.com/posts/gpt-image-2-2",
          canonicalUrl: "https://example.com/posts/gpt-image-2-2",
          urlHash: "cluster-malformed-summary-json-2",
          dedupeSignature: "cluster-malformed-summary-json|2",
          originalTitle: "GPT Image 2 tops visual model benchmark",
          translatedTitle: "GPT Image 2 登顶视觉模型榜首",
          summaryText: "GPT Image 2 在视觉模型榜单中取得领先。",
          publishedAt: new Date("2026-04-21T09:00:00.000Z"),
          status: "processed",
          moderationStatus: "allowed",
          qualityScore: 86,
          qualityRationale: "高质量",
          eventType: "launch",
          eventSubject: "OpenAI",
          eventAction: "上线",
          eventObject: "GPT Image 2",
          eventDate: "2026-04-21",
          language: "en",
          fullText: "Cluster body two",
        },
      ],
    });

    const taskRun = await prisma.backgroundTaskRun.create({
      data: {
        kind: "cluster_regenerate_summary",
        triggerType: "admin_action",
        status: "queued",
        label: "重新生成聚合摘要",
        entityId: cluster.id,
      },
    });
    const summarizeCluster = vi.fn().mockResolvedValue(
      `{"title":"OpenAI 上线 GPT Image 2 登顶全球视觉模型榜首","summary":"OpenAI 于 *4 月 21 日* 正式推出文生图模型 **GPT Image 2**，并在权威评测中超越谷歌 **Nano Banana 2**，登顶全球视觉模型榜首。该模型有效解决文字"漂浮感"和乱码问题。"}`,
    );

    await executeClusterSummaryTask(taskRun, {
      aiProvider: buildAiProviderMock({
        summarizeCluster,
        matchClusterCandidate: vi.fn().mockResolvedValue(null),
      }),
    });

    const storedCluster = await prisma.contentCluster.findUniqueOrThrow({
      where: { id: cluster.id },
    });

    expect(storedCluster.title).toBe("OpenAI 上线 GPT Image 2 登顶全球视觉模型榜首");
    expect(storedCluster.summary).toContain('文字"漂浮感"和乱码问题');
    expect(storedCluster.summary).not.toContain('{"title"');
  });
});
