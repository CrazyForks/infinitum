import { beforeEach, describe, expect, it, vi } from "vitest";

import { prisma } from "@/lib/db";

describe("/api/feed", () => {
  beforeEach(async () => {
    await prisma.item.deleteMany();
    await prisma.fetchRun.deleteMany();
    await prisma.source.deleteMany();

    const source = await prisma.source.create({
      data: {
        name: "API Feed",
        rssUrl: "https://api.example.com/feed.xml",
        siteUrl: "https://api.example.com",
        enabled: true,
        fetchFullTextWhenMissing: true,
      },
    });

    await prisma.item.createMany({
      data: [
        {
          sourceId: source.id,
          originalUrl: "https://api.example.com/a",
          canonicalUrl: "https://api.example.com/a",
          urlHash: "hash-a",
          dedupeSignature: "api feed|story a|2026-04-10t09:00:00.000z",
          originalTitle: "Story A",
          translatedTitle: "故事 A",
          author: "Author A",
          publishedAt: new Date("2026-04-10T09:00:00.000Z"),
          summaryText: "摘要 A",
          status: "processed",
          language: "en",
        },
        {
          sourceId: source.id,
          originalUrl: "https://api.example.com/b",
          canonicalUrl: "https://api.example.com/b",
          urlHash: "hash-b",
          dedupeSignature: "api feed|story b|2026-04-01t09:00:00.000z",
          originalTitle: "Story B",
          author: "Author B",
          publishedAt: new Date("2026-04-01T09:00:00.000Z"),
          summaryText: "摘要 B",
          status: "processed",
          language: "en",
        },
        {
          sourceId: source.id,
          originalUrl: "https://api.example.com/c",
          canonicalUrl: "https://api.example.com/c",
          urlHash: "hash-c",
          dedupeSignature: "api feed|story c|2026-04-10t08:00:00.000z",
          originalTitle: "Story C",
          publishedAt: new Date("2026-04-10T08:00:00.000Z"),
          summaryText: "摘要 C",
          status: "filtered",
          filterReason: "layoffs",
          language: "en",
        },
      ],
    });
  });

  it("returns non-filtered items in descending publish order for the selected range", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-10T12:00:00.000Z"));

    const { GET } = await import("@/app/api/feed/route");
    const response = await GET(
      new Request("http://localhost/api/feed?range=7d"),
    );

    const json = await response.json();

    expect(json.items).toHaveLength(1);
    expect(json.items[0].title).toBe("故事 A");
    expect(json.items[0].summary).toBe("摘要 A");

    vi.useRealTimers();
  });
});
