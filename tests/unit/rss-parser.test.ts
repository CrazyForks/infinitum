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
});
