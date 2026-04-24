import { prisma } from "@/lib/db";
import { createRssParser } from "@/lib/ingestion/parser";
import {
  buildSiteUrlFromRssUrl,
  getFallbackSourceName,
  type ImportSourcesFromOpmlOptions,
  parseOpmlSources,
  type SourceInput,
  type SourceMetadataOptions,
  shouldEnableAiParsing,
} from "@/lib/settings/core";
import type { OpmlImportSummary, ResolvedSourceMetadata } from "@/lib/settings/types";
import { normalizeKeyword, normalizeText, normalizeUrl } from "@/lib/utils/text";

export async function resolveSourceMetadata(
  rssUrl: string,
  options?: SourceMetadataOptions,
): Promise<ResolvedSourceMetadata> {
  const normalizedRssUrl = normalizeUrl(rssUrl);

  if (!normalizedRssUrl) {
    throw new Error("Invalid RSS URL.");
  }

  const parser = options?.parser ?? createRssParser();

  let parsedFeed;

  try {
    parsedFeed = await parser.parseURL(normalizedRssUrl);
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : "Failed to resolve RSS metadata.");
  }

  return {
    name: normalizeText(parsedFeed.title) || getFallbackSourceName(normalizedRssUrl),
    rssUrl: normalizedRssUrl,
    siteUrl: normalizeUrl(parsedFeed.link) ?? buildSiteUrlFromRssUrl(normalizedRssUrl),
    suggestedAiParsingEnabled: shouldEnableAiParsing(parsedFeed.items ?? []),
  };
}

export async function importSourcesFromOpml(
  opmlText: string,
  options?: ImportSourcesFromOpmlOptions,
): Promise<OpmlImportSummary> {
  const parsedSources = parseOpmlSources(opmlText);
  const parser = options?.parser ?? createRssParser();
  const resolveMetadata =
    options?.resolveMetadata ??
    ((rssUrl: string) =>
      resolveSourceMetadata(rssUrl, {
        parser,
      }));
  const existingGroups = await prisma.sourceGroup.findMany();
  const groupIdByName = new Map(existingGroups.map((group) => [group.name, group.id]));
  let createdCount = 0;
  let updatedCount = 0;
  const failures: OpmlImportSummary["failures"] = [];

  for (const source of parsedSources) {
    try {
      const metadata = await resolveMetadata(source.rssUrl);
      const groupName = source.groupName ? normalizeText(source.groupName) : "";
      let groupId: string | null = null;

      if (groupName) {
        const existingGroupId = groupIdByName.get(groupName);

        if (existingGroupId) {
          groupId = existingGroupId;
        } else {
          const group = await prisma.sourceGroup.create({
            data: {
              name: groupName,
            },
          });
          groupIdByName.set(groupName, group.id);
          groupId = group.id;
        }
      }

      const existingSource = await prisma.source.findUnique({
        where: { rssUrl: source.rssUrl },
      });
      const name = source.name || metadata.name;
      const siteUrl = source.siteUrl || metadata.siteUrl;

      await prisma.source.upsert({
        where: { rssUrl: source.rssUrl },
        update: {
          name,
          siteUrl,
          groupId,
          enabled: true,
        },
        create: {
          name,
          rssUrl: source.rssUrl,
          siteUrl,
          groupId,
          enabled: true,
          aiParsingEnabled: true,
        },
      });

      if (existingSource) {
        updatedCount += 1;
      } else {
        createdCount += 1;
      }
    } catch (error) {
      failures.push({
        rssUrl: source.rssUrl,
        message: error instanceof Error ? error.message : "Unknown OPML import error.",
      });
    }
  }

  return {
    totalCount: parsedSources.length,
    createdCount,
    updatedCount,
    failedCount: failures.length,
    failures,
  };
}

export async function replaceBlacklistKeywords(keywords: string[]) {
  const normalized = [...new Set(keywords.map(normalizeKeyword).filter(Boolean))];

  await prisma.$transaction([
    prisma.blacklistKeyword.deleteMany(),
    ...(normalized.length > 0
      ? [
          prisma.blacklistKeyword.createMany({
            data: normalized.map((keyword) => ({ keyword })),
          }),
        ]
      : []),
  ]);
}

export async function createSourceGroup(name: string) {
  return prisma.sourceGroup.create({
    data: {
      name: name.trim(),
    },
  });
}

export async function renameSourceGroup(id: string, name: string) {
  return prisma.sourceGroup.update({
    where: { id },
    data: {
      name: name.trim(),
    },
  });
}

export async function deleteSourceGroup(id: string) {
  const assignedSourceCount = await prisma.source.count({
    where: { groupId: id },
  });

  if (assignedSourceCount > 0) {
    throw new Error("Please move sources out of this group before deleting it.");
  }

  await prisma.sourceGroup.delete({
    where: { id },
  });
}

export async function createSource(input: SourceInput) {
  return prisma.source.create({
    data: {
      name: input.name,
      rssUrl: input.rssUrl,
      siteUrl: input.siteUrl,
      enabled: input.enabled,
      aiParsingEnabled: input.aiParsingEnabled,
      groupId: input.groupId ?? null,
    },
  });
}

export async function updateSource(id: string, input: SourceInput) {
  return prisma.source.update({
    where: { id },
    data: {
      name: input.name,
      rssUrl: input.rssUrl,
      siteUrl: input.siteUrl,
      enabled: input.enabled,
      aiParsingEnabled: input.aiParsingEnabled,
      groupId: input.groupId ?? null,
    },
  });
}

export async function deleteSource(id: string) {
  await prisma.source.delete({
    where: { id },
  });
}
