import { beforeEach, describe, expect, it, vi } from "vitest";

import { prisma } from "@/lib/db";
import { runIngestion, runIngestionTask, startIngestionTask } from "@/lib/ingestion/service";
import { buildDedupeKeys } from "@/lib/ingestion/dedupe";

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

describe("runIngestion", () => {
  beforeEach(async () => {
    await prisma.item.deleteMany();
    await prisma.fetchRun.deleteMany();
    await prisma.backgroundTaskRun.deleteMany();
    await prisma.promptConfig.deleteMany();
    await prisma.modelApiConfig.deleteMany();
    await prisma.contentCluster.deleteMany();
    await prisma.source.deleteMany();
    await prisma.sourceGroup.deleteMany();
    await prisma.blacklistKeyword.deleteMany();
    await prisma.taskSchedule.deleteMany();
  });

  it("creates a queued ingestion background task", async () => {
    const taskRun = await startIngestionTask({ triggerType: "manual" });

    expect(taskRun.kind).toBe("ingestion");
    expect(taskRun.status).toBe("queued");
    expect(taskRun.triggerType).toBe("manual");
  });

  it("records ingestion task progress using item counts instead of source counts", async () => {
    const parser = {
      parseURL: vi.fn().mockResolvedValue({
        items: [
          {
            title: "OpenAI ships a new agent toolkit",
            link: "https://example.com/posts/openai-toolkit",
            isoDate: "2026-04-10T09:00:00.000Z",
            contentSnippet: "Brief summary",
            creator: "Alex",
          },
          {
            title: "Another update on the toolkit",
            link: "https://example.com/posts/openai-toolkit-2",
            isoDate: "2026-04-10T10:00:00.000Z",
            contentSnippet: "Another summary",
            creator: "Jamie",
          },
        ],
      }),
    };
    const aiProvider = {
      enrichContent: vi.fn().mockResolvedValue({
        translatedTitle: "OpenAI 发布新的 Agent 工具包",
        summary: "这篇文章介绍了 OpenAI 新发布的 agent 工具能力。",
        moderationStatus: "allowed",
        moderationReason: null,
        moderationDetail: "新闻价值明确",
        qualityScore: 91,
        qualityRationale: "多事实点且时效性强",
        eventSignature: buildEventSignature({
          eventType: "launch",
          eventSubject: "OpenAI",
          eventAction: "发布",
          eventObject: "agent toolkit",
        }),
      }),
      summarizeCluster: vi.fn().mockResolvedValue("两篇报道都聚焦 OpenAI 新发布的 agent 工具能力。"),
      matchClusterCandidate: vi.fn().mockImplementation(async (_input: string, metadata: { candidates: Array<{ id: string }> }) => {
        return metadata.candidates[0]?.id ?? null;
      }),
    };
    const taskRun = await startIngestionTask({ triggerType: "manual" });

    await runIngestionTask(taskRun, {
      parser,
      articleFetcher: vi.fn(),
      aiProvider,
      sourceConfigs: [
        {
          name: "Example Feed",
          rssUrl: "https://example.com/feed.xml",
          siteUrl: "https://example.com",
          enabled: true,
          aiParsingEnabled: true,
        },
      ],
      blacklist: [],
      now: new Date("2026-04-10T10:30:00.000Z"),
    });

    const storedTaskRun = await prisma.backgroundTaskRun.findUniqueOrThrow({
      where: { id: taskRun.id },
    });

    expect(storedTaskRun.progressCurrent).toBe(2);
    expect(storedTaskRun.progressTotal).toBe(2);
    expect(storedTaskRun.progressLabel).toBe("已处理 2/2 条内容，来自 1 个源，失败 0 项，正文补抓 0 篇");
    expect(storedTaskRun.aiCallCountActual).toBe(4);
    expect(storedTaskRun.aiCallCountEstimated).toBe(4);
    expect(storedTaskRun.fullTextFetchedCount).toBe(0);
    expect(storedTaskRun.stageTimingsJson).not.toBeNull();
    expect(storedTaskRun.aiCallBreakdownJson).not.toBeNull();

    const stageTimings = JSON.parse(storedTaskRun.stageTimingsJson ?? "[]") as Array<{ key: string; durationMs: number | null }>;
    const aiCallBreakdown = JSON.parse(
      storedTaskRun.aiCallBreakdownJson ?? "[]",
    ) as Array<{ key: string; label: string; actual: number; estimated: number }>;

    expect(stageTimings.map((stageTiming) => stageTiming.key)).toEqual([
      "source_sync",
      "item_processing",
      "cluster_finalize",
    ]);
    expect(stageTimings.every((stageTiming) => typeof stageTiming.durationMs === "number" || stageTiming.durationMs === null)).toBe(true);
    expect(aiCallBreakdown).toEqual([
      { key: "item_analysis", label: "内容分析", actual: 2, estimated: 2 },
      { key: "cluster_match", label: "聚合匹配", actual: 1, estimated: 1 },
      { key: "cluster_summary", label: "聚合摘要", actual: 1, estimated: 1 },
    ]);
  });

  it("stops ingestion after a cancellation request", async () => {
    let enrichCallCount = 0;
    const parser = {
      parseURL: vi.fn().mockResolvedValue({
        items: [
          {
            title: "OpenAI ships a new agent toolkit",
            link: "https://example.com/posts/openai-toolkit",
            isoDate: "2026-04-10T09:00:00.000Z",
            contentSnippet: "Brief summary",
            creator: "Alex",
          },
          {
            title: "Another update on the toolkit",
            link: "https://example.com/posts/openai-toolkit-2",
            isoDate: "2026-04-10T10:00:00.000Z",
            contentSnippet: "Another summary",
            creator: "Jamie",
          },
        ],
      }),
    };
    const taskRun = await startIngestionTask({ triggerType: "manual" });
    const aiProvider = {
      enrichContent: vi.fn().mockImplementation(async () => {
        enrichCallCount += 1;

        if (enrichCallCount === 1) {
          await prisma.backgroundTaskRun.update({
            where: { id: taskRun.id },
            data: {
              cancelRequestedAt: new Date("2026-04-10T10:31:00.000Z"),
            },
          });
        }

        return {
          translatedTitle: "OpenAI 发布新的 Agent 工具包",
          summary: "这篇文章介绍了 OpenAI 新发布的 agent 工具能力。",
          moderationStatus: "allowed",
          moderationReason: null,
          moderationDetail: "新闻价值明确",
          qualityScore: 91,
          qualityRationale: "多事实点且时效性强",
          eventSignature: buildEventSignature({
            eventType: "launch",
            eventSubject: "OpenAI",
            eventAction: "发布",
            eventObject: "agent toolkit",
          }),
        };
      }),
      summarizeCluster: vi.fn().mockResolvedValue("不会执行到这里"),
      matchClusterCandidate: vi.fn().mockResolvedValue(null),
    };

    await runIngestionTask(taskRun, {
      parser,
      articleFetcher: vi.fn(),
      aiProvider,
      sourceConfigs: [
        {
          name: "Example Feed",
          rssUrl: "https://example.com/feed.xml",
          siteUrl: "https://example.com",
          enabled: true,
          aiParsingEnabled: true,
        },
      ],
      blacklist: [],
      itemConcurrency: 1,
      now: new Date("2026-04-10T10:30:00.000Z"),
    });

    const storedTaskRun = await prisma.backgroundTaskRun.findUniqueOrThrow({
      where: { id: taskRun.id },
    });
    const storedItems = await prisma.item.findMany({
      orderBy: { publishedAt: "asc" },
    });

    expect(storedTaskRun.status).toBe("cancelled");
    expect(storedTaskRun.progressCurrent).toBe(1);
    expect(storedTaskRun.progressTotal).toBe(2);
    expect(storedTaskRun.progressLabel).toBe("任务已终止");
    expect(storedTaskRun.errorSummary).toBe("管理员手动终止任务。");
    expect(storedItems).toHaveLength(1);
  });

  it("stores processed items, preserves filtered items, and records the run", async () => {
    const parser = {
      parseURL: vi.fn().mockResolvedValue({
        items: [
          {
            title: "OpenAI ships a new agent toolkit",
            link: "https://example.com/posts/openai-toolkit?utm_source=rss",
            isoDate: "2026-04-10T09:00:00.000Z",
            contentSnippet: "Brief summary",
            creator: "Alex",
          },
          {
            title: "Another report on OpenAI's agent toolkit",
            link: "https://another.example.com/posts/openai-toolkit",
            isoDate: "2026-04-10T09:30:00.000Z",
            contentSnippet: "Second brief summary",
            creator: "Jamie",
          },
          {
            title: "Market wrap",
            link: "https://example.com/posts/market-wrap",
            isoDate: "2026-04-10T08:00:00.000Z",
            content: "This article discusses layoffs in detail.",
            creator: "Sam",
          },
        ],
      }),
    };

    const articleFetcher = vi
      .fn()
      .mockResolvedValue("A complete article body describing the toolkit release in enough detail to summarize.");

    const aiProvider = {
      enrichContent: vi.fn().mockImplementation(async (input: string, metadata: { title: string }) => {
        if (metadata.title === "Market wrap") {
          return {
            translatedTitle: null,
            summary: "这是一篇低质量市场综述。",
            moderationStatus: "filtered",
            moderationReason: "low_quality",
            moderationDetail: "内容过于宽泛且信息增量很低",
            qualityScore: 20,
            qualityRationale: "信息密度低",
            eventSignature: buildEventSignature(),
          };
        }

        if (metadata.title === "Another report on OpenAI's agent toolkit") {
          return {
            translatedTitle: "另一篇关于 OpenAI Agent 工具包的报道",
            summary: "这篇文章从开发者工具角度报道 OpenAI 的 agent 新能力。",
            moderationStatus: "allowed",
            moderationReason: null,
            moderationDetail: "与首条报道语义接近，但表述不同",
            qualityScore: 87,
            qualityRationale: "事实清晰且信息密度较高",
            eventSignature: buildEventSignature({
              eventType: "launch",
              eventSubject: "OpenAI",
              eventAction: "发布",
              eventObject: "agent toolkit",
            }),
          };
        }

        return {
          translatedTitle: "OpenAI 发布新的 Agent 工具包",
          summary: "这篇文章介绍了 OpenAI 新发布的 agent 工具能力。",
          moderationStatus: "allowed",
          moderationReason: null,
          moderationDetail: "新闻价值明确",
          qualityScore: 91,
          qualityRationale: "多事实点且时效性强",
          eventSignature: buildEventSignature({
            eventType: "launch",
            eventSubject: "OpenAI",
            eventAction: "发布",
            eventObject: "agent toolkit",
          }),
        };
      }),
      summarizeCluster: vi.fn().mockResolvedValue("两篇报道都聚焦 OpenAI 新发布的 agent 工具能力，一篇强调发布本身，另一篇补充开发者工具视角。"),
      matchClusterCandidate: vi.fn().mockImplementation(async (_input: string, metadata: { candidates: Array<{ id: string }> }) => {
        return metadata.candidates[0]?.id ?? null;
      }),
    };

    const result = await runIngestion({
      trigger: "manual",
      parser,
      articleFetcher,
      aiProvider,
      sourceConfigs: [
        {
          name: "Example Feed",
          rssUrl: "https://example.com/feed.xml",
          siteUrl: "https://example.com",
          enabled: true,
          aiParsingEnabled: true,
        },
      ],
      blacklist: ["layoffs"],
      now: new Date("2026-04-10T10:00:00.000Z"),
    });

    expect(result.status).toBe("succeeded");
    expect(result.successCount).toBe(2);
    expect(result.failureCount).toBe(0);
    expect(parser.parseURL).toHaveBeenCalledWith("https://example.com/feed.xml");
    expect(articleFetcher).toHaveBeenCalledTimes(2);
    expect(aiProvider.enrichContent).toHaveBeenCalledTimes(2);
    expect(aiProvider.matchClusterCandidate).toHaveBeenCalledTimes(1);

    const storedItems = await prisma.item.findMany({
      orderBy: { publishedAt: "desc" },
      include: { source: true },
    });
    const primaryToolkitItem = storedItems.find((storedItem) => storedItem.originalTitle === "OpenAI ships a new agent toolkit");
    const secondaryToolkitItem = storedItems.find(
      (storedItem) => storedItem.originalTitle === "Another report on OpenAI's agent toolkit",
    );
    const filteredItem = storedItems.find((storedItem) => storedItem.originalTitle === "Market wrap");

    expect(storedItems).toHaveLength(3);
    expect(primaryToolkitItem?.translatedTitle).toBe("OpenAI 发布新的 Agent 工具包");
    expect(primaryToolkitItem?.summaryText).toBe("这篇文章介绍了 OpenAI 新发布的 agent 工具能力。");
    expect(primaryToolkitItem?.status).toBe("processed");
    expect(primaryToolkitItem?.moderationStatus).toBe("allowed");
    expect(primaryToolkitItem?.qualityScore).toBe(91);
    expect(primaryToolkitItem?.eventType).toBe("launch");
    expect(primaryToolkitItem?.eventSubject).toBe("OpenAI");
    expect(primaryToolkitItem?.eventAction).toBe("发布");
    expect(primaryToolkitItem?.eventObject).toBe("agent toolkit");
    expect(secondaryToolkitItem?.clusterId).toBe(primaryToolkitItem?.clusterId);
    expect(secondaryToolkitItem?.moderationStatus).toBe("allowed");
    expect(filteredItem?.status).toBe("filtered");
    expect(filteredItem?.moderationStatus).toBe("filtered");
    expect(filteredItem?.moderationReason).toBe("rule_blacklist");

    const storedCluster = await prisma.contentCluster.findUnique({
      where: {
        id: primaryToolkitItem?.clusterId ?? "",
      },
    });

    expect(storedCluster).not.toBeNull();
    expect(storedCluster?.itemCount).toBe(2);
    expect(storedCluster?.status).toBe("active");

    const latestRun = await prisma.fetchRun.findFirst({ orderBy: { startedAt: "desc" } });
    expect(latestRun?.triggerType).toBe("manual");
    expect(latestRun?.status).toBe("succeeded");
  });

  it("does not cluster items that only share a broad topic but not the same event", async () => {
    const parser = {
      parseURL: vi.fn().mockResolvedValue({
        items: [
          {
            title: "Anthropic launches managed agents",
            link: "https://example.com/posts/managed-agents",
            isoDate: "2026-04-10T09:00:00.000Z",
            contentSnippet: "Managed agents launch brief",
            creator: "Alex",
          },
          {
            title: "Microsoft releases agent framework",
            link: "https://example.com/posts/agent-framework",
            isoDate: "2026-04-10T09:30:00.000Z",
            contentSnippet: "Agent framework launch brief",
            creator: "Jamie",
          },
        ],
      }),
    };

    const aiProvider = {
      enrichContent: vi.fn().mockImplementation(async (_input: string, metadata: { title: string }) => {
        if (metadata.title === "Microsoft releases agent framework") {
          return {
            translatedTitle: "微软发布 Agent Framework",
            summary: "这篇文章报道微软发布新的 agent framework。",
            moderationStatus: "allowed",
            moderationReason: null,
            moderationDetail: "属于 AI 工具新闻，但与另一条不是同一事件",
            qualityScore: 82,
            qualityRationale: "信息完整且有明确发布动作",
            eventSignature: buildEventSignature({
              eventType: "launch",
              eventSubject: "Microsoft",
              eventAction: "发布",
              eventObject: "agent framework",
            }),
          };
        }

        return {
          translatedTitle: "Anthropic 推出 Managed Agents",
          summary: "这篇文章报道 Anthropic 推出 managed agents。",
          moderationStatus: "allowed",
          moderationReason: null,
          moderationDetail: "属于 AI 工具新闻，但与另一条不是同一事件",
          qualityScore: 84,
          qualityRationale: "信息完整且有明确发布动作",
          eventSignature: buildEventSignature({
            eventType: "launch",
            eventSubject: "Anthropic",
            eventAction: "推出",
            eventObject: "managed agents",
          }),
        };
      }),
      summarizeCluster: vi.fn().mockResolvedValue("不会被使用"),
      matchClusterCandidate: vi.fn().mockResolvedValue(null),
    };

    await runIngestion({
      trigger: "manual",
      parser,
      articleFetcher: vi.fn(),
      aiProvider,
      sourceConfigs: [
        {
          name: "Example Feed",
          rssUrl: "https://example.com/feed.xml",
          siteUrl: "https://example.com",
          enabled: true,
          aiParsingEnabled: true,
        },
      ],
      blacklist: [],
      now: new Date("2026-04-10T10:00:00.000Z"),
    });

    const storedItems = await prisma.item.findMany({
      orderBy: { publishedAt: "asc" },
    });

    expect(storedItems).toHaveLength(2);
    expect(storedItems[0]?.clusterId).not.toBe(storedItems[1]?.clusterId);
    expect(aiProvider.matchClusterCandidate).toHaveBeenCalledTimes(1);

    const clusterCount = await prisma.contentCluster.count();
    expect(clusterCount).toBe(2);
  });

  it("recalls every active cluster within 7 days instead of truncating to five candidates", async () => {
    const source = await prisma.source.create({
      data: {
        name: "Existing Cluster Feed",
        rssUrl: "https://existing.example.com/feed.xml",
        siteUrl: "https://existing.example.com",
        enabled: true,
        aiParsingEnabled: false,
      },
    });

    for (let index = 0; index < 6; index += 1) {
      const clusterId = `existing-cluster-${index + 1}`;
      await prisma.contentCluster.create({
        data: {
          id: clusterId,
          kind: "topic",
          title: `历史聚合 ${index + 1}`,
          summary: `历史聚合摘要 ${index + 1}`,
          score: 70 + index,
          itemCount: 1,
          latestPublishedAt: new Date(`2026-04-0${index + 4}T09:00:00.000Z`),
          status: "active",
          fingerprint: `existing-fingerprint-${index + 1}`,
        },
      });

      await prisma.item.create({
        data: {
          id: `existing-item-${index + 1}`,
          sourceId: source.id,
          clusterId,
          originalUrl: `https://existing.example.com/posts/${index + 1}`,
          canonicalUrl: `https://existing.example.com/posts/${index + 1}`,
          urlHash: `existing-hash-${index + 1}`,
          dedupeSignature: `existing|${index + 1}`,
          originalTitle: `历史事件 ${index + 1}`,
          translatedTitle: `历史事件 ${index + 1}`,
          publishedAt: new Date(`2026-04-0${index + 4}T09:00:00.000Z`),
          summaryText: `历史内容 ${index + 1}`,
          status: "processed",
          moderationStatus: "allowed",
          qualityScore: 70 + index,
          qualityRationale: "历史聚合候选",
          language: "zh",
        },
      });
    }

    const parser = {
      parseURL: vi.fn().mockResolvedValue({
        items: [
          {
            title: "A new clusterable story",
            link: "https://example.com/posts/new-clusterable-story",
            isoDate: "2026-04-10T10:00:00.000Z",
            contentSnippet: "Fresh story summary",
            creator: "Alex",
          },
        ],
      }),
    };

    const aiProvider = {
      enrichContent: vi.fn().mockResolvedValue({
        translatedTitle: "新的可聚合事件",
        summary: "这是一条需要与历史聚合比较的新内容。",
        moderationStatus: "allowed",
        moderationReason: null,
        moderationDetail: "需要比对全部 7 天候选聚合。",
        qualityScore: 86,
        qualityRationale: "事实明确",
        eventSignature: buildEventSignature(),
      }),
      summarizeCluster: vi.fn().mockResolvedValue("不会被使用"),
      matchClusterCandidate: vi.fn().mockImplementation(async (_input: string, metadata: { candidates: Array<{ id: string }> }) => {
        expect(metadata.candidates).toHaveLength(6);
        expect(metadata.candidates.map((candidate) => candidate.id)).toContain("existing-cluster-6");
        return "existing-cluster-6";
      }),
    };

    await runIngestion({
      trigger: "manual",
      parser,
      articleFetcher: vi.fn(),
      aiProvider,
      sourceConfigs: [
        {
          name: "Example Feed",
          rssUrl: "https://example.com/feed.xml",
          siteUrl: "https://example.com",
          enabled: true,
          aiParsingEnabled: true,
        },
      ],
      blacklist: [],
      now: new Date("2026-04-10T10:30:00.000Z"),
    });

    expect(aiProvider.matchClusterCandidate).toHaveBeenCalledTimes(1);

    const storedItem = await prisma.item.findFirstOrThrow({
      where: { originalTitle: "A new clusterable story" },
    });

    expect(storedItem.clusterId).toBe("existing-cluster-6");
  });

  it("falls back to processed items when article fetch and ai enrichment fail", async () => {
    const parser = {
      parseURL: vi.fn().mockResolvedValue({
        items: [
          {
            title: "OpenAI acquires Example Corp",
            link: "https://example.com/posts/acquisition",
            isoDate: "2026-04-10T09:00:00.000Z",
            contentSnippet: "RSS fallback summary",
            creator: "Alex",
          },
        ],
      }),
    };

    const articleFetcher = vi.fn().mockRejectedValue(new Error("Article fetch failed with status 404"));
    const aiProvider = {
      enrichContent: vi.fn().mockRejectedValue(new Error("Upstream ai timeout")),
      summarizeCluster: vi.fn().mockResolvedValue("不会被使用"),
      matchClusterCandidate: vi.fn().mockResolvedValue(null),
    };

    const result = await runIngestion({
      trigger: "manual",
      parser,
      articleFetcher,
      aiProvider,
      sourceConfigs: [
        {
          name: "Example Feed",
          rssUrl: "https://example.com/feed.xml",
          siteUrl: "https://example.com",
          enabled: true,
          aiParsingEnabled: true,
        },
      ],
      blacklist: [],
      now: new Date("2026-04-10T10:00:00.000Z"),
    });

    expect(result.status).toBe("succeeded");
    expect(result.successCount).toBe(1);
    expect(result.failureCount).toBe(0);

    const storedItem = await prisma.item.findFirstOrThrow();
    expect(storedItem.status).toBe("processed");
    expect(storedItem.translatedTitle).toBeNull();
    expect(storedItem.summaryText).toBe("RSS fallback summary");
    expect(storedItem.moderationStatus).toBe("allowed");
    expect(storedItem.qualityScore).toBe(50);
    expect(storedItem.qualityRationale).toBe("AI analysis unavailable");
    expect(storedItem.errorMessage).toContain("Article fetch failed with status 404");
    expect(storedItem.errorMessage).toContain("Upstream ai timeout");
  });

  it("limits concurrent item processing to the configured concurrency", async () => {
    let activeCalls = 0;
    let maxConcurrentCalls = 0;

    const parser = {
      parseURL: vi.fn().mockResolvedValue({
        items: Array.from({ length: 4 }, (_, index) => ({
          title: `English Headline ${index + 1}`,
          link: `https://example.com/posts/${index + 1}`,
          isoDate: `2026-04-10T0${index}:00:00.000Z`,
          content: "A".repeat(120),
        })),
      }),
    };

    const aiProvider = {
      enrichContent: vi.fn().mockImplementation(async () => {
        activeCalls += 1;
        maxConcurrentCalls = Math.max(maxConcurrentCalls, activeCalls);
        await new Promise((resolve) => setTimeout(resolve, 20));
        activeCalls -= 1;

        return {
          translatedTitle: "中文标题",
          summary: "中文摘要",
          moderationStatus: "allowed",
          moderationReason: null,
          moderationDetail: null,
          qualityScore: 80,
          qualityRationale: "高质量",
          eventSignature: buildEventSignature({
            eventType: "other",
            eventSubject: "English Headline",
            eventAction: "报道",
            eventObject: "cluster",
          }),
        };
      }),
      summarizeCluster: vi.fn().mockResolvedValue("聚合摘要"),
      matchClusterCandidate: vi.fn().mockResolvedValue(null),
    };

    await runIngestion({
      trigger: "manual",
      parser,
      articleFetcher: vi.fn(),
      aiProvider,
      sourceConfigs: [
        {
          name: "Example Feed",
          rssUrl: "https://example.com/feed.xml",
          siteUrl: "https://example.com",
          enabled: true,
          aiParsingEnabled: true,
        },
      ],
      blacklist: [],
      now: new Date("2026-04-10T10:00:00.000Z"),
      itemConcurrency: 2,
    });

    expect(maxConcurrentCalls).toBeLessThanOrEqual(2);
    expect(aiProvider.enrichContent).toHaveBeenCalledTimes(4);
  });

  it("stores sanitized plain-text summaries when rss content contains html", async () => {
    const parser = {
      parseURL: vi.fn().mockResolvedValue({
        items: [
          {
            title: "Token economics guide",
            link: "https://example.com/posts/token-economics",
            isoDate: "2026-04-10T09:00:00.000Z",
            content: "<p>Token economy summary</p>",
            contentSnippet: "Token economy summary",
          },
        ],
      }),
    };

    const aiProvider = {
      enrichContent: vi.fn().mockResolvedValue({
        translatedTitle: "Token 经济学指南",
        summary: "<p>Token economy summary</p>",
        moderationStatus: "allowed",
        moderationReason: null,
        moderationDetail: null,
        qualityScore: 82,
        qualityRationale: "高质量",
        eventSignature: buildEventSignature({
          eventType: "research",
          eventSubject: "Token economy",
          eventAction: "解读",
          eventObject: "explainer",
        }),
      }),
      summarizeCluster: vi.fn().mockResolvedValue("聚合摘要"),
      matchClusterCandidate: vi.fn().mockResolvedValue(null),
    };

    await runIngestion({
      trigger: "manual",
      parser,
      articleFetcher: vi.fn(),
      aiProvider,
      sourceConfigs: [
        {
          name: "Example Feed",
          rssUrl: "https://example.com/feed.xml",
          siteUrl: "https://example.com",
          enabled: true,
          aiParsingEnabled: true,
        },
      ],
      blacklist: [],
      now: new Date("2026-04-10T10:00:00.000Z"),
    });

    const storedItem = await prisma.item.findFirstOrThrow();
    expect(storedItem.summaryText).toBe("Token economy summary");
  });

  it("does not call cluster summary ai for single-item clusters", async () => {
    const parser = {
      parseURL: vi.fn().mockResolvedValue({
        items: [
          {
            title: "Solo launch coverage",
            link: "https://example.com/posts/solo-launch",
            isoDate: "2026-04-10T09:00:00.000Z",
            contentSnippet: "Single item summary",
          },
        ],
      }),
    };

    const summarizeCluster = vi.fn().mockResolvedValue("不应该被调用");
    const aiProvider = {
      enrichContent: vi.fn().mockResolvedValue({
        translatedTitle: "单条发布报道",
        summary: "这是单条内容的摘要。",
        moderationStatus: "allowed",
        moderationReason: null,
        moderationDetail: null,
        qualityScore: 82,
        qualityRationale: "高质量",
        eventSignature: buildEventSignature({
          eventType: "launch",
          eventSubject: "OpenAI",
          eventAction: "发布",
          eventObject: "solo launch",
        }),
      }),
      summarizeCluster,
      matchClusterCandidate: vi.fn().mockResolvedValue(null),
    };

    await runIngestion({
      trigger: "manual",
      parser,
      articleFetcher: vi.fn(),
      aiProvider,
      sourceConfigs: [
        {
          name: "Example Feed",
          rssUrl: "https://example.com/feed.xml",
          siteUrl: "https://example.com",
          enabled: true,
          aiParsingEnabled: true,
        },
      ],
      blacklist: [],
      now: new Date("2026-04-10T10:00:00.000Z"),
    });

    expect(summarizeCluster).not.toHaveBeenCalled();

    const storedCluster = await prisma.contentCluster.findFirstOrThrow();
    expect(storedCluster.itemCount).toBe(1);
    expect(storedCluster.summary).toBe("这是单条内容的摘要。");
    expect(storedCluster.title).toBe("OpenAI 发布 solo launch");
  });

  it("reuses existing analysis when the rss title, content, and published time are unchanged", async () => {
    const source = await prisma.source.create({
      data: {
        name: "Example Feed",
        rssUrl: "https://example.com/feed.xml",
        siteUrl: "https://example.com",
        enabled: true,
        aiParsingEnabled: false,
      },
    });
    const publishedAt = new Date("2026-04-10T09:00:00.000Z");
    const originalUrl = "https://example.com/posts/openai-toolkit";
    const originalTitle = "OpenAI ships a new agent toolkit";
    const rssContent = "Brief summary";
    const rssExcerpt = "Brief summary";
    const dedupeKeys = buildDedupeKeys({
      sourceName: source.name,
      canonicalUrl: originalUrl,
      title: originalTitle,
      publishedAt,
    });

    await prisma.item.create({
      data: {
        sourceId: source.id,
        originalUrl,
        canonicalUrl: dedupeKeys.canonicalUrl,
        urlHash: dedupeKeys.urlHash,
        dedupeSignature: dedupeKeys.signature,
        originalTitle,
        translatedTitle: "OpenAI 发布新的 Agent 工具包",
        author: "Alex",
        publishedAt,
        rssExcerpt,
        rssContent,
        summaryText: "保留已有摘要",
        status: "processed",
        moderationStatus: "allowed",
        qualityScore: 91,
        qualityRationale: "多事实点且时效性强",
        aiProcessedAt: new Date("2026-04-10T09:05:00.000Z"),
      },
    });

    const parser = {
      parseURL: vi.fn().mockResolvedValue({
        items: [
          {
            title: originalTitle,
            link: originalUrl,
            isoDate: "2026-04-10T09:00:00.000Z",
            contentSnippet: rssContent,
            creator: "Alex",
          },
        ],
      }),
    };
    const aiProvider = {
      enrichContent: vi.fn().mockResolvedValue({
        translatedTitle: "不应该被调用",
        summary: "不应该被调用",
        moderationStatus: "allowed",
        moderationReason: null,
        moderationDetail: null,
        qualityScore: 99,
        qualityRationale: "不应该被调用",
        eventSignature: buildEventSignature(),
      }),
      summarizeCluster: vi.fn().mockResolvedValue("不会被使用"),
      matchClusterCandidate: vi.fn().mockResolvedValue(null),
    };

    await runIngestion({
      trigger: "manual",
      parser,
      articleFetcher: vi.fn(),
      aiProvider,
      sourceConfigs: [
        {
          name: "Example Feed",
          rssUrl: "https://example.com/feed.xml",
          siteUrl: "https://example.com",
          enabled: true,
          aiParsingEnabled: true,
        },
      ],
      blacklist: [],
      now: new Date("2026-04-10T10:00:00.000Z"),
    });

    expect(aiProvider.enrichContent).not.toHaveBeenCalled();

    const storedItem = await prisma.item.findFirstOrThrow({
      where: { sourceId: source.id },
    });
    expect(storedItem.summaryText).toBe("保留已有摘要");
    expect(storedItem.qualityScore).toBe(91);
  });

  it("reruns ai analysis when an existing item's rss content changes", async () => {
    const source = await prisma.source.create({
      data: {
        name: "Example Feed",
        rssUrl: "https://example.com/feed.xml",
        siteUrl: "https://example.com",
        enabled: true,
        aiParsingEnabled: false,
      },
    });
    const publishedAt = new Date("2026-04-10T09:00:00.000Z");
    const originalUrl = "https://example.com/posts/openai-toolkit";
    const originalTitle = "OpenAI ships a new agent toolkit";
    const dedupeKeys = buildDedupeKeys({
      sourceName: source.name,
      canonicalUrl: originalUrl,
      title: originalTitle,
      publishedAt,
    });

    await prisma.item.create({
      data: {
        sourceId: source.id,
        originalUrl,
        canonicalUrl: dedupeKeys.canonicalUrl,
        urlHash: dedupeKeys.urlHash,
        dedupeSignature: dedupeKeys.signature,
        originalTitle,
        translatedTitle: "旧标题",
        author: "Alex",
        publishedAt,
        rssExcerpt: "Old summary",
        rssContent: "Old summary",
        summaryText: "旧摘要",
        status: "processed",
        moderationStatus: "allowed",
        qualityScore: 70,
        qualityRationale: "旧评分",
        aiProcessedAt: new Date("2026-04-10T09:05:00.000Z"),
      },
    });

    const parser = {
      parseURL: vi.fn().mockResolvedValue({
        items: [
          {
            title: originalTitle,
            link: originalUrl,
            isoDate: "2026-04-10T09:00:00.000Z",
            contentSnippet: "Updated summary with new facts",
            creator: "Alex",
          },
        ],
      }),
    };
    const aiProvider = {
      enrichContent: vi.fn().mockResolvedValue({
        translatedTitle: "OpenAI 发布新的 Agent 工具包",
        summary: "更新后的摘要",
        moderationStatus: "allowed",
        moderationReason: null,
        moderationDetail: "信息已更新",
        qualityScore: 95,
        qualityRationale: "内容更完整",
        eventSignature: buildEventSignature({
          eventType: "launch",
          eventSubject: "OpenAI",
          eventAction: "发布",
          eventObject: "agent toolkit",
        }),
      }),
      summarizeCluster: vi.fn().mockResolvedValue("不会被使用"),
      matchClusterCandidate: vi.fn().mockResolvedValue(null),
    };

    await runIngestion({
      trigger: "manual",
      parser,
      articleFetcher: vi.fn(),
      aiProvider,
      sourceConfigs: [
        {
          name: "Example Feed",
          rssUrl: "https://example.com/feed.xml",
          siteUrl: "https://example.com",
          enabled: true,
          aiParsingEnabled: true,
        },
      ],
      blacklist: [],
      now: new Date("2026-04-10T10:00:00.000Z"),
    });

    expect(aiProvider.enrichContent).toHaveBeenCalledOnce();

    const storedItem = await prisma.item.findFirstOrThrow({
      where: { sourceId: source.id },
    });
    expect(storedItem.summaryText).toBe("更新后的摘要");
    expect(storedItem.qualityScore).toBe(95);
    expect(storedItem.rssExcerpt).toBe("Updated summary with new facts");
  });

  it("uses database-backed runtime settings when explicit ingestion options are omitted", async () => {
    const modelConfig = await prisma.modelApiConfig.create({
      data: {
        name: "数据库默认模型",
        baseUrl: "https://db.example.com/v1",
        apiKey: "sk-db",
        modelName: "gpt-db",
        ingestionItemConcurrency: 5,
        isEnabled: true,
        isDefault: true,
      },
    });

    await prisma.promptConfig.createMany({
      data: [
        {
          name: "数据库默认内容分析提示词",
          type: "item_analysis",
          prompt: "标题：{{title}}\n正文：{{inputText}}",
          systemPrompt: "数据库内容分析提示词",
          modelApiConfigId: modelConfig.id,
          isEnabled: true,
          isDefault: true,
        },
        {
          name: "数据库默认聚合摘要提示词",
          type: "cluster_summary",
          prompt: "主题：{{title}}\n候选内容：{{inputText}}",
          systemPrompt: "数据库聚合摘要提示词",
          isEnabled: true,
          isDefault: true,
        },
        {
          name: "数据库默认归组判定提示词",
          type: "cluster_match",
          prompt: "当前内容标题：{{title}}\n候选聚合组：{{candidatesJson}}",
          systemPrompt: "数据库归组判定提示词",
          isEnabled: true,
          isDefault: true,
        },
      ],
    });

    await prisma.blacklistKeyword.create({
      data: {
        keyword: "blocked",
      },
    });

    await prisma.source.create({
      data: {
        name: "Database Feed",
        rssUrl: "https://db.example.com/feed.xml",
        siteUrl: "https://db.example.com",
        enabled: true,
        aiParsingEnabled: true,
      },
    });

    const parser = {
      parseURL: vi.fn().mockResolvedValue({
        items: [
          {
            title: "Database-configured story",
            link: "https://db.example.com/posts/1",
            isoDate: "2026-04-10T09:00:00.000Z",
            content: "Body from database-driven ingestion settings",
          },
        ],
      }),
    };

    const aiProvider = {
      enrichContent: vi.fn().mockResolvedValue({
        translatedTitle: "数据库驱动的标题",
        summary: "数据库中的运行时配置已生效。",
        moderationStatus: "allowed",
        moderationReason: null,
        moderationDetail: null,
        qualityScore: 80,
        qualityRationale: "高质量",
        eventSignature: buildEventSignature({
          eventType: "other",
          eventSubject: "Database configured story",
          eventAction: "报道",
          eventObject: "story",
        }),
      }),
      summarizeCluster: vi.fn().mockResolvedValue("聚合摘要"),
      matchClusterCandidate: vi.fn().mockResolvedValue(null),
    };

    const result = await runIngestion({
      trigger: "manual",
      parser,
      articleFetcher: vi.fn(),
      aiProvider,
      now: new Date("2026-04-10T10:00:00.000Z"),
    });

    expect(result.status).toBe("succeeded");
    expect(parser.parseURL).toHaveBeenCalledWith("https://db.example.com/feed.xml");
    expect(aiProvider.enrichContent).toHaveBeenCalledOnce();
  });
});
