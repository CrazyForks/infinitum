import { beforeEach, describe, expect, it, vi } from "vitest";

import { prisma } from "@/lib/db";
import { executePrecomputeTask } from "@/lib/precompute/service";
import { precomputeTagSuggestionCandidates } from "@/lib/tags/service";

const requireAdmin = vi.fn();

vi.mock("@/lib/admin/session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/admin/session")>();

  return {
    ...actual,
    requireAdmin,
  };
});

async function createSourceAndItems() {
  const source = await prisma.source.create({
    data: {
      name: "Admin Tags",
      rssUrl: "https://admin-tags.example.com/feed.xml",
      siteUrl: "https://admin-tags.example.com",
      enabled: true,
      aiParsingEnabled: true,
    },
  });
  await prisma.item.createMany({
    data: [
      {
        id: "admin-tag-a",
        sourceId: source.id,
        originalUrl: "https://admin-tags.example.com/a",
        canonicalUrl: "https://admin-tags.example.com/a",
        urlHash: "admin-tag-a",
        dedupeSignature: "admin-tag-a",
        originalTitle: "Admin Tag A",
        publishedAt: new Date("2026-04-10T10:00:00.000Z"),
        status: "processed",
        moderationStatus: "allowed",
        qualityScore: 80,
        qualityRationale: "ok",
        language: "en",
      },
      {
        id: "admin-tag-b",
        sourceId: source.id,
        originalUrl: "https://admin-tags.example.com/b",
        canonicalUrl: "https://admin-tags.example.com/b",
        urlHash: "admin-tag-b",
        dedupeSignature: "admin-tag-b",
        originalTitle: "Admin Tag B",
        publishedAt: new Date("2026-04-10T10:00:00.000Z"),
        status: "processed",
        moderationStatus: "allowed",
        qualityScore: 80,
        qualityRationale: "ok",
        language: "en",
      },
    ],
  });

  return source;
}

async function createAdminTagItem(sourceId: string, id: string) {
  await prisma.item.create({
    data: {
      id,
      sourceId,
      originalUrl: `https://admin-tags.example.com/${id}`,
      canonicalUrl: `https://admin-tags.example.com/${id}`,
      urlHash: id,
      dedupeSignature: id,
      originalTitle: id,
      publishedAt: new Date("2026-04-10T10:00:00.000Z"),
      status: "processed",
      moderationStatus: "allowed",
      qualityScore: 80,
      qualityRationale: "ok",
      language: "en",
    },
  });
}

describe("/api/admin/settings/tags", () => {
  beforeEach(async () => {
    requireAdmin.mockResolvedValue(undefined);
    await prisma.item.deleteMany();
    await prisma.backgroundTaskRun.deleteMany();
    await prisma.tagSuggestionCandidate.deleteMany();
    await prisma.tagSuggestionDecision.deleteMany();
    await prisma.tag.deleteMany();
    await prisma.source.deleteMany();
  });

  it("lists tags with usage and aliases for admins", async () => {
    await createSourceAndItems();
    const tag = await prisma.tag.create({
      data: {
        name: "AI Agent",
        normalized: "ai agent",
      },
    });
    await prisma.itemTag.create({
      data: {
        itemId: "admin-tag-a",
        tagId: tag.id,
      },
    });
    await prisma.tagAlias.create({
      data: {
        tagId: tag.id,
        aliasName: "智能体",
        aliasNormalized: "智能体",
      },
    });

    const { GET } = await import("@/app/api/admin/settings/tags/route");
    const response = await GET(new Request("http://localhost/api/admin/settings/tags?search=智能体"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.totalCount).toBe(1);
    expect(json.tags[0]).toMatchObject({
      name: "AI Agent",
      normalized: "ai agent",
      itemCount: 1,
      aliasCount: 1,
    });
    expect(json.tags[0].aliases[0].aliasName).toBe("智能体");
  });

  it("adds aliases through the admin endpoint", async () => {
    const tag = await prisma.tag.create({
      data: {
        name: "AI Agent",
        normalized: "ai agent",
      },
    });

    const { POST } = await import("@/app/api/admin/settings/tags/aliases/route");
    const response = await POST(new Request("http://localhost/api/admin/settings/tags/aliases", {
      method: "POST",
      body: JSON.stringify({
        tagId: tag.id,
        aliasName: "智能体",
      }),
    }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.alias.aliasNormalized).toBe("智能体");
  });

  it("lists and suppresses tag governance suggestions for admins", async () => {
    await createSourceAndItems();
    const canonical = await prisma.tag.create({
      data: {
        name: "OpenAI",
        normalized: "openai",
      },
    });
    const variant = await prisma.tag.create({
      data: {
        name: "Open AI",
        normalized: "open ai",
      },
    });
    await prisma.itemTag.createMany({
      data: [
        {
          itemId: "admin-tag-a",
          tagId: canonical.id,
        },
        {
          itemId: "admin-tag-b",
          tagId: variant.id,
        },
      ],
    });
    await precomputeTagSuggestionCandidates();

    const { GET, POST } = await import("@/app/api/admin/settings/tags/suggestions/route");
    const response = await GET(new Request("http://localhost/api/admin/settings/tags/suggestions?search=open&page=1&pageSize=10"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.totalCount).toBe(1);
    expect(json.page).toBe(1);
    expect(json.pageSize).toBe(10);
    expect(json.suggestions[0]).toMatchObject({
      sourceTag: {
        id: variant.id,
        name: "Open AI",
      },
      targetTag: {
        id: canonical.id,
        name: "OpenAI",
      },
      affectedItemCount: 1,
    });
    expect(json.suggestions[0].confidence).toBeGreaterThanOrEqual(0.95);

    const dismissResponse = await POST(new Request("http://localhost/api/admin/settings/tags/suggestions", {
      method: "POST",
      body: JSON.stringify({
        sourceTagId: variant.id,
        targetTagId: canonical.id,
        decision: "kept",
      }),
    }));

    expect(dismissResponse.status).toBe(200);
    await expect(prisma.tagSuggestionDecision.findUnique({
      where: {
        sourceTagNormalized_targetTagNormalized: {
          sourceTagNormalized: "open ai",
          targetTagNormalized: "openai",
        },
      },
    })).resolves.toMatchObject({ decision: "kept" });

    const suppressedResponse = await GET(new Request("http://localhost/api/admin/settings/tags/suggestions?search=open&page=1&pageSize=10"));
    const suppressedJson = await suppressedResponse.json();
    expect(suppressedJson.totalCount).toBe(0);
  });

  it("sorts tag governance suggestions by affected item count before pagination", async () => {
    const source = await createSourceAndItems();
    await Promise.all([
      createAdminTagItem(source.id, "admin-tag-c"),
      createAdminTagItem(source.id, "admin-tag-d"),
      createAdminTagItem(source.id, "admin-tag-e"),
      createAdminTagItem(source.id, "admin-tag-f"),
      createAdminTagItem(source.id, "admin-tag-g"),
      createAdminTagItem(source.id, "admin-tag-h"),
    ]);
    const openAi = await prisma.tag.create({
      data: {
        name: "OpenAI",
        normalized: "openai",
      },
    });
    const openAiVariant = await prisma.tag.create({
      data: {
        name: "Open AI",
        normalized: "open ai",
      },
    });
    const aiAgent = await prisma.tag.create({
      data: {
        name: "AI Agent",
        normalized: "ai agent",
      },
    });
    const aiAgents = await prisma.tag.create({
      data: {
        name: "AI Agents",
        normalized: "ai agents",
      },
    });
    await prisma.itemTag.createMany({
      data: [
        { itemId: "admin-tag-a", tagId: openAi.id },
        { itemId: "admin-tag-c", tagId: openAi.id },
        { itemId: "admin-tag-d", tagId: openAi.id },
        { itemId: "admin-tag-e", tagId: openAi.id },
        { itemId: "admin-tag-b", tagId: openAiVariant.id },
        { itemId: "admin-tag-f", tagId: openAiVariant.id },
        { itemId: "admin-tag-g", tagId: openAiVariant.id },
        { itemId: "admin-tag-a", tagId: aiAgent.id },
        { itemId: "admin-tag-c", tagId: aiAgent.id },
        { itemId: "admin-tag-d", tagId: aiAgent.id },
        { itemId: "admin-tag-e", tagId: aiAgent.id },
        { itemId: "admin-tag-h", tagId: aiAgent.id },
        { itemId: "admin-tag-b", tagId: aiAgents.id },
        { itemId: "admin-tag-f", tagId: aiAgents.id },
        { itemId: "admin-tag-g", tagId: aiAgents.id },
        { itemId: "admin-tag-h", tagId: aiAgents.id },
      ],
    });
    await precomputeTagSuggestionCandidates();

    const { GET } = await import("@/app/api/admin/settings/tags/suggestions/route");
    const response = await GET(new Request("http://localhost/api/admin/settings/tags/suggestions?sort=affected_desc&page=1&pageSize=1"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.totalCount).toBe(2);
    expect(json.suggestions).toHaveLength(1);
    expect(json.suggestions[0]).toMatchObject({
      sourceTag: {
        id: aiAgents.id,
        name: "AI Agents",
      },
      targetTag: {
        id: aiAgent.id,
        name: "AI Agent",
      },
      affectedItemCount: 4,
    });
  });

  it("auto-merges high-confidence existing tag suggestions for admins", async () => {
    await createSourceAndItems();
    const canonical = await prisma.tag.create({
      data: {
        name: "OpenAI",
        normalized: "openai",
      },
    });
    const variant = await prisma.tag.create({
      data: {
        name: "Open AI",
        normalized: "open ai",
      },
    });
    await prisma.itemTag.createMany({
      data: [
        {
          itemId: "admin-tag-a",
          tagId: canonical.id,
        },
        {
          itemId: "admin-tag-b",
          tagId: variant.id,
        },
      ],
    });

    const { POST } = await import("@/app/api/admin/settings/tags/suggestions/route");
    const response = await POST(new Request("http://localhost/api/admin/settings/tags/suggestions", {
      method: "POST",
      body: JSON.stringify({
        action: "auto_merge_high_confidence",
      }),
    }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toMatchObject({
      scannedCount: 1,
      mergedCount: 1,
      failedCount: 0,
    });
    await expect(prisma.tag.findMany({
      include: {
        aliases: true,
        items: true,
      },
    })).resolves.toEqual([
      expect.objectContaining({
        id: canonical.id,
        normalized: "openai",
        aliases: [
          expect.objectContaining({
            aliasNormalized: "open ai",
            createdBy: "system:auto-merge",
          }),
        ],
        items: expect.arrayContaining([
          expect.objectContaining({ itemId: "admin-tag-a" }),
          expect.objectContaining({ itemId: "admin-tag-b" }),
        ]),
      }),
    ]);
  });

  it("runs generic precompute tasks and stores tag governance candidates", async () => {
    await createSourceAndItems();
    const canonical = await prisma.tag.create({
      data: {
        name: "OpenAI",
        normalized: "openai",
      },
    });
    const variant = await prisma.tag.create({
      data: {
        name: "Open AI",
        normalized: "open ai",
      },
    });
    await prisma.itemTag.createMany({
      data: [
        {
          itemId: "admin-tag-a",
          tagId: canonical.id,
        },
        {
          itemId: "admin-tag-b",
          tagId: variant.id,
        },
      ],
    });
    const taskRun = await prisma.backgroundTaskRun.create({
      data: {
        kind: "precompute",
        triggerType: "manual",
        status: "queued",
        label: "预计算",
      },
    });

    await executePrecomputeTask(taskRun);

    await expect(prisma.tagSuggestionCandidate.findMany()).resolves.toEqual([
      expect.objectContaining({
        sourceTagId: variant.id,
        targetTagId: canonical.id,
        confidence: expect.any(Number),
        affectedItemCount: 1,
      }),
    ]);
    await expect(prisma.backgroundTaskRun.findUnique({
      where: { id: taskRun.id },
    })).resolves.toMatchObject({
      status: "succeeded",
      progressCurrent: 2,
      progressTotal: 2,
    });
  });

  it("keeps tag governance suggestion scans bounded for large tag sets", async () => {
    await prisma.tag.createMany({
      data: [
        ...Array.from({ length: 600 }, (_, index) => ({
          name: `Unrelated Topic ${index}`,
          normalized: `unrelated topic ${index}`,
        })),
        {
          name: "AI Agent",
          normalized: "ai agent",
        },
        {
          name: "AI Agents",
          normalized: "ai agents",
        },
      ],
    });

    const precomputeStartedAt = performance.now();
    const precomputeResult = await precomputeTagSuggestionCandidates();
    const precomputeElapsedMs = performance.now() - precomputeStartedAt;
    expect(precomputeElapsedMs).toBeLessThan(1_500);
    expect(precomputeResult.storedCandidates).toBeGreaterThanOrEqual(1);

    const { GET } = await import("@/app/api/admin/settings/tags/suggestions/route");
    const startedAt = performance.now();
    const response = await GET(new Request("http://localhost/api/admin/settings/tags/suggestions?search=Agent&sort=confidence_desc&page=1&pageSize=10"));
    const elapsedMs = performance.now() - startedAt;
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(elapsedMs).toBeLessThan(1_500);
    expect(json.totalCount).toBeGreaterThanOrEqual(1);
    expect(json.suggestions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceTag: expect.objectContaining({ name: "AI Agents" }),
          targetTag: expect.objectContaining({ name: "AI Agent" }),
        }),
      ]),
    );
  });
});
