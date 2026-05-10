import { afterEach, describe, expect, it, vi } from "vitest";

import { createRssParser } from "@/lib/ingestion/parser";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("rss parser", () => {
  it("retries once after an RSS fetch failure", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("temporary failure", { status: 503 }))
      .mockResolvedValueOnce(
        new Response(
          `<?xml version="1.0" encoding="UTF-8" ?>
          <rss version="2.0">
            <channel>
              <title>Retry Feed</title>
              <link>https://retry.example.com</link>
              <item>
                <title>Recovered item</title>
                <link>https://retry.example.com/item</link>
              </item>
            </channel>
          </rss>`,
          {
            status: 200,
            headers: {
              "content-type": "application/rss+xml",
            },
          },
        ),
      );

    vi.stubGlobal("fetch", fetchMock);

    const feed = await createRssParser().parseURL("https://retry.example.com/feed.xml");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://retry.example.com/feed.xml",
      expect.objectContaining({
        headers: expect.objectContaining({
          Accept: expect.stringContaining("application/rss+xml"),
          "User-Agent": "infinitum-feed-bot/1.0",
        }),
      }),
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(feed.title).toBe("Retry Feed");
    expect(feed.items?.[0]?.title).toBe("Recovered item");
  });

  it("throws the RSS fetch error after the retry also fails", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("temporary failure", { status: 503 }))
      .mockResolvedValueOnce(new Response("still failing", { status: 502 }));

    vi.stubGlobal("fetch", fetchMock);

    await expect(createRssParser().parseURL("https://retry.example.com/feed.xml")).rejects.toThrow(
      "RSS fetch failed with status 502",
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("repairs unquoted XML attributes before parsing", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        `<?xml version="1.0" encoding="UTF-8"?>
        <rss version=2.0 xmlns:atom=http://www.w3.org/2005/Atom>
          <channel>
            <title>Jina AI</title>
            <link>https://jina.ai</link>
            <item>
              <title>Recovered item</title>
              <link>https://jina.ai/item</link>
            </item>
          </channel>
        </rss>`,
        {
          status: 200,
          headers: {
            "content-type": "application/rss+xml",
          },
        },
      ),
    );

    vi.stubGlobal("fetch", fetchMock);

    const feed = await createRssParser().parseURL("https://jina.ai/feed.rss");

    expect(feed.title).toBe("Jina AI");
    expect(feed.items?.[0]?.title).toBe("Recovered item");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("defaults rss version when a feed omits the version attribute", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        `<?xml version="1.0" encoding="UTF-8"?>
        <rss>
          <channel>
            <title>Versionless Feed</title>
            <link>https://versionless.example.com</link>
            <item>
              <title>Recovered item</title>
              <link>https://versionless.example.com/item</link>
            </item>
          </channel>
        </rss>`,
        {
          status: 200,
          headers: {
            "content-type": "application/rss+xml",
          },
        },
      ),
    );

    vi.stubGlobal("fetch", fetchMock);

    const feed = await createRssParser().parseURL("https://versionless.example.com/feed.xml");

    expect(feed.title).toBe("Versionless Feed");
    expect(feed.items?.[0]?.title).toBe("Recovered item");
  });

  it("reports html responses as non-feed content", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        `<?xml version="1.0" encoding="UTF-8"?>
        <!DOCTYPE html><html><head><title>Jina AI</title></head><body>Not RSS</body></html>`,
        {
          status: 200,
          headers: {
            "content-type": "application/rss+xml",
          },
        },
      ),
    );

    vi.stubGlobal("fetch", fetchMock);

    await expect(createRssParser().parseURL("https://jina.ai/feed.rss")).rejects.toThrow(
      "RSS URL returned an HTML page instead of RSS or Atom XML.",
    );
  });
});
