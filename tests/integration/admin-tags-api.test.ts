import { beforeEach, describe, expect, it, vi } from "vitest";

import { prisma } from "@/lib/db";

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
}

describe("/api/admin/settings/tags", () => {
  beforeEach(async () => {
    requireAdmin.mockResolvedValue(undefined);
    await prisma.item.deleteMany();
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
});
