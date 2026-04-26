import { beforeEach, describe, expect, it, vi } from "vitest";

import { prisma } from "@/lib/db";

const { cacheKeys } = vi.hoisted(() => ({
  cacheKeys: [] as string[],
}));

vi.mock("@/lib/daily-report/cache", () => ({
  withDailyReportCache: vi.fn(async (key: string, loader: () => Promise<unknown>) => {
    cacheKeys.push(key);
    return loader();
  }),
  invalidateDailyReportCache: vi.fn(),
}));

const { listDailyReports } = await import("@/lib/daily-report/repository");

function buildDailyReportContent(label: string) {
  return JSON.stringify({
    openingSummary: `${label} 今天 AI 生态的重点变化集中在模型发布、开发者工具更新与工程实践调整，值得关注其对产品迭代和开发流程的影响。`,
    sections: {
      今日大事: [],
      变更与实践: [],
      安全与风险: [],
      开源与工具: [],
      数据与洞察: [],
    },
    closingThought: "整体来看，今天的主线仍是模型能力与工程工具继续耦合，后续需要观察实际开发效率是否随之改善。",
  });
}

describe("daily report public cache versioning", () => {
  beforeEach(async () => {
    cacheKeys.length = 0;
    await prisma.dailyReportSource.deleteMany();
    await prisma.dailyReport.deleteMany();
  });

  it("changes public list cache keys when a report changes in another process", async () => {
    const report = await prisma.dailyReport.create({
      data: {
        date: "2026-04-24",
        timezone: "Asia/Shanghai",
        status: "published",
        title: "2026-04-24 AI 日报",
        openingSummary: "今天 AI 生态的重点变化集中在模型发布、开发者工具更新与工程实践调整，值得关注其对产品迭代和开发流程的影响。",
        closingThought: "整体来看，今天的主线仍是模型能力与工程工具继续耦合，后续需要观察实际开发效率是否随之改善。",
        summaryJson: buildDailyReportContent("初版"),
        renderedMarkdown: "# 2026-04-24 AI 日报\n",
        inputHash: "input-v1",
        publishedAt: new Date("2026-04-24T09:00:00.000Z"),
      },
    });

    await listDailyReports({ isAdmin: false, status: "published" });
    const firstKey = cacheKeys.at(-1);

    await prisma.dailyReport.update({
      where: { id: report.id },
      data: {
        title: "2026-04-24 AI 日报 - 更新",
        summaryJson: buildDailyReportContent("更新版"),
        renderedMarkdown: "# 2026-04-24 AI 日报 - 更新\n",
        inputHash: "input-v2",
      },
    });

    await listDailyReports({ isAdmin: false, status: "published" });
    const secondKey = cacheKeys.at(-1);

    expect(firstKey).toMatch(/^daily:list:/);
    expect(secondKey).toMatch(/^daily:list:/);
    expect(secondKey).not.toBe(firstKey);
  });
});
