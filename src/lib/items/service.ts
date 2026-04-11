import type { Item } from "@prisma/client";

import { createAiProvider, type AiProvider } from "@/lib/ai/provider";
import { prisma } from "@/lib/db";
import { shouldTranslateTitle, stripHtmlTags } from "@/lib/feed/presentation";
import { getIngestionRuntimeConfig } from "@/lib/settings/service";

type RegenerationTarget = "translation" | "summary";

type RegenerationOptions = {
  aiProvider?: AiProvider;
};

function getRegenerationInput(item: Item): string {
  return item.fullText || item.rssContent || item.rssExcerpt || item.originalTitle;
}

function normalizeSummary(summary: string | null | undefined): string | null {
  return stripHtmlTags(summary) || null;
}

export async function regenerateItemContent(
  itemId: string,
  target: RegenerationTarget,
  options?: RegenerationOptions,
) {
  const item = await prisma.item.findUnique({
    where: { id: itemId },
    include: { source: true },
  });

  if (!item || item.status !== "processed") {
    throw new Error("Item not found");
  }

  const aiProvider =
    options?.aiProvider ??
    createAiProvider((await getIngestionRuntimeConfig()).modelApi);

  try {
    const enrichment = await aiProvider.enrichContent(getRegenerationInput(item), {
      title: item.originalTitle,
      sourceName: item.source.name,
      translateTitle: target === "translation" && shouldTranslateTitle(item.originalTitle),
    });

    await prisma.item.update({
      where: { id: item.id },
      data:
        target === "translation"
          ? {
              translatedTitle:
                shouldTranslateTitle(item.originalTitle) ? enrichment.translatedTitle?.trim() || item.originalTitle : item.translatedTitle,
              errorMessage: null,
            }
          : {
              summaryText: normalizeSummary(enrichment.summary) || item.summaryText,
              errorMessage: null,
            },
    });
  } catch (error) {
    await prisma.item.update({
      where: { id: item.id },
      data: {
        errorMessage: error instanceof Error ? error.message : "Unknown regeneration error",
      },
    });
  }

  return prisma.item.findUniqueOrThrow({
    where: { id: item.id },
    include: { source: true },
  });
}
