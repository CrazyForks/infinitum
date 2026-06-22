import { prisma } from "@/lib/db";
import { refreshClusterFeedStatsSafely } from "@/lib/clusters/feed-stats";
import { invalidateFeedCache } from "@/lib/feed/cache";
import { normalizeItemTags } from "@/lib/tags/normalization";

type PrismaTransaction = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

export async function replaceItemTagsInTransaction(
  tx: PrismaTransaction,
  itemId: string,
  tagsInput: unknown,
) {
  const tags = normalizeItemTags(tagsInput);

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
