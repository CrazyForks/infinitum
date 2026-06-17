import crypto from "node:crypto";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";

export type AggregationChildEventInput = {
  title?: string | null;
  oneLiner: string;
  qualityScore: number;
  eventType: string | null;
  eventSubject: string | null;
  eventAction: string | null;
  eventObject: string | null;
  eventDate: string | null;
  sourceUrl: string | null;
  fingerprint?: string | null;
};

type PrismaTransaction = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

function buildAggregationChildItemInput({
  sourceId,
  parent,
  publishedAt,
  event,
}: {
  sourceId: string;
  parent: { id: string; originalUrl: string; originalTitle: string };
  publishedAt: Date;
  event: AggregationChildEventInput;
}): Prisma.ItemUncheckedCreateInput {
  const eventFingerprint =
    event.fingerprint ??
    crypto
      .createHash("sha256")
      .update(
        [
          event.eventType ?? "",
          event.eventSubject ?? "",
          event.eventAction ?? "",
          event.eventObject ?? "",
          event.eventDate ?? "",
        ]
          .join("|")
          .toLowerCase(),
      )
      .digest("hex");
  const normalizedSourceUrl = normalizeHttpUrl(event.sourceUrl);
  const normalizedParentUrl = normalizeHttpUrl(parent.originalUrl) ?? parent.originalUrl;
  const displayUrl =
    normalizedSourceUrl &&
    isSpecificContentUrl(normalizedSourceUrl) &&
    !areEquivalentContentUrls(normalizedSourceUrl, normalizedParentUrl)
      ? normalizedSourceUrl
      : normalizedParentUrl;
  // Keep the user-facing URL as the best available original article. Use a
  // separate internal key with a per-event fragment so children of the same
  // parent stay distinct under the urlHash unique index.
  const childUrlKey = `${displayUrl}#event-${eventFingerprint.slice(0, 32)}`;
  const urlHash = crypto.createHash("sha256").update(childUrlKey).digest("hex");
  const canonicalUrl = displayUrl.split("#")[0] ?? displayUrl;
  const dedupeSignature = `${eventFingerprint}|${sourceId}|${publishedAt.toISOString()}`;
  const childTitle =
    normalizeChildTitle(event.title) ||
    normalizeChildTitle(event.oneLiner) ||
    [event.eventSubject, event.eventAction, event.eventObject]
      .filter(Boolean)
      .join(" ")
      .slice(0, 200) ||
    parent.originalTitle;

  return {
    sourceId,
    parentItemId: parent.id,
    publishedAt,
    originalUrl: displayUrl,
    canonicalUrl,
    urlHash,
    dedupeSignature,
    originalTitle: childTitle,
    summaryText: event.oneLiner,
    summaryStatus: "succeeded",
    analysisStatus: "succeeded",
    moderationStatus: "allowed",
    moderationReason: null,
    moderationDetail: null,
    qualityScore: event.qualityScore,
    qualityRationale: "由聚合内容拆出",
    eventType: event.eventType,
    eventSubject: event.eventSubject,
    eventAction: event.eventAction,
    eventObject: event.eventObject,
    eventDate: event.eventDate,
    language: "zh",
    status: "processed",
    filterReason: null,
    aiProcessedAt: new Date(),
    isAggregation: false,
    aggregationCheckedAt: null,
    aggregationParseStatus: null,
    errorMessage: null,
  };
}

function normalizeHttpUrl(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  try {
    const parsed = new URL(value.trim());
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

function isSpecificContentUrl(value: string) {
  try {
    const parsed = new URL(value);
    const path = parsed.pathname.replace(/\/+$/, "");
    if (path && path !== "") {
      return true;
    }
    return parsed.search.length > 1;
  } catch {
    return false;
  }
}

function normalizeChildTitle(value: string | null | undefined) {
  const normalized = value
    ?.replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/[`_[\]()#>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) {
    return null;
  }
  return normalized.slice(0, 120);
}

function normalizeUrlForComparison(value: string) {
  const parsed = new URL(value);
  parsed.hash = "";
  parsed.protocol = parsed.protocol.toLowerCase();
  parsed.hostname = parsed.hostname.toLowerCase();
  if (parsed.pathname.length > 1) {
    parsed.pathname = parsed.pathname.replace(/\/+$/, "");
  }
  return parsed.toString();
}

function areEquivalentContentUrls(left: string, right: string) {
  try {
    return normalizeUrlForComparison(left) === normalizeUrlForComparison(right);
  } catch {
    return left === right;
  }
}

async function upsertItemInTx(
  tx: PrismaTransaction,
  data: Prisma.ItemUncheckedCreateInput,
): Promise<{ id: string }> {
  if (!data.urlHash || !data.dedupeSignature) {
    throw new Error("Aggregation child item missing urlHash or dedupeSignature");
  }
  const existing = await tx.item.findFirst({
    where: {
      OR: [{ urlHash: data.urlHash }, { dedupeSignature: data.dedupeSignature }],
    },
    select: { id: true },
  });
  if (existing) {
    return tx.item.update({
      where: { id: existing.id },
      data,
      select: { id: true },
    });
  }
  try {
    return await tx.item.create({ data, select: { id: true } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const conflict = await tx.item.findFirst({
        where: {
          OR: [{ urlHash: data.urlHash }, { dedupeSignature: data.dedupeSignature }],
        },
        select: { id: true },
      });
      if (conflict) {
        return tx.item.update({
          where: { id: conflict.id },
          data,
          select: { id: true },
        });
      }
    }
    throw error;
  }
}

export type PersistAggregationResult = {
  childItemIds: string[];
};

/**
 * Persist each parsed event as a full child Item inside a single transaction.
 * Idempotent: re-running with the same events produces the same child item ids
 * (dedupeSignature / urlHash collisions resolve to update).
 *
 * Callers are expected to assign clusters to the returned ids in a separate
 * step (assignItemToCluster acquires its own window-level lock and may invoke
 * AI for cluster matching, so it cannot share the upsert transaction).
 */
export async function persistAggregationChildItems({
  sourceId,
  parent,
  publishedAt,
  events,
}: {
  sourceId: string;
  parent: { id: string; originalUrl: string; originalTitle: string };
  publishedAt: Date;
  events: AggregationChildEventInput[];
}): Promise<PersistAggregationResult> {
  if (events.length === 0) {
    return { childItemIds: [] };
  }
  const childItemIds: string[] = [];
  await prisma.$transaction(async (tx) => {
    for (const event of events) {
      const childInput = buildAggregationChildItemInput({
        sourceId,
        parent,
        publishedAt,
        event,
      });
      const child = await upsertItemInTx(tx, childInput);
      childItemIds.push(child.id);
    }
  });
  return { childItemIds };
}

/**
 * Retire child items that reference the given parent. Used by the reparse task
 * to hide stale splits while preserving cluster history and admin auditability.
 */
export async function retireAggregationChildItems(parentId: string): Promise<number> {
  const result = await prisma.item.updateMany({
    where: {
      parentItemId: parentId,
      OR: [
        { status: { not: "filtered" } },
        { moderationStatus: { not: "filtered" } },
        { filterReason: { not: "reparsed_parent" } },
      ],
    },
    data: {
      status: "filtered",
      moderationStatus: "filtered",
      filterReason: "reparsed_parent",
      errorMessage: null,
    },
  });
  return result.count;
}
