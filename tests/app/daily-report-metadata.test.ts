import { afterEach, describe, expect, it, vi } from "vitest";

import type { DailyReportDetailDTO } from "@/lib/daily-report/types";

const getAdminSessionMock = vi.fn();
const getDailyReportByDateMock = vi.fn();

vi.mock("@/lib/admin/session", () => ({
  getAdminSession: getAdminSessionMock,
}));

vi.mock("@/lib/daily-report/repository", () => ({
  getDailyReportByDate: getDailyReportByDateMock,
}));

function buildReport(input: Partial<DailyReportDetailDTO> = {}): DailyReportDetailDTO {
  return {
    id: "report-1",
    date: "2026-04-29",
    timezone: "Asia/Shanghai",
    status: "draft",
    title: "草稿日报",
    openingSummary: "这是一篇管理员可见的草稿日报摘要，用于生成浏览器标题。",
    sourceCount: 1,
    generatedAt: "2026-04-29T00:00:00.000Z",
    publishedAt: null,
    errorMessage: null,
    closingThought: "草稿观察",
    content: {
      blocks: [
        { type: "text", title: "摘要", body: "草稿摘要" },
        { type: "section", title: "今日大事", items: [] },
        { type: "text", title: "今日观察", body: "草稿观察" },
      ],
    },
    renderedMarkdown: "# 草稿日报",
    sources: [],
    previous: null,
    next: null,
    ...input,
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("daily report metadata", () => {
  it("uses admin-visible draft title when public detail is unavailable and admin session exists", async () => {
    const { generateMetadata } = await import("@/app/daily/[date]/page");
    getDailyReportByDateMock
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(buildReport());
    getAdminSessionMock.mockResolvedValue({
      isAdmin: true,
      expiresAt: new Date("2026-05-01T00:00:00.000Z"),
    });

    const metadata = await generateMetadata({
      params: Promise.resolve({ date: "2026-04-29" }),
    });

    expect(metadata.title).toBe("草稿日报");
    expect(metadata.robots).toMatchObject({ index: false, follow: false });
    expect(getDailyReportByDateMock).toHaveBeenNthCalledWith(1, "2026-04-29", false);
    expect(getDailyReportByDateMock).toHaveBeenNthCalledWith(2, "2026-04-29", true);
  });

  it("keeps not-found metadata for anonymous users when public detail is unavailable", async () => {
    const { generateMetadata } = await import("@/app/daily/[date]/page");
    getDailyReportByDateMock.mockResolvedValueOnce(null);
    getAdminSessionMock.mockResolvedValue({
      isAdmin: false,
      expiresAt: null,
    });

    const metadata = await generateMetadata({
      params: Promise.resolve({ date: "2026-04-29" }),
    });

    expect(metadata.title).toBe("日报不存在");
    expect(metadata.robots).toMatchObject({ index: false, follow: false });
    expect(getDailyReportByDateMock).toHaveBeenCalledTimes(1);
    expect(getDailyReportByDateMock).toHaveBeenCalledWith("2026-04-29", false);
  });
});
