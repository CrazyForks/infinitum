import { afterEach, describe, expect, it, vi } from "vitest";

import { warmDefaultFeedHttpCaches } from "@/lib/feed/warmup";

function getFetchUrl(input: RequestInfo | URL) {
  if (typeof input === "string") {
    return input;
  }

  if (input instanceof Request) {
    return input.url;
  }

  return input.toString();
}

describe("feed cache warmup", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("skips warmup in test mode", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("FEED_CACHE_WARM_URL", "http://app:3000");

    await warmDefaultFeedHttpCaches({ reason: "test" });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("warms the public homepage and feed endpoints against the default compose app origin", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("NODE_ENV", "production");

    await warmDefaultFeedHttpCaches({ reason: "ingestion:completed" });

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls.map(([input]) => getFetchUrl(input))).toEqual([
      "http://app:3000/",
      "http://app:3000/api/feed?range=today&sort=time_desc&size=50",
      "http://app:3000/api/feed?range=all&sort=time_desc&size=50",
      "http://app:3000/api/feed/rss?range=all&sort=time_desc&size=100",
    ]);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      headers: expect.objectContaining({
        "x-infinitum-cache-warm-reason": "ingestion:completed",
      }),
    });
  });

  it("allows overriding the app origin with an environment variable", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("FEED_CACHE_WARM_URL", "http://custom-app:3000/internal-path");

    await warmDefaultFeedHttpCaches({ reason: "ingestion:completed" });

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls.map(([input]) => getFetchUrl(input))).toEqual([
      "http://custom-app:3000/",
      "http://custom-app:3000/api/feed?range=today&sort=time_desc&size=50",
      "http://custom-app:3000/api/feed?range=all&sort=time_desc&size=50",
      "http://custom-app:3000/api/feed/rss?range=all&sort=time_desc&size=100",
    ]);
  });
});
