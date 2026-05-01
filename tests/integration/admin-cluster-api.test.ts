import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { prisma } from "@/lib/db";

const requireAdmin = vi.fn();
const enqueueClusterSummaryTask = vi.fn();
const mergeClusters = vi.fn();

vi.mock("@/lib/admin/session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/admin/session")>();

  return {
    ...actual,
    requireAdmin,
  };
});

vi.mock("@/lib/clusters/service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/clusters/service")>();

  return {
    ...actual,
    enqueueClusterSummaryTask,
    mergeClusters,
  };
});

afterEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

describe("/api/admin/clusters", () => {
  beforeEach(async () => {
    await prisma.item.deleteMany();
    await prisma.contentCluster.deleteMany();
    await prisma.fetchRun.deleteMany();
    await prisma.source.deleteMany();

    const source = await prisma.source.create({
      data: {
        name: "Cluster Feed",
        rssUrl: "https://cluster.example.com/feed.xml",
        siteUrl: "https://cluster.example.com",
        enabled: true,
        aiParsingEnabled: false,
      },
    });

    await prisma.contentCluster.create({
      data: {
        id: "cluster-1",
        kind: "topic",
        title: "OpenAI Agent launch",
        summary: "聚合摘要",
        score: 84,
        itemCount: 2,
        latestPublishedAt: new Date("2026-04-10T10:00:00.000Z"),
        status: "active",
        fingerprint: "openai-agent-launch",
      },
    });

    await prisma.contentCluster.create({
      data: {
        id: "cluster-singleton",
        kind: "topic",
        title: "全模态全尺寸全国发布",
        summary: "单条目聚合摘要",
        score: 72,
        itemCount: 1,
        latestPublishedAt: new Date("2026-04-10T08:00:00.000Z"),
        status: "active",
        fingerprint: "all-modal-all-size-national",
      },
    });

    await prisma.item.createMany({
      data: [
        {
          id: "cluster-item-1",
          sourceId: source.id,
          clusterId: "cluster-1",
          originalUrl: "https://cluster.example.com/1",
          canonicalUrl: "https://cluster.example.com/1",
          urlHash: "cluster-hash-1",
          dedupeSignature: "cluster|1",
          originalTitle: "OpenAI launches agent toolkit",
          translatedTitle: "OpenAI 发布 agent 工具包",
          publishedAt: new Date("2026-04-10T10:00:00.000Z"),
          summaryText: "内容一",
          status: "processed",
          moderationStatus: "allowed",
          qualityScore: 88,
          qualityRationale: "高质量",
          language: "en",
        },
        {
          id: "cluster-item-2",
          sourceId: source.id,
          clusterId: "cluster-1",
          originalUrl: "https://cluster.example.com/2",
          canonicalUrl: "https://cluster.example.com/2",
          urlHash: "cluster-hash-2",
          dedupeSignature: "cluster|2",
          originalTitle: "Toolkit details from OpenAI",
          translatedTitle: "OpenAI 工具包细节",
          publishedAt: new Date("2026-04-10T09:00:00.000Z"),
          summaryText: "内容二",
          status: "processed",
          moderationStatus: "allowed",
          qualityScore: 80,
          qualityRationale: "较高质量",
          language: "en",
        },
        {
          id: "cluster-item-singleton",
          sourceId: source.id,
          clusterId: "cluster-singleton",
          originalUrl: "https://cluster.example.com/singleton",
          canonicalUrl: "https://cluster.example.com/singleton",
          urlHash: "cluster-hash-singleton",
          dedupeSignature: "cluster|singleton",
          originalTitle: "全模态全尺寸全国发布",
          translatedTitle: null,
          publishedAt: new Date("2026-04-10T08:00:00.000Z"),
          summaryText: "单条内容",
          status: "processed",
          moderationStatus: "allowed",
          qualityScore: 72,
          qualityRationale: "可用内容",
          language: "zh",
        },
      ],
    });
  });

  it("lists clusters for admins", async () => {
    requireAdmin.mockResolvedValue(undefined);

    const { GET } = await import("@/app/api/admin/clusters/route");
    const response = await GET(new Request("http://localhost/api/admin/clusters?minItemCount=2"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.clusters).toHaveLength(1);
    expect(json.total).toBe(1);
    expect(json.clusters[0]).toMatchObject({
      id: "cluster-1",
      itemCount: 2,
      status: "active",
    });
  });

  it("searches clusters with fuzzy Chinese keywords across child item titles", async () => {
    requireAdmin.mockResolvedValue(undefined);

    const { GET } = await import("@/app/api/admin/clusters/route");
    const response = await GET(new Request("http://localhost/api/admin/clusters?search=工具细节"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.clusters).toHaveLength(1);
    expect(json.total).toBe(1);
    expect(json.clusters[0].id).toBe("cluster-1");
  });

  it("does not restrict singleton clusters unless minItemCount is provided", async () => {
    requireAdmin.mockResolvedValue(undefined);

    const { GET } = await import("@/app/api/admin/clusters/route");
    const restrictedResponse = await GET(
      new Request("http://localhost/api/admin/clusters?search=全模态全尺寸全国&minItemCount=2"),
    );
    const restrictedJson = await restrictedResponse.json();
    const defaultResponse = await GET(new Request("http://localhost/api/admin/clusters?search=全模态全尺寸全国"));
    const defaultJson = await defaultResponse.json();

    expect(restrictedResponse.status).toBe(200);
    expect(restrictedJson.clusters).toHaveLength(0);
    expect(defaultResponse.status).toBe(200);
    expect(defaultJson.clusters).toHaveLength(1);
    expect(defaultJson.clusters[0]).toMatchObject({
      id: "cluster-singleton",
      itemCount: 1,
    });
  });

  it("hides a cluster for admins", async () => {
    requireAdmin.mockResolvedValue(undefined);

    const { POST } = await import("@/app/api/admin/clusters/[id]/hide/route");
    const response = await POST(
      new Request("http://localhost/api/admin/clusters/cluster-1/hide", { method: "POST" }),
      {
        params: Promise.resolve({ id: "cluster-1" }),
      },
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.cluster.status).toBe("hidden");
  });

  it("queues a cluster summary regeneration task for admins", async () => {
    requireAdmin.mockResolvedValue(undefined);
    enqueueClusterSummaryTask.mockResolvedValue({
      id: "task-cluster-1",
      kind: "cluster_regenerate_summary",
      status: "queued",
      triggerType: "admin_action",
      label: "重新生成聚合摘要",
      entityId: "cluster-1",
    });

    const { POST } = await import("@/app/api/admin/clusters/[id]/regenerate-summary/route");
    const response = await POST(
      new Request("http://localhost/api/admin/clusters/cluster-1/regenerate-summary", { method: "POST" }),
      {
        params: Promise.resolve({ id: "cluster-1" }),
      },
    );
    const json = await response.json();

    expect(response.status).toBe(202);
    expect(enqueueClusterSummaryTask).toHaveBeenCalledWith("cluster-1");
    expect(json.taskRun.id).toBe("task-cluster-1");
    expect(json.taskRun.kind).toBe("cluster_regenerate_summary");
  });

  it("merges selected clusters for admins", async () => {
    requireAdmin.mockResolvedValue(undefined);
    mergeClusters.mockResolvedValue({
      targetClusterId: "cluster-1",
      mergedClusterIds: ["cluster-2"],
      itemsMoved: 2,
      taskId: "task-merge-1",
    });

    const { POST } = await import("@/app/api/admin/clusters/merge/route");
    const response = await POST(
      new Request("http://localhost/api/admin/clusters/merge", {
        method: "POST",
        body: JSON.stringify({
          targetClusterId: "cluster-1",
          sourceClusterIds: ["cluster-2"],
        }),
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(mergeClusters).toHaveBeenCalledWith("cluster-1", ["cluster-2"]);
    expect(json).toEqual({
      success: true,
      result: {
        targetClusterId: "cluster-1",
        mergedClusterIds: ["cluster-2"],
        itemsMoved: 2,
        taskId: "task-merge-1",
      },
    });
  });

  it("rejects invalid cluster merge requests before calling the service", async () => {
    requireAdmin.mockResolvedValue(undefined);

    const { POST } = await import("@/app/api/admin/clusters/merge/route");
    const response = await POST(
      new Request("http://localhost/api/admin/clusters/merge", {
        method: "POST",
        body: JSON.stringify({
          targetClusterId: "cluster-1",
          sourceClusterIds: ["cluster-1"],
        }),
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toBe("目标聚合组不能在待合并列表中");
    expect(mergeClusters).not.toHaveBeenCalled();
  });
});
