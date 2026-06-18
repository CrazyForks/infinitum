import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DailyReportDetail } from "@/components/daily/daily-report-detail";
import type { DailyReportDetailDTO } from "@/lib/daily-report/types";

const pushMock = vi.fn();
const refreshMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushMock,
    refresh: refreshMock,
  }),
}));

function buildReport(input: Partial<DailyReportDetailDTO> = {}): DailyReportDetailDTO {
  return {
    id: "report-1",
    date: "2026-04-29",
    timezone: "Asia/Shanghai",
    status: "published",
    title: "公开日报",
    openingSummary: "公开摘要",
    sourceCount: 1,
    generatedAt: "2026-04-29T00:00:00.000Z",
    publishedAt: "2026-04-29T01:00:00.000Z",
    errorMessage: null,
    closingThought: "公开观察",
    content: {
      blocks: [
        { type: "text", title: "摘要", body: "公开摘要" },
        { type: "section", title: "热点事件", items: [] },
        { type: "text", title: "趋势观察", body: "公开观察" },
      ],
    },
    renderedMarkdown: "# 公开日报",
    sources: [{
      id: "source-1",
      sourceNumber: 1,
      sourceSummary: "来源摘要",
      sourceQualityScore: 90,
      itemId: "item-1",
      clusterId: "cluster-1",
      sourceName: "Source",
      title: "来源标题",
      url: "https://example.com/source",
      sectionName: "热点事件",
      topic: "主题",
    }],
    previous: null,
    next: null,
    ...input,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  pushMock.mockReset();
  refreshMock.mockReset();
});

describe("DailyReportDetail", () => {
  it("hydrates admin draft detail when the public report is unavailable", async () => {
    const adminReport = buildReport({
      status: "draft",
      title: "草稿日报",
      publishedAt: null,
      renderedMarkdown: "# 草稿日报",
    });
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === "/api/admin/session") {
        return Response.json({ isAdmin: true });
      }
      if (String(input) === "/api/admin/daily-reports/2026-04-29") {
        return Response.json({ report: adminReport });
      }
      return Response.json({ error: "unexpected" }, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<DailyReportDetail report={null} date="2026-04-29" isAdmin={false} hydrateAdminClient />);

    expect(screen.getByText("加载中...")).toBeInTheDocument();
    expect(screen.queryByText("日报不存在")).not.toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "草稿日报", level: 1 })).toBeInTheDocument();
    expect(screen.getByText("草稿")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "日报微调" })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/admin/session", { cache: "no-store" });
    expect(fetchMock).toHaveBeenCalledWith("/api/admin/daily-reports/2026-04-29", undefined);
  });

  it("does not fetch admin detail for anonymous visitors", async () => {
    const fetchMock = vi.fn(async () => Response.json({ isAdmin: false }));
    vi.stubGlobal("fetch", fetchMock);

    render(<DailyReportDetail report={null} date="2026-04-29" isAdmin={false} hydrateAdminClient />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/admin/session", { cache: "no-store" });
    });
    expect(fetchMock).not.toHaveBeenCalledWith("/api/admin/daily-reports/2026-04-29");
    expect(screen.getByText("这篇日报尚未发布或不存在。")).toBeInTheDocument();
  });

  it("falls back to the unavailable state when admin session resolution fails", async () => {
    const fetchMock = vi.fn(async () => Response.json({ error: "unavailable" }, { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);

    render(<DailyReportDetail report={null} date="2026-04-29" isAdmin={false} hydrateAdminClient />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/admin/session", { cache: "no-store" });
    });
    expect(fetchMock).not.toHaveBeenCalledWith("/api/admin/daily-reports/2026-04-29");
    expect(screen.getByText("日报不存在")).toBeInTheDocument();
  });

  it("renders item sources collapsed by default", () => {
    const report = buildReport({
      renderedMarkdown: [
        "# 公开日报",
        "",
        "## 热点事件",
        "",
        "### 主题",
        "",
        "正文内容。",
        "",
        "**来源：**",
        "- [来源标题](https://example.com/source)（Source）",
      ].join("\n"),
    });

    const { container } = render(<DailyReportDetail report={report} date="2026-04-29" isAdmin={false} />);

    const details = container.querySelector("details.daily-report-source-list");
    expect(details).toBeInTheDocument();
    expect(details).not.toHaveAttribute("open");
    expect(details?.querySelector("summary")).toHaveTextContent("展开 1 条");
  });

  it("keeps item sources expanded after the detail view rerenders", () => {
    const report = buildReport({
      renderedMarkdown: [
        "# 公开日报",
        "",
        "## 热点事件",
        "",
        "### 主题",
        "",
        "正文内容。",
        "",
        "**来源：**",
        "- [来源标题](https://example.com/source)（Source）",
      ].join("\n"),
    });

    const { container, rerender } = render(
      <DailyReportDetail report={report} date="2026-04-29" isAdmin={false} />,
    );
    const details = container.querySelector<HTMLDetailsElement>("details.daily-report-source-list");
    const summary = details?.querySelector("summary");
    expect(details).toBeInTheDocument();
    expect(summary).toBeInTheDocument();

    fireEvent.click(summary!);
    fireEvent(details!, new Event("toggle", { bubbles: false }));
    expect(details).toHaveAttribute("open");

    rerender(<DailyReportDetail report={report} date="2026-04-29" isAdmin={false} />);

    expect(container.querySelector("details.daily-report-source-list")).toHaveAttribute("open");
  });
});
