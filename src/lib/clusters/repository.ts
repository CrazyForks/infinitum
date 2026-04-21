import { prisma } from "@/lib/db";

export type ClusterAssignmentCandidate = {
  id: string;
  title: string;
  summary: string;
  fingerprint: string;
  latestPublishedAt: Date;
  itemCount: number;
};

export async function findActiveClusterByFingerprint(fingerprint: string, since: Date, until?: Date) {
  return prisma.contentCluster.findFirst({
    where: {
      fingerprint,
      status: "active",
      items: {
        some: {
          status: "processed",
          moderationStatus: {
            in: ["allowed", "restored"],
          },
        },
      },
      latestPublishedAt: {
        gte: since,
        lte: until,
      },
    },
    orderBy: [{ latestPublishedAt: "desc" }],
  });
}

export async function findRecentActiveClusterCandidates(options: { since: Date; until: Date; limit: number }) {
  return prisma.contentCluster.findMany({
    where: {
      status: "active",
      items: {
        some: {
          status: "processed",
          moderationStatus: {
            in: ["allowed", "restored"],
          },
        },
      },
      latestPublishedAt: {
        gte: options.since,
        lte: options.until,
      },
    },
    select: {
      id: true,
      title: true,
      summary: true,
      fingerprint: true,
      latestPublishedAt: true,
      itemCount: true,
    },
    orderBy: [{ latestPublishedAt: "desc" }, { updatedAt: "desc" }],
    take: options.limit,
  }) as Promise<ClusterAssignmentCandidate[]>;
}

export async function createContentCluster(data: {
  fingerprint: string;
  title: string;
  summary: string;
  score: number;
  latestPublishedAt: Date;
}) {
  return prisma.contentCluster.upsert({
    where: { fingerprint: data.fingerprint },
    update: {},
    create: {
      kind: "topic",
      title: data.title,
      summary: data.summary,
      score: data.score,
      itemCount: 0,
      latestPublishedAt: data.latestPublishedAt,
      status: "active",
      fingerprint: data.fingerprint,
    },
  });
}

export async function setItemCluster(itemId: string, clusterId: string | null) {
  return prisma.item.update({
    where: { id: itemId },
    data: {
      clusterId,
    },
  });
}

export async function getClusterWithItems(clusterId: string) {
  return prisma.contentCluster.findUnique({
    where: { id: clusterId },
    include: {
      items: {
        where: {
          status: "processed",
          moderationStatus: {
            in: ["allowed", "restored"],
          },
        },
        include: { source: true },
        orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
      },
    },
  });
}

export async function updateClusterSummary(
  clusterId: string,
  data: {
    title: string;
    summary: string;
    score: number;
    itemCount: number;
    latestPublishedAt: Date;
    status?: "active" | "hidden";
  },
) {
  return prisma.contentCluster.update({
    where: { id: clusterId },
    data,
  });
}

export async function deleteCluster(clusterId: string) {
  return prisma.contentCluster.delete({
    where: { id: clusterId },
  });
}

export async function updateClusterStatus(clusterId: string, status: "active" | "hidden") {
  return prisma.contentCluster.update({
    where: { id: clusterId },
    data: { status },
  });
}
