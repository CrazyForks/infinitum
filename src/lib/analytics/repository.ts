import { prisma } from "@/lib/db";

export async function getPageViewStats(path: string) {
  const [pv, uvRows] = await Promise.all([
    prisma.pageView.count({ where: { path } }),
    prisma.pageView.groupBy({
      by: ["visitorId"],
      where: { path },
    }),
  ]);

  return { pv, uv: uvRows.length };
}

export async function recordPageView(path: string, visitorId: string) {
  const date = new Date().toISOString().slice(0, 10);

  await prisma.pageView.create({
    data: { path, visitorId, date },
  });
}
