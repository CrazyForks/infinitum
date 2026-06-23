import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { refreshClusterFeedStatsSafely } from "@/lib/clusters/feed-stats";
import { invalidateFeedCache } from "@/lib/feed/cache";
import { normalizeItemTags, normalizeTagName, type NormalizedTag } from "@/lib/tags/normalization";

type PrismaTransaction = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

const DEFAULT_TAG_PAGE_SIZE = 30;
const MAX_TAG_PAGE_SIZE = 100;

export type AdminTagAlias = {
  id: string;
  aliasName: string;
  aliasNormalized: string;
  createdBy: string;
  createdAt: string;
};

export type AdminTag = {
  id: string;
  name: string;
  normalized: string;
  itemCount: number;
  aliasCount: number;
  aliases: AdminTagAlias[];
  createdAt: string;
  updatedAt: string;
};

export type AdminTagList = {
  tags: AdminTag[];
  totalCount: number;
  page: number;
  pageSize: number;
};

function normalizePage(value: number | null | undefined) {
  return Number.isInteger(value) && value && value > 0 ? value : 1;
}

function normalizePageSize(value: number | null | undefined) {
  if (!Number.isInteger(value) || !value || value <= 0) {
    return DEFAULT_TAG_PAGE_SIZE;
  }

  return Math.min(value, MAX_TAG_PAGE_SIZE);
}

function serializeAdminTag(tag: {
  id: string;
  name: string;
  normalized: string;
  createdAt: Date;
  updatedAt: Date;
  aliases: Array<{
    id: string;
    aliasName: string;
    aliasNormalized: string;
    createdBy: string;
    createdAt: Date;
  }>;
  _count: {
    items: number;
    aliases: number;
  };
}): AdminTag {
  return {
    id: tag.id,
    name: tag.name,
    normalized: tag.normalized,
    itemCount: tag._count.items,
    aliasCount: tag._count.aliases,
    aliases: tag.aliases.map((alias) => ({
      id: alias.id,
      aliasName: alias.aliasName,
      aliasNormalized: alias.aliasNormalized,
      createdBy: alias.createdBy,
      createdAt: alias.createdAt.toISOString(),
    })),
    createdAt: tag.createdAt.toISOString(),
    updatedAt: tag.updatedAt.toISOString(),
  };
}

async function resolveCanonicalTagsInTransaction(
  tx: PrismaTransaction,
  tags: NormalizedTag[],
): Promise<NormalizedTag[]> {
  if (tags.length === 0) {
    return [];
  }

  const aliases = await tx.tagAlias.findMany({
    where: {
      aliasNormalized: {
        in: tags.map((tag) => tag.normalized),
      },
    },
    include: {
      tag: true,
    },
  });
  const aliasByNormalized = new Map(aliases.map((alias) => [alias.aliasNormalized, alias.tag]));
  const seen = new Set<string>();
  const canonicalTags: NormalizedTag[] = [];

  for (const tag of tags) {
    const canonicalTag = aliasByNormalized.get(tag.normalized);
    const nextTag = canonicalTag
      ? { name: canonicalTag.name, normalized: canonicalTag.normalized }
      : tag;

    if (seen.has(nextTag.normalized)) {
      continue;
    }

    seen.add(nextTag.normalized);
    canonicalTags.push(nextTag);
  }

  return canonicalTags;
}

export async function replaceItemTagsInTransaction(
  tx: PrismaTransaction,
  itemId: string,
  tagsInput: unknown,
) {
  const tags = await resolveCanonicalTagsInTransaction(tx, normalizeItemTags(tagsInput));

  await tx.itemTag.deleteMany({
    where: { itemId },
  });

  if (tags.length === 0) {
    return;
  }

  for (const tag of tags) {
    const storedTag = await tx.tag.upsert({
      where: { normalized: tag.normalized },
      update: {
        name: tag.name,
      },
      create: tag,
    });

    await tx.itemTag.create({
      data: {
        itemId,
        tagId: storedTag.id,
      },
    });
  }
}

export async function replaceItemTags(itemId: string, tagsInput: unknown) {
  await prisma.$transaction((tx) => replaceItemTagsInTransaction(tx, itemId, tagsInput));
  const item = await prisma.item.findUnique({
    where: { id: itemId },
    select: { clusterId: true },
  });
  if (item?.clusterId) {
    await refreshClusterFeedStatsSafely([item.clusterId], "replace item tags");
  }
  invalidateFeedCache();
}

export async function listAdminTags(input?: {
  search?: string | null;
  page?: number | null;
  pageSize?: number | null;
}): Promise<AdminTagList> {
  const page = normalizePage(input?.page);
  const pageSize = normalizePageSize(input?.pageSize);
  const search = input?.search?.trim() ?? "";
  const where: Prisma.TagWhereInput = search
    ? {
        OR: [
          { name: { contains: search } },
          { normalized: { contains: search.toLocaleLowerCase() } },
          { aliases: { some: { aliasName: { contains: search } } } },
          { aliases: { some: { aliasNormalized: { contains: search.toLocaleLowerCase() } } } },
        ],
      }
    : {};

  const [totalCount, tags] = await Promise.all([
    prisma.tag.count({ where }),
    prisma.tag.findMany({
      where,
      include: {
        aliases: {
          orderBy: [{ aliasName: "asc" }],
        },
        _count: {
          select: {
            items: true,
            aliases: true,
          },
        },
      },
      orderBy: [
        { items: { _count: "desc" } },
        { name: "asc" },
      ],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return {
    tags: tags.map(serializeAdminTag),
    totalCount,
    page,
    pageSize,
  };
}

async function upsertTagAliasInTransaction(
  tx: PrismaTransaction,
  input: {
    tagId: string;
    aliasName: string;
    aliasNormalized: string;
    createdBy?: string;
    allowReassign?: boolean;
  },
) {
  const existing = await tx.tagAlias.findUnique({
    where: { aliasNormalized: input.aliasNormalized },
  });

  if (existing && existing.tagId !== input.tagId && !input.allowReassign) {
    throw new Error("该别名已指向其他标签。");
  }

  return tx.tagAlias.upsert({
    where: { aliasNormalized: input.aliasNormalized },
    update: {
      tagId: input.tagId,
      aliasName: input.aliasName,
      createdBy: input.createdBy ?? "admin",
    },
    create: {
      tagId: input.tagId,
      aliasName: input.aliasName,
      aliasNormalized: input.aliasNormalized,
      createdBy: input.createdBy ?? "admin",
    },
  });
}

export async function addTagAlias(input: {
  tagId: string;
  aliasName: string;
  createdBy?: string;
}): Promise<AdminTagAlias> {
  const alias = normalizeTagName(input.aliasName);
  if (!alias) {
    throw new Error("别名不能为空、过长或属于泛词。");
  }

  const created = await prisma.$transaction(async (tx) => {
    const targetTag = await tx.tag.findUnique({
      where: { id: input.tagId },
    });

    if (!targetTag) {
      throw new Error("目标标签不存在。");
    }

    if (alias.normalized === targetTag.normalized) {
      throw new Error("别名与规范标签相同，无需添加。");
    }

    const conflictingTag = await tx.tag.findUnique({
      where: { normalized: alias.normalized },
    });

    if (conflictingTag && conflictingTag.id !== targetTag.id) {
      throw new Error("该表达已是独立标签，请使用标签合并。");
    }

    return upsertTagAliasInTransaction(tx, {
      tagId: targetTag.id,
      aliasName: alias.name,
      aliasNormalized: alias.normalized,
      createdBy: input.createdBy,
    });
  });

  return {
    id: created.id,
    aliasName: created.aliasName,
    aliasNormalized: created.aliasNormalized,
    createdBy: created.createdBy,
    createdAt: created.createdAt.toISOString(),
  };
}

export async function deleteTagAlias(aliasId: string): Promise<void> {
  await prisma.tagAlias.delete({
    where: { id: aliasId },
  });
}

export async function mergeTags(input: {
  targetTagId: string;
  sourceTagIds: string[];
  createdBy?: string;
}): Promise<{ mergedCount: number; affectedClusterCount: number }> {
  const sourceTagIds = [...new Set(input.sourceTagIds.map((id) => id.trim()).filter(Boolean))]
    .filter((id) => id !== input.targetTagId);

  if (!input.targetTagId.trim()) {
    throw new Error("请选择规范标签。");
  }

  if (sourceTagIds.length === 0) {
    throw new Error("请选择至少一个需要合并的来源标签。");
  }

  const affectedClusterIds = await prisma.$transaction(async (tx) => {
    const targetTag = await tx.tag.findUnique({
      where: { id: input.targetTagId },
    });

    if (!targetTag) {
      throw new Error("规范标签不存在。");
    }

    const sourceTags = await tx.tag.findMany({
      where: { id: { in: sourceTagIds } },
      include: { aliases: true },
    });

    if (sourceTags.length !== sourceTagIds.length) {
      throw new Error("部分来源标签不存在。");
    }

    const affectedItems = await tx.item.findMany({
      where: {
        tags: {
          some: {
            tagId: {
              in: sourceTagIds,
            },
          },
        },
      },
      select: {
        clusterId: true,
      },
    });

    for (const sourceTag of sourceTags) {
      const aliasesToPreserve = [
        {
          aliasName: sourceTag.name,
          aliasNormalized: sourceTag.normalized,
        },
        ...sourceTag.aliases.map((alias) => ({
          aliasName: alias.aliasName,
          aliasNormalized: alias.aliasNormalized,
        })),
      ].filter((alias) => alias.aliasNormalized !== targetTag.normalized);

      for (const alias of aliasesToPreserve) {
        await upsertTagAliasInTransaction(tx, {
          tagId: targetTag.id,
          aliasName: alias.aliasName,
          aliasNormalized: alias.aliasNormalized,
          createdBy: input.createdBy,
          allowReassign: true,
        });
      }

      await tx.$executeRaw`
        DELETE FROM "item_tags"
        WHERE "tagId" = ${sourceTag.id}
          AND EXISTS (
            SELECT 1
            FROM "item_tags" existing
            WHERE existing."itemId" = "item_tags"."itemId"
              AND existing."tagId" = ${targetTag.id}
          )
      `;
      await tx.itemTag.updateMany({
        where: { tagId: sourceTag.id },
        data: { tagId: targetTag.id },
      });
      await tx.tag.delete({
        where: { id: sourceTag.id },
      });
    }

    return [...new Set(
      affectedItems
        .map((item) => item.clusterId)
        .filter((clusterId): clusterId is string => Boolean(clusterId)),
    )];
  });

  if (affectedClusterIds.length > 0) {
    await refreshClusterFeedStatsSafely(affectedClusterIds, "merge tags");
  }
  invalidateFeedCache();

  return {
    mergedCount: sourceTagIds.length,
    affectedClusterCount: affectedClusterIds.length,
  };
}
