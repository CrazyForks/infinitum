import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ContentReviewMergeModal } from "@/components/admin/content-review-merge-modal";
import type { ClusterDTO } from "@/lib/feed/types";

function createCluster(overrides: Partial<ClusterDTO> = {}): ClusterDTO {
  return {
    id: "cluster-singleton",
    title: "AI 生成的单条聚合标题",
    summary: "聚合摘要",
    score: 75,
    itemCount: 1,
    latestPublishedAt: "2026-04-08T09:00:00.000Z",
    status: "active",
    items: [
      {
        id: "cluster-singleton-item",
        title: "翻译后的单条标题",
        originalTitle: "单条原始标题",
        originalUrl: "https://example.com/singleton",
        publishedAt: "2026-04-08T09:00:00.000Z",
        sourceName: "Example Feed",
        author: "Alex",
        summary: "单条摘要",
        score: 75,
      },
    ],
    ...overrides,
  };
}

describe("ContentReviewMergeModal", () => {
  it("shows the original item title for singleton cluster search results", () => {
    render(
      <ContentReviewMergeModal
        isOpen
        onClose={vi.fn()}
        targetCluster={createCluster({ id: "target", title: "目标聚合", itemCount: 3, items: [] })}
        availableClusters={[createCluster()]}
        selectedClusterIds={new Set()}
        searchQuery="单条"
        isMerging={false}
        onSearchQueryChange={vi.fn()}
        onToggleSource={vi.fn()}
        onExecuteMerge={vi.fn()}
      />,
    );

    const dialog = screen.getByRole("dialog", { name: "合并聚合组" });
    expect(within(dialog).getByText("单条原始标题")).toBeInTheDocument();
    expect(within(dialog).queryByText("AI 生成的单条聚合标题")).not.toBeInTheDocument();
  });
});
