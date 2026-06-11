import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";

export type ClusterAssignmentCandidate = {
  id: string;
  title: string;
  summary: string;
  fingerprint: string;
  eventType: string | null;
  eventSubject: string | null;
  eventAction: string | null;
  eventObject: string | null;
  eventDate: string | null;
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
          source: {
            aggregationEnabled: true,
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

export async function findActiveClusterByTitle(title: string, since: Date, until?: Date) {
  const normalizedTitle = title.trim();

  if (!normalizedTitle) {
    return null;
  }

  return prisma.contentCluster.findFirst({
    where: {
      title: normalizedTitle,
      status: "active",
      items: {
        some: {
          status: "processed",
          moderationStatus: {
            in: ["allowed", "restored"],
          },
          source: {
            aggregationEnabled: true,
          },
        },
      },
      latestPublishedAt: {
        gte: since,
        lte: until,
      },
    },
    orderBy: [{ latestPublishedAt: "desc" }, { updatedAt: "desc" }],
  });
}

export async function findRecentActiveClusterCandidates(options: { since: Date; until: Date }) {
  return prisma.contentCluster.findMany({
    where: {
      status: "active",
      items: {
        some: {
          status: "processed",
          moderationStatus: {
            in: ["allowed", "restored"],
          },
          source: {
            aggregationEnabled: true,
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
      eventType: true,
      eventSubject: true,
      eventAction: true,
      eventObject: true,
      eventDate: true,
      latestPublishedAt: true,
      itemCount: true,
    },
    orderBy: [{ latestPublishedAt: "desc" }, { updatedAt: "desc" }],
  }) as Promise<ClusterAssignmentCandidate[]>;
}

export async function createContentCluster(data: {
  fingerprint: string;
  title: string;
  summary: string;
  summaryInputHash?: string | null;
  score: number;
  itemCount?: number;
  latestPublishedAt: Date;
  eventType?: string | null;
  eventSubject?: string | null;
  eventAction?: string | null;
  eventObject?: string | null;
  eventDate?: string | null;
}) {
  return prisma.contentCluster.upsert({
    where: { fingerprint: data.fingerprint },
    update: {},
    create: {
      kind: "topic",
      title: data.title,
      summary: data.summary,
      summaryInputHash: data.summaryInputHash ?? null,
      score: data.score,
      itemCount: data.itemCount ?? 0,
      latestPublishedAt: data.latestPublishedAt,
      status: "active",
      fingerprint: data.fingerprint,
      eventType: data.eventType ?? null,
      eventSubject: data.eventSubject ?? null,
      eventAction: data.eventAction ?? null,
      eventObject: data.eventObject ?? null,
      eventDate: data.eventDate ?? null,
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

export async function getClusterParsedEvents(clusterId: string) {
  return prisma.itemParsedEvent.findMany({
    where: {
      clusterId,
      item: {
        status: "processed",
        moderationStatus: {
          in: ["allowed", "restored"],
        },
        source: {
          aggregationDetectionEnabled: true,
        },
      },
    },
    include: {
      item: {
        select: {
          publishedAt: true,
        },
      },
    },
    orderBy: [{ item: { publishedAt: "desc" } }, { eventIndex: "asc" }],
  });
}

export async function updateClusterSummary(
  clusterId: string,
  data: {
    title: string;
    summary: string;
    summaryInputHash?: string | null;
    score: number;
    itemCount: number;
    latestPublishedAt: Date;
    status?: "active" | "hidden";
    eventType?: string | null;
    eventSubject?: string | null;
    eventAction?: string | null;
    eventObject?: string | null;
    eventDate?: string | null;
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


export async function setParsedEventCluster(parsedEventId: string, clusterId: string | null) {
  return prisma.itemParsedEvent.update({
    where: { id: parsedEventId },
    data: {
      clusterId,
    },
  });
}

export async function createParsedEvents(
  events: Array<{
    itemId: string;
    eventIndex: number;
    eventType?: string | null;
    eventSubject?: string | null;
    eventAction?: string | null;
    eventObject?: string | null;
    eventDate?: string | null;
    oneLiner: string;
    qualityScore: number;
    fingerprint: string;
  }>,
) {
  if (events.length === 0) {
    return [];
  }
  return prisma.$transaction(async (tx) => {
    const persisted = [];

    for (const event of events) {
      try {
        persisted.push(
          await tx.itemParsedEvent.create({
            data: {
              itemId: event.itemId,
              eventIndex: event.eventIndex,
              eventType: event.eventType ?? null,
              eventSubject: event.eventSubject ?? null,
              eventAction: event.eventAction ?? null,
              eventObject: event.eventObject ?? null,
              eventDate: event.eventDate ?? null,
              oneLiner: event.oneLiner,
              qualityScore: event.qualityScore,
              fingerprint: event.fingerprint,
            },
          }),
        );
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          // Reparse of the same item may produce a stable event again. Refresh
          // cached fields but keep any existing cluster assignment.
          persisted.push(
            await tx.itemParsedEvent.update({
              where: {
                itemId_fingerprint: {
                  itemId: event.itemId,
                  fingerprint: event.fingerprint,
                },
              },
              data: {
                eventIndex: event.eventIndex,
                eventType: event.eventType ?? null,
                eventSubject: event.eventSubject ?? null,
                eventAction: event.eventAction ?? null,
                eventObject: event.eventObject ?? null,
                eventDate: event.eventDate ?? null,
                oneLiner: event.oneLiner,
                qualityScore: event.qualityScore,
              },
            }),
          );
          continue;
        }
        throw error;
      }
    }

    return persisted;
  });
}

export async function deleteParsedEventsForItem(itemId: string) {
  return prisma.itemParsedEvent.deleteMany({
    where: { itemId },
  });
}
