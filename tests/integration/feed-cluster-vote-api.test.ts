import { beforeEach, describe, expect, it, vi } from "vitest";

import { prisma } from "@/lib/db";

const cookieStore = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
}));
const invalidateFeedCache = vi.hoisted(() => vi.fn());

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => cookieStore),
}));

vi.mock("@/lib/feed/cache", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/feed/cache")>();

  return {
    ...actual,
    invalidateFeedCache,
  };
});

describe("/api/feed/clusters/[id]/vote", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    cookieStore.get.mockReturnValue({ value: "visitor-1" });

    await prisma.visitorClusterVote.deleteMany();
    await prisma.item.deleteMany();
    await prisma.contentCluster.deleteMany();

    await prisma.contentCluster.create({
      data: {
        id: "cluster-vote-1",
        kind: "topic",
        title: "Vote target cluster",
        summary: "Cluster summary",
        score: 80,
        itemCount: 2,
        latestPublishedAt: new Date("2026-04-10T10:00:00.000Z"),
        status: "active",
        fingerprint: "cluster-vote-1",
      },
    });
  });

  it("creates a new visitor upvote and updates cluster counts", async () => {
    const { POST } = await import("@/app/api/feed/clusters/[id]/vote/route");
    const response = await POST(
      new Request("http://localhost/api/feed/clusters/cluster-vote-1/vote", {
        method: "POST",
        body: JSON.stringify({ voteType: "upvote" }),
      }),
      { params: Promise.resolve({ id: "cluster-vote-1" }) },
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({
      upvotes: 1,
      downvotes: 0,
      userVote: "upvote",
    });
    await expect(prisma.visitorClusterVote.count()).resolves.toBe(1);
    expect(invalidateFeedCache).toHaveBeenCalledOnce();
  });

  it("switches an existing downvote to an upvote", async () => {
    await prisma.contentCluster.update({
      where: { id: "cluster-vote-1" },
      data: { downvotes: 1 },
    });
    await prisma.visitorClusterVote.create({
      data: {
        clusterId: "cluster-vote-1",
        visitorId: "visitor-1",
        voteType: "downvote",
      },
    });

    const { POST } = await import("@/app/api/feed/clusters/[id]/vote/route");
    const response = await POST(
      new Request("http://localhost/api/feed/clusters/cluster-vote-1/vote", {
        method: "POST",
        body: JSON.stringify({ voteType: "upvote" }),
      }),
      { params: Promise.resolve({ id: "cluster-vote-1" }) },
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({
      upvotes: 1,
      downvotes: 0,
      userVote: "upvote",
    });
    await expect(
      prisma.visitorClusterVote.findUniqueOrThrow({
        where: {
          clusterId_visitorId: {
            clusterId: "cluster-vote-1",
            visitorId: "visitor-1",
          },
        },
      }),
    ).resolves.toMatchObject({ voteType: "upvote" });
  });

  it("toggles off an existing matching vote", async () => {
    await prisma.contentCluster.update({
      where: { id: "cluster-vote-1" },
      data: { upvotes: 1 },
    });
    await prisma.visitorClusterVote.create({
      data: {
        clusterId: "cluster-vote-1",
        visitorId: "visitor-1",
        voteType: "upvote",
      },
    });

    const { POST } = await import("@/app/api/feed/clusters/[id]/vote/route");
    const response = await POST(
      new Request("http://localhost/api/feed/clusters/cluster-vote-1/vote", {
        method: "POST",
        body: JSON.stringify({ voteType: "upvote" }),
      }),
      { params: Promise.resolve({ id: "cluster-vote-1" }) },
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({
      upvotes: 0,
      downvotes: 0,
      userVote: null,
    });
    await expect(prisma.visitorClusterVote.count()).resolves.toBe(0);
  });

  it("returns the current visitor vote status", async () => {
    await prisma.contentCluster.update({
      where: { id: "cluster-vote-1" },
      data: { upvotes: 4, downvotes: 2 },
    });
    await prisma.visitorClusterVote.create({
      data: {
        clusterId: "cluster-vote-1",
        visitorId: "visitor-1",
        voteType: "downvote",
      },
    });

    const { GET } = await import("@/app/api/feed/clusters/[id]/vote/route");
    const response = await GET(
      new Request("http://localhost/api/feed/clusters/cluster-vote-1/vote"),
      { params: Promise.resolve({ id: "cluster-vote-1" }) },
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({
      upvotes: 4,
      downvotes: 2,
      userVote: "downvote",
    });
  });

  it("rejects invalid vote types and missing clusters", async () => {
    const { POST } = await import("@/app/api/feed/clusters/[id]/vote/route");

    const invalidVoteResponse = await POST(
      new Request("http://localhost/api/feed/clusters/cluster-vote-1/vote", {
        method: "POST",
        body: JSON.stringify({ voteType: "bookmark" }),
      }),
      { params: Promise.resolve({ id: "cluster-vote-1" }) },
    );
    expect(invalidVoteResponse.status).toBe(400);

    const missingClusterResponse = await POST(
      new Request("http://localhost/api/feed/clusters/missing/vote", {
        method: "POST",
        body: JSON.stringify({ voteType: "upvote" }),
      }),
      { params: Promise.resolve({ id: "missing" }) },
    );
    expect(missingClusterResponse.status).toBe(404);
    expect(invalidateFeedCache).not.toHaveBeenCalled();
  });
});
