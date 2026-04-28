import { afterEach, describe, expect, it, vi } from "vitest";

describe("/api/daily/rss", () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("@/lib/daily-report/repository");
  });

  it("uses the public request url as the atom self link", async () => {
    vi.doMock("@/lib/daily-report/repository", () => ({
      listDailyReports: vi.fn(async () => ({
        reports: [
          {
            id: "daily-2026-04-26",
            date: "2026-04-26",
            timezone: "Asia/Shanghai",
            status: "published",
            title: "2026-04-26 AI 日报",
            openingSummary: "今日摘要",
            sourceCount: 3,
            generatedAt: "2026-04-26T00:30:00.000Z",
            publishedAt: "2026-04-26T01:00:00.000Z",
            errorMessage: null,
          },
        ],
        total: 1,
      })),
    }));

    const { GET } = await import("@/app/api/daily/rss/route");
    const response = await GET(
      new Request("http://0.0.0.0:3000/api/daily/rss?preview=1", {
        headers: {
          host: "0.0.0.0:3000",
          "x-forwarded-host": "news.example.com",
          "x-forwarded-proto": "https",
        },
      }),
    );

    const xml = await response.text();

    expect(xml).toContain("<link>https://news.example.com/daily</link>");
    expect(xml).toContain(
      '<atom:link href="https://news.example.com/api/daily/rss?preview=1" rel="self" type="application/rss+xml" />',
    );
    expect(xml).toContain("<link>https://news.example.com/daily/2026-04-26</link>");
  });
});
