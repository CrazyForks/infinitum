import crypto from "node:crypto";

import type { AiEventSignature } from "@/lib/ai/provider";
import { normalizeEventSignatureForStorage } from "@/lib/clusters/normalization";

const DAY_MS = 24 * 60 * 60 * 1000;

export type ClusterEventIdentity = {
  eventFingerprint: string;
  eventBucket: string;
  eventIdentityKey: string;
  identityConfidence: number;
};

function startOfUtcWeek(value: Date) {
  const date = new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  const day = date.getUTCDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  return new Date(date.getTime() + mondayOffset * DAY_MS);
}

function toUtcDateKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

export function buildEventBucket(input: {
  eventDate?: string | null;
  publishedAt: Date;
}) {
  const eventDate = input.eventDate?.trim();
  if (eventDate && /^\d{4}-\d{2}-\d{2}$/.test(eventDate)) {
    return `date:${eventDate}`;
  }

  return `week:${toUtcDateKey(startOfUtcWeek(input.publishedAt))}`;
}

export function buildEventFingerprint(signature?: AiEventSignature | null) {
  const normalized = normalizeEventSignatureForStorage(signature);
  if (!normalized?.eventSubject || !normalized.eventObject) {
    return null;
  }

  const eventKind = normalized.eventAction || normalized.eventType;
  if (!eventKind) {
    return null;
  }

  return crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        eventType: normalized.eventType ?? "",
        eventSubject: normalized.eventSubject,
        eventAction: normalized.eventAction ?? "",
        eventObject: normalized.eventObject,
      }),
    )
    .digest("hex");
}

export function buildEventIdentity(input: {
  eventSignature?: AiEventSignature | null;
  publishedAt: Date;
}): ClusterEventIdentity | null {
  const normalized = normalizeEventSignatureForStorage(input.eventSignature);
  const eventFingerprint = buildEventFingerprint(normalized);
  if (!eventFingerprint) {
    return null;
  }

  const eventBucket = buildEventBucket({
    eventDate: normalized?.eventDate,
    publishedAt: input.publishedAt,
  });
  const hasExplicitDate = Boolean(normalized?.eventDate && /^\d{4}-\d{2}-\d{2}$/.test(normalized.eventDate));
  const identityConfidence =
    65 +
    (normalized?.eventType ? 5 : 0) +
    (normalized?.eventAction ? 10 : 0) +
    (hasExplicitDate ? 20 : 0);

  return {
    eventFingerprint,
    eventBucket,
    eventIdentityKey: `${eventFingerprint}:${eventBucket}`,
    identityConfidence: Math.min(100, identityConfidence),
  };
}
