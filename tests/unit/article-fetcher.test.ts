import { afterEach, describe, expect, it, vi } from "vitest";

import { createConfiguredArticleFetcher } from "@/lib/ingestion/article";
import type { RuntimeConfig } from "@/config/runtime";

function buildConfig(overrides: Partial<RuntimeConfig["contentExtraction"]> = {}): RuntimeConfig["contentExtraction"] {
  return {
    jinaEnabled: true,
    jinaBaseUrl: "https://r.jina.ai/",
    jinaApiKey: null,
    timeoutMs: 15_000,
    concurrency: 1,
    rpmLimit: 500,
    maxPerRun: 20,
    minChars: 20,
    maxChars: 32_000,
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createConfiguredArticleFetcher", () => {
  it("uses local extraction first by default", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    const localFetcher = vi.fn().mockResolvedValue("Local article content with enough signal.");

    const fetcher = createConfiguredArticleFetcher(buildConfig(), localFetcher);

    await expect(fetcher("https://example.com/post")).resolves.toBe("Local article content with enough signal.");
    expect(localFetcher).toHaveBeenCalledWith("https://example.com/post", undefined);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("falls back to Jina when local extraction is too short", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response("## Clean article\n\nJina markdown content with enough signal."));
    vi.stubGlobal("fetch", fetchMock);
    const localFetcher = vi.fn().mockResolvedValue("Too short");

    const fetcher = createConfiguredArticleFetcher(buildConfig(), localFetcher);

    await expect(fetcher("https://example.com/post")).resolves.toContain("Jina markdown content");
    expect(fetchMock).toHaveBeenCalledWith("https://r.jina.ai/https://example.com/post", expect.objectContaining({
      headers: expect.objectContaining({
        "X-Respond-With": "markdown",
      }),
    }));
  });

  it("uses Jina first for RSS HTML context when enabled", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response("Jina cleaned markdown body with enough signal."));
    vi.stubGlobal("fetch", fetchMock);
    const localFetcher = vi.fn().mockResolvedValue("Local article content with enough signal.");

    const fetcher = createConfiguredArticleFetcher(buildConfig(), localFetcher);

    await expect(fetcher("https://example.com/post", { reason: "rss_html" })).resolves.toContain("Jina cleaned");
    expect(localFetcher).not.toHaveBeenCalled();
  });

  it("uses local extraction for Weixin RSS HTML instead of Jina", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response("Jina should not be used."));
    vi.stubGlobal("fetch", fetchMock);
    const localFetcher = vi.fn().mockResolvedValue("Local Weixin article content with enough signal.");

    const fetcher = createConfiguredArticleFetcher(buildConfig(), localFetcher);

    await expect(fetcher("https://mp.weixin.qq.com/s/example", { reason: "rss_html" })).resolves.toBe(
      "Local Weixin article content with enough signal.",
    );
    expect(localFetcher).toHaveBeenCalledWith("https://mp.weixin.qq.com/s/example", { reason: "rss_html" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not fall back to Jina for Weixin pages when local extraction is too short", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response("Jina should not be used."));
    vi.stubGlobal("fetch", fetchMock);
    const localFetcher = vi.fn().mockResolvedValue("Too short");

    const fetcher = createConfiguredArticleFetcher(buildConfig(), localFetcher);

    await expect(fetcher("https://mp.weixin.qq.com/s/example")).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("falls back to local content when Jina fails for RSS HTML", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response("bad gateway", { status: 502 }));
    vi.stubGlobal("fetch", fetchMock);
    const localFetcher = vi.fn().mockResolvedValue("Local article content with enough signal.");

    const fetcher = createConfiguredArticleFetcher(buildConfig(), localFetcher);

    await expect(fetcher("https://example.com/post", { reason: "rss_html" })).resolves.toBe(
      "Local article content with enough signal.",
    );
  });
});
