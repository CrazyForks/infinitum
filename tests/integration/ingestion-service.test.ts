import { beforeEach, describe, expect, it, vi } from "vitest";

import { prisma } from "@/lib/db";
import { runIngestion } from "@/lib/ingestion/service";

describe("runIngestion", () => {
  beforeEach(async () => {
    await prisma.item.deleteMany();
    await prisma.fetchRun.deleteMany();
    await prisma.source.deleteMany();
    await prisma.sourceGroup.deleteMany();
    await prisma.blacklistKeyword.deleteMany();
    await prisma.appConfig.deleteMany();
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
      enrichContent: vi.fn().mockResolvedValue({
        translatedTitle: "OpenAI 发布新的 Agent 工具包",
        summary: "这篇文章介绍了 OpenAI 新发布的 agent 工具能力。",
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
    expect(result.successCount).toBe(1);
    expect(result.failureCount).toBe(0);
    expect(parser.parseURL).toHaveBeenCalledWith("https://example.com/feed.xml");
    expect(articleFetcher).toHaveBeenCalledTimes(1);
    expect(aiProvider.enrichContent).toHaveBeenCalledTimes(1);

    const storedItems = await prisma.item.findMany({
      orderBy: { publishedAt: "desc" },
      include: { source: true },
    });

    expect(storedItems).toHaveLength(2);
    expect(storedItems[0]?.translatedTitle).toBe("OpenAI 发布新的 Agent 工具包");
    expect(storedItems[0]?.summaryText).toBe("这篇文章介绍了 OpenAI 新发布的 agent 工具能力。");
    expect(storedItems[0]?.status).toBe("processed");
    expect(storedItems[1]?.status).toBe("filtered");
    expect(storedItems[1]?.filterReason).toBe("layoffs");

    const latestRun = await prisma.fetchRun.findFirst({ orderBy: { startedAt: "desc" } });
    expect(latestRun?.triggerType).toBe("manual");
    expect(latestRun?.status).toBe("succeeded");
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
        };
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
          fetchFullTextWhenMissing: false,
        },
      ],
      blacklist: [],
      now: new Date("2026-04-10T10:00:00.000Z"),
    });

    const storedItem = await prisma.item.findFirstOrThrow();
    expect(storedItem.summaryText).toBe("Token economy summary");
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
      }),
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
