import { beforeEach, describe, expect, it, vi } from "vitest";

import { prisma } from "@/lib/db";
import { runIngestion, runIngestionTask, startIngestionTask } from "@/lib/ingestion/service";
import { buildDedupeKeys } from "@/lib/ingestion/dedupe";

describe("runIngestion", () => {
  beforeEach(async () => {
    await prisma.item.deleteMany();
    await prisma.fetchRun.deleteMany();
    await prisma.backgroundTaskRun.deleteMany();
    await prisma.source.deleteMany();
    await prisma.sourceGroup.deleteMany();
    await prisma.blacklistKeyword.deleteMany();
    await prisma.appConfig.deleteMany();
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
        topicLabel: "OpenAI Agent",
        clusterHint: "OpenAI agent toolkit launch",
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
          fetchFullTextWhenMissing: false,
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
    expect(storedTaskRun.progressLabel).toBe("已处理 2/2 条内容，来自 1 个源，失败 0 项");
    expect(storedTaskRun.aiCallCountActual).toBe(5);
    expect(storedTaskRun.aiCallCountEstimated).toBe(5);
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
          topicLabel: "OpenAI Agent",
          clusterHint: "OpenAI agent toolkit launch",
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
          fetchFullTextWhenMissing: false,
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
            topicLabel: "Markets",
            clusterHint: "Generic market roundup",
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
            topicLabel: "Developer Agent Platform",
            clusterHint: "OpenAI developer toolkit for agents",
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
          topicLabel: "OpenAI Agent",
          clusterHint: "OpenAI agent toolkit launch",
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
          fetchFullTextWhenMissing: true,
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
            topicLabel: "企业AI工具",
            clusterHint: null,
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
          topicLabel: "企业AI工具",
          clusterHint: null,
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
          fetchFullTextWhenMissing: false,
        },
      ],
      blacklist: [],
      now: new Date("2026-04-10T10:00:00.000Z"),
    });

    const storedItems = await prisma.item.findMany({
      orderBy: { publishedAt: "asc" },
    });

    expect(storedItems).toHaveLength(2);
    expect(storedItems[0]?.topicLabel).toBe("企业AI工具");
    expect(storedItems[1]?.topicLabel).toBe("企业AI工具");
    expect(storedItems[0]?.clusterId).not.toBe(storedItems[1]?.clusterId);
    expect(aiProvider.matchClusterCandidate).toHaveBeenCalledTimes(1);

    const clusterCount = await prisma.contentCluster.count();
    expect(clusterCount).toBe(2);
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
          fetchFullTextWhenMissing: true,
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
          topicLabel: "English Headline",
          clusterHint: "English headline cluster",
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
          fetchFullTextWhenMissing: true,
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
        topicLabel: "Token Economy",
        clusterHint: "Token economy explainer",
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
          fetchFullTextWhenMissing: false,
        },
      ],
      blacklist: [],
      now: new Date("2026-04-10T10:00:00.000Z"),
    });

    const storedItem = await prisma.item.findFirstOrThrow();
    expect(storedItem.summaryText).toBe("Token economy summary");
  });

  it("reuses existing analysis when the rss title, content, and published time are unchanged", async () => {
    const source = await prisma.source.create({
      data: {
        name: "Example Feed",
        rssUrl: "https://example.com/feed.xml",
        siteUrl: "https://example.com",
        enabled: true,
        fetchFullTextWhenMissing: false,
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
        topicLabel: "OpenAI Agent",
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
        topicLabel: "Should Not Run",
        clusterHint: null,
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
          fetchFullTextWhenMissing: false,
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
        fetchFullTextWhenMissing: false,
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
        topicLabel: "Old Topic",
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
        topicLabel: "OpenAI Agent",
        clusterHint: "OpenAI agent toolkit launch",
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
          fetchFullTextWhenMissing: false,
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
    await prisma.appConfig.create({
      data: {
        id: "default",
        modelApiKey: "sk-db",
        modelApiBaseUrl: "https://db.example.com/v1",
        modelApiModel: "gpt-db",
        ingestionItemConcurrency: 2,
      },
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
        fetchFullTextWhenMissing: false,
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
        topicLabel: "Database Story",
        clusterHint: "Database configured story",
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
