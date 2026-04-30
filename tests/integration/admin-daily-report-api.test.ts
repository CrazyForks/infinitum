import { afterEach, describe, expect, it, vi } from "vitest";

const requireAdmin = vi.fn();
const getDailyReportByDate = vi.fn();

vi.mock("@/lib/admin/session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/admin/session")>();

  return {
    ...actual,
    requireAdmin,
  };
});

vi.mock("@/lib/daily-report/repository", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/daily-report/repository")>();

  return {
    ...actual,
    getDailyReportByDate,
  };
});

afterEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

describe("/api/admin/daily-reports/[date]", () => {
  it("returns admin-visible report details for admins", async () => {
    requireAdmin.mockResolvedValue(undefined);
    getDailyReportByDate.mockResolvedValue({
      id: "report-1",
      date: "2026-04-29",
      timezone: "Asia/Shanghai",
      status: "draft",
      title: "草稿日报",
      openingSummary: "草稿摘要",
      sourceCount: 0,
      generatedAt: "2026-04-29T00:00:00.000Z",
      publishedAt: null,
      errorMessage: null,
      closingThought: "草稿观察",
      content: {
        openingSummary: "草稿摘要",
        sections: {
          今日大事: [],
          变更与实践: [],
          安全与风险: [],
          开源与工具: [],
          数据与洞察: [],
        },
        closingThought: "草稿观察",
      },
      renderedMarkdown: "# 草稿日报",
      sources: [],
      previous: null,
      next: null,
    });

    const { GET } = await import("@/app/api/admin/daily-reports/[date]/route");
    const response = await GET(new Request("http://localhost/api/admin/daily-reports/2026-04-29"), {
      params: Promise.resolve({ date: "2026-04-29" }),
    });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(getDailyReportByDate).toHaveBeenCalledWith("2026-04-29", true);
    expect(json.report.title).toBe("草稿日报");
    expect(json.report.status).toBe("draft");
  });

  it("returns 404 when the admin-visible report is missing", async () => {
    requireAdmin.mockResolvedValue(undefined);
    getDailyReportByDate.mockResolvedValue(null);

    const { GET } = await import("@/app/api/admin/daily-reports/[date]/route");
    const response = await GET(new Request("http://localhost/api/admin/daily-reports/2026-04-29"), {
      params: Promise.resolve({ date: "2026-04-29" }),
    });
    const json = await response.json();

    expect(response.status).toBe(404);
    expect(json.error).toBe("日报不存在");
  });
});
