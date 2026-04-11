import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ContentReviewPanel } from "@/components/admin/content-review-panel";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ContentReviewPanel", () => {
  it("loads filtered items and restores one item", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input.url;

      if (url === "/api/admin/items?moderationStatus=filtered") {
        return new Response(
          JSON.stringify({
            items: [
              {
                id: "item-1",
                title: "营销内容",
                originalUrl: "https://example.com/1",
                publishedAt: "2026-04-10T09:00:00.000Z",
                sourceName: "Example Feed",
                author: "Alex",
                summary: "摘要",
                moderationStatus: "filtered",
                moderationReason: "marketing",
                moderationDetail: "营销措辞明显",
                qualityScore: 18,
                qualityRationale: "低质量",
                topicLabel: "AI Marketing",
                canRegenerateTranslation: true,
              },
            ],
          }),
        );
      }

      if (url === "/api/admin/clusters") {
        return new Response(
          JSON.stringify({
            clusters: [],
          }),
        );
      }

      if (url === "/api/admin/items/item-1/restore") {
        expect(init?.method).toBe("POST");

        return new Response(
          JSON.stringify({
            item: {
              id: "item-1",
              moderationStatus: "restored",
            },
          }),
        );
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<ContentReviewPanel />);

    expect(await screen.findByText("营销内容")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "恢复内容" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/admin/items/item-1/restore", {
        method: "POST",
      });
    });
  });
});
