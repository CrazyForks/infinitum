import { beforeEach, describe, expect, it, vi } from "vitest";

import { prisma } from "@/lib/db";
import { invalidatePageViewAnalyticsCache } from "@/lib/analytics/repository";

const cookieStore = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => cookieStore),
}));

describe("/api/track-page-view", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    invalidatePageViewAnalyticsCache();
    cookieStore.get.mockReturnValue({ value: "visitor-1" });

    await prisma.pageView.deleteMany();
  });

  it("dedupes repeated writes and reuses cached stats within the realtime downgrade window", async () => {
    const createSpy = vi.spyOn(prisma.pageView, "create");
    const countSpy = vi.spyOn(prisma.pageView, "count");
    const groupBySpy = vi.spyOn(prisma.pageView, "groupBy");
    const { POST } = await import("@/app/api/track-page-view/route");

    const buildRequest = () =>
      new Request("http://localhost/api/track-page-view", {
        method: "POST",
        body: JSON.stringify({ path: "/daily" }),
      });

    const firstResponse = await POST(buildRequest());
    const firstJson = await firstResponse.json();
    const secondResponse = await POST(buildRequest());
    const secondJson = await secondResponse.json();

    expect(firstResponse.status).toBe(200);
    expect(firstJson).toEqual({ pv: 1, uv: 1 });
    expect(secondResponse.status).toBe(200);
    expect(secondJson).toEqual({ pv: 1, uv: 1 });
    expect(createSpy).toHaveBeenCalledTimes(1);
    expect(countSpy).toHaveBeenCalledTimes(1);
    expect(groupBySpy).toHaveBeenCalledTimes(1);
    await expect(prisma.pageView.count()).resolves.toBe(1);
  });
});
