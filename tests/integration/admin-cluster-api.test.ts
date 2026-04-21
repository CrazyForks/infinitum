import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { prisma } from "@/lib/db";

const requireAdmin = vi.fn();
const enqueueClusterSummaryTask = vi.fn();

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
      ],
    });
  });

  it("lists clusters for admins", async () => {
    requireAdmin.mockResolvedValue(undefined);

    const { GET } = await import("@/app/api/admin/clusters/route");
    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.clusters).toHaveLength(1);
    expect(json.clusters[0]).toMatchObject({
      id: "cluster-1",
      itemCount: 2,
      status: "active",
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
});
