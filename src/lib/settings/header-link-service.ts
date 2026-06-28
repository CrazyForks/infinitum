import type { HeaderLink } from "@prisma/client";

import { prisma } from "@/lib/db";
import type { AdminHeaderLink } from "@/lib/settings/types";

export type HeaderLinkInput = {
  label: string;
  url: string;
  enabled: boolean;
  sortOrder?: number;
  openInNewTab: boolean;
  rel?: string;
};

const DEFAULT_REL = "noopener noreferrer";
const ALLOWED_REL_TOKENS = new Set([
  "noopener",
  "noreferrer",
  "nofollow",
  "sponsored",
  "ugc",
]);

function normalizeHeaderLinkLabel(label: string) {
  return label.trim().replace(/\s+/g, " ");
}

function normalizeHeaderLinkUrl(url: string) {
  const parsed = new URL(url.trim());

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("链接 URL 仅支持 http 或 https。");
  }

  return parsed.toString();
}

function normalizeRel(rel: string | null | undefined, openInNewTab: boolean) {
  if (!openInNewTab) {
    return "";
  }

  const tokens = (rel || DEFAULT_REL)
    .split(/\s+/)
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean);
  const normalizedTokens = new Set(tokens.filter((token) => ALLOWED_REL_TOKENS.has(token)));

  normalizedTokens.add("noopener");
  normalizedTokens.add("noreferrer");

  return Array.from(normalizedTokens).join(" ");
}

function validateHeaderLinkInput(input: HeaderLinkInput) {
  const label = normalizeHeaderLinkLabel(input.label);

  if (label.length < 1 || label.length > 20) {
    throw new Error("链接名称需为 1-20 个字符。");
  }

  const sortOrder = input.sortOrder ?? 0;
  if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 9999) {
    throw new Error("排序值需为 0-9999 的整数。");
  }

  return {
    label,
    url: normalizeHeaderLinkUrl(input.url),
    enabled: input.enabled,
    sortOrder,
    openInNewTab: input.openInNewTab,
    rel: normalizeRel(input.rel, input.openInNewTab),
  };
}

export function serializeAdminHeaderLink(link: HeaderLink): AdminHeaderLink {
  return {
    id: link.id,
    label: link.label,
    url: link.url,
    enabled: link.enabled,
    sortOrder: link.sortOrder,
    openInNewTab: link.openInNewTab,
    rel: link.rel,
    createdAt: link.createdAt.toISOString(),
    updatedAt: link.updatedAt.toISOString(),
  };
}

export async function listPublicHeaderLinks(): Promise<AdminHeaderLink[]> {
  const links = await prisma.headerLink.findMany({
    where: { enabled: true },
    orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
  });

  return links.map(serializeAdminHeaderLink);
}

export async function listAdminHeaderLinks(): Promise<AdminHeaderLink[]> {
  const links = await prisma.headerLink.findMany({
    orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
  });

  return links.map(serializeAdminHeaderLink);
}

export async function createHeaderLink(input: HeaderLinkInput) {
  const data = validateHeaderLinkInput(input);
  const link = await prisma.headerLink.create({ data });

  return serializeAdminHeaderLink(link);
}

export async function updateHeaderLink(id: string, input: HeaderLinkInput) {
  const data = validateHeaderLinkInput(input);
  const link = await prisma.headerLink.update({
    where: { id },
    data,
  });

  return serializeAdminHeaderLink(link);
}

export async function deleteHeaderLink(id: string) {
  await prisma.headerLink.delete({
    where: { id },
  });
}

export async function reorderHeaderLinks(linkIds: string[]) {
  const uniqueIds = Array.from(new Set(linkIds));

  if (uniqueIds.length !== linkIds.length) {
    throw new Error("导航栏配置排序列表包含重复项。");
  }

  const existing = await prisma.headerLink.findMany({
    where: { id: { in: uniqueIds } },
    select: { id: true },
  });

  if (existing.length !== uniqueIds.length) {
    throw new Error("导航栏配置不存在或已被删除。");
  }

  await prisma.$transaction(
    uniqueIds.map((id, index) =>
      prisma.headerLink.update({
        where: { id },
        data: { sortOrder: index },
      }),
    ),
  );

  return listAdminHeaderLinks();
}
