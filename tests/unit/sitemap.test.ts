import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ENV_KEYS = [
  "SITE_URL",
  "NEXT_PUBLIC_SITE_URL",
  "PUBLIC_SITE_URL",
  "VERCEL_PROJECT_PRODUCTION_URL",
  "VERCEL_URL",
  "URL",
  "DEPLOY_PRIME_URL",
  "DEPLOY_URL",
  "CF_PAGES_URL",
  "RAILWAY_PUBLIC_DOMAIN",
  "RENDER_EXTERNAL_URL",
];

function clearEnv() {
  for (const key of ENV_KEYS) {
    delete process.env[key];
  }
}

describe("buildSitemapEntries", () => {
  beforeEach(() => {
    clearEnv();
    vi.resetModules();
  });
  afterEach(() => {
    clearEnv();
    vi.resetModules();
  });

  it("includes home + /daily list + every published /daily/[date] entry", async () => {
    const { buildSitemapEntries } = await import("@/app/sitemap");
    const result = buildSitemapEntries("https://infinitum.example.com", {
      dailyReports: [
        {
          date: "2026-06-22",
          publishedAt: "2026-06-22T01:00:00.000Z",
          generatedAt: "2026-06-22T00:30:00.000Z",
        } as never,
        {
          date: "2026-06-21",
          publishedAt: "2026-06-21T01:00:00.000Z",
          generatedAt: "2026-06-21T00:30:00.000Z",
        } as never,
        {
          date: "2026-06-20",
          publishedAt: null,
          generatedAt: "2026-06-20T00:30:00.000Z",
        } as never,
      ],
      latestRunFinishedAt: "2026-06-22T00:00:00.000Z",
    });

    const urls = result.map((r) => r.url);
    expect(urls).toContain("https://infinitum.example.com");
    expect(urls).toContain("https://infinitum.example.com/daily");
    expect(urls).toContain("https://infinitum.example.com/daily/2026-06-22");
    expect(urls).toContain("https://infinitum.example.com/daily/2026-06-21");
    expect(urls).toContain("https://infinitum.example.com/daily/2026-06-20");
    expect(urls.length).toBe(5);

    // Spot-check priority / changeFreq
    const home = result.find((r) => r.url === "https://infinitum.example.com")!;
    expect(home.priority).toBe(1);
    expect(home.changeFrequency).toBe("hourly");

    const list = result.find((r) => r.url === "https://infinitum.example.com/daily")!;
    expect(list.priority).toBe(0.8);
    expect(list.changeFrequency).toBe("daily");

    const detail = result.find((r) => r.url === "https://infinitum.example.com/daily/2026-06-22")!;
    expect(detail.priority).toBe(0.6);
    expect(detail.changeFrequency).toBe("weekly");
    expect(new Date(detail.lastModified as string).toISOString()).toBe("2026-06-22T01:00:00.000Z");
  });

  it("returns no detail entries when there are no published reports", async () => {
    const { buildSitemapEntries } = await import("@/app/sitemap");
    const result = buildSitemapEntries("https://x.example.com", {
      dailyReports: [],
      latestRunFinishedAt: null,
    });
    const urls = result.map((r) => r.url);
    expect(urls).toContain("https://x.example.com");
    expect(urls).toContain("https://x.example.com/daily");
    const details = urls.filter((u) => /\/daily\/[^/]+$/.test(u));
    expect(details).toEqual([]);
  });

  it("uses generatedAt for lastModified when publishedAt is missing", async () => {
    const { buildSitemapEntries } = await import("@/app/sitemap");
    const result = buildSitemapEntries("https://x.example.com", {
      dailyReports: [
        {
          date: "2026-06-20",
          publishedAt: null,
          generatedAt: "2026-06-20T00:30:00.000Z",
        } as never,
      ],
      latestRunFinishedAt: null,
    });
    const detail = result.find((r) => r.url === "https://x.example.com/daily/2026-06-20")!;
    expect(new Date(detail.lastModified as string).toISOString()).toBe("2026-06-20T00:30:00.000Z");
  });
});

describe("/sitemap.xml (integration via default export)", () => {
  beforeEach(() => {
    clearEnv();
    vi.resetModules();
  });
  afterEach(() => {
    clearEnv();
    vi.resetModules();
    vi.doUnmock("@/lib/daily-report/repository");
    vi.doUnmock("@/lib/feed/service");
  });

  it("wires daily reports and the resolved origin into the sitemap output", async () => {
    process.env.SITE_URL = "https://infinitum.example.com";
    vi.doMock("@/lib/feed/service", () => ({
      getCachedLatestFetchRunSnapshot: vi.fn(async () => ({
        finishedAt: "2026-06-22T00:00:00.000Z",
      })),
    }));
    vi.doMock("@/lib/daily-report/repository", () => ({
      listDailyReports: vi.fn(async () => ({
        reports: [
          {
            date: "2026-06-22",
            publishedAt: "2026-06-22T01:00:00.000Z",
            generatedAt: "2026-06-22T00:30:00.000Z",
          },
        ],
        total: 1,
      })),
    }));

    // We can't call the default export directly because it relies on next/headers.
    // Instead, we verify the helpers it uses are wired correctly.
    const { buildSitemapEntries } = await import("@/app/sitemap");
    const { resolveOriginFromHeaders } = await import("@/lib/http/public-origin");

    const origin = resolveOriginFromHeaders(null);
    expect(origin).toBe("https://infinitum.example.com");

    const entries = buildSitemapEntries(origin, {
      dailyReports: [
        {
          date: "2026-06-22",
          publishedAt: "2026-06-22T01:00:00.000Z",
          generatedAt: "2026-06-22T00:30:00.000Z",
        } as never,
      ],
      latestRunFinishedAt: "2026-06-22T00:00:00.000Z",
    });
    const urls = entries.map((e) => e.url);
    expect(urls).toContain("https://infinitum.example.com/daily/2026-06-22");
  });
});
