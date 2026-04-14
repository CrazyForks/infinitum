import { JSDOM } from "jsdom";

import { prisma } from "@/lib/db";
import { loadRuntimeConfig } from "@/config/runtime";
import type { RuntimeConfig } from "@/config/runtime";
import type { SourceConfig } from "@/lib/feed/types";
import { createRssParser } from "@/lib/ingestion/parser";
import type { RssParserLike } from "@/lib/ingestion/types";
import type { AdminSettingsSnapshot, OpmlImportSummary, ResolvedSourceMetadata } from "@/lib/settings/types";

const APP_CONFIG_ID = "default";

type SettingsOptions = {
  configPath?: string;
};

type AppConfigInput = {
  modelApiKey: string;
  modelApiBaseUrl: string;
  modelApiModel: string;
  itemAnalysisPrompt: string;
  clusterSummaryPrompt: string;
  clusterMatchPrompt: string;
  ingestionItemConcurrency: number;
};

type SourceInput = SourceConfig & {
  groupId?: string | null;
};

type SourceMetadataOptions = {
  parser?: RssParserLike;
};

type ImportSourcesFromOpmlOptions = {
  parser?: RssParserLike;
  resolveMetadata?: (rssUrl: string) => Promise<ResolvedSourceMetadata>;
};

type ParsedOpmlSource = {
  name: string | null;
  rssUrl: string;
  siteUrl: string | null;
  groupName: string | null;
};

function normalizeKeyword(keyword: string) {
  return keyword.trim();
}

function normalizeText(value: string | null | undefined) {
  return value?.trim() || "";
}

function tryParseUrl(value: string | null | undefined): URL | null {
  if (!value) {
    return null;
  }

  try {
    return new URL(value.trim());
  } catch {
    return null;
  }
}

function normalizeUrl(value: string | null | undefined): string | null {
  return tryParseUrl(value)?.toString() ?? null;
}

function buildSiteUrlFromRssUrl(rssUrl: string): string {
  const parsed = new URL(rssUrl);
  return new URL("/", parsed).toString();
}

function getFallbackSourceName(rssUrl: string): string {
  return new URL(rssUrl).hostname;
}

function getOutlineLabel(node: Element): string | null {
  const label = normalizeText(node.getAttribute("title")) || normalizeText(node.getAttribute("text"));
  return label || null;
}

function parseOpmlSources(opmlText: string): ParsedOpmlSource[] {
  const trimmed = opmlText.trim();

  if (!trimmed) {
    throw new Error("OPML content is empty.");
  }

  const dom = new JSDOM(trimmed, { contentType: "text/xml" });
  const parserError = dom.window.document.querySelector("parsererror");

  if (parserError) {
    throw new Error("Invalid OPML document.");
  }

  const outlines = Array.from(dom.window.document.querySelectorAll("body > outline"));
  const sources: ParsedOpmlSource[] = [];

  function walk(nodes: Element[], currentGroupName: string | null) {
    for (const node of nodes) {
      const rssUrl = normalizeUrl(node.getAttribute("xmlUrl"));
      const siteUrl = normalizeUrl(node.getAttribute("htmlUrl"));
      const name = getOutlineLabel(node);

      if (rssUrl) {
        sources.push({
          name,
          rssUrl,
          siteUrl,
          groupName: currentGroupName,
        });
        continue;
      }

      const nextGroupName = name ?? currentGroupName;
      const children = Array.from(node.children).filter((child): child is Element => child.tagName === "outline");
      walk(children, nextGroupName);
    }
  }

  walk(outlines, null);

  if (sources.length === 0) {
    throw new Error("No valid RSS subscriptions found in OPML.");
  }

  return sources;
}

function maskApiKey(apiKey: string): string {
  if (!apiKey) {
    return "";
  }

  return `••••••••${apiKey.slice(-4)}`;
}

function toSourceConfig(source: {
  name: string;
  rssUrl: string;
  siteUrl: string;
  enabled: boolean;
  fetchFullTextWhenMissing: boolean;
}): SourceConfig {
  return {
    name: source.name,
    rssUrl: source.rssUrl,
    siteUrl: source.siteUrl,
    enabled: source.enabled,
    fetchFullTextWhenMissing: source.fetchFullTextWhenMissing,
  };
}

async function ensureAppConfigRecord(defaults?: Partial<AppConfigInput>) {
  return prisma.appConfig.upsert({
    where: { id: APP_CONFIG_ID },
    update: {},
    create: {
      id: APP_CONFIG_ID,
      modelApiKey: defaults?.modelApiKey ?? "",
      modelApiBaseUrl: defaults?.modelApiBaseUrl ?? "",
      modelApiModel: defaults?.modelApiModel ?? "gpt-4.1-mini",
      itemAnalysisPrompt: defaults?.itemAnalysisPrompt ?? loadRuntimeConfig().prompts.itemAnalysis,
      clusterSummaryPrompt: defaults?.clusterSummaryPrompt ?? loadRuntimeConfig().prompts.clusterSummary,
      clusterMatchPrompt: defaults?.clusterMatchPrompt ?? loadRuntimeConfig().prompts.clusterMatch,
      ingestionItemConcurrency: defaults?.ingestionItemConcurrency ?? 3,
    },
  });
}

export async function ensureRuntimeConfigSeeded(options?: SettingsOptions) {
  const fileConfig = loadRuntimeConfig(options);

  const [appConfigCount, sourceCount, blacklistCount] = await Promise.all([
    prisma.appConfig.count(),
    prisma.source.count(),
    prisma.blacklistKeyword.count(),
  ]);

  if (appConfigCount > 0 && sourceCount > 0) {
    return;
  }

  await prisma.$transaction(async (tx) => {
    if (appConfigCount === 0) {
      await tx.appConfig.create({
        data: {
          id: APP_CONFIG_ID,
          modelApiKey: fileConfig.modelApi.apiKey,
          modelApiBaseUrl: fileConfig.modelApi.baseURL,
          modelApiModel: fileConfig.modelApi.model,
          itemAnalysisPrompt: fileConfig.prompts.itemAnalysis,
          clusterSummaryPrompt: fileConfig.prompts.clusterSummary,
          clusterMatchPrompt: fileConfig.prompts.clusterMatch,
          ingestionItemConcurrency: fileConfig.ingestion.itemConcurrency,
        },
      });
    }

    if (sourceCount === 0 && fileConfig.rssSources.length > 0) {
      await tx.source.createMany({
        data: fileConfig.rssSources.map((source) => ({
          name: source.name,
          rssUrl: source.rssUrl,
          siteUrl: source.siteUrl,
          enabled: source.enabled,
          fetchFullTextWhenMissing: source.fetchFullTextWhenMissing,
        })),
      });
    }

    if (blacklistCount === 0 && fileConfig.blacklistKeywords.length > 0) {
      await tx.blacklistKeyword.createMany({
        data: fileConfig.blacklistKeywords
          .map(normalizeKeyword)
          .filter(Boolean)
          .map((keyword) => ({ keyword })),
      });
    }
  });
}

export async function getIngestionRuntimeConfig(options?: SettingsOptions): Promise<RuntimeConfig> {
  await ensureRuntimeConfigSeeded(options);

  const [appConfig, sources, blacklist] = await Promise.all([
    ensureAppConfigRecord(),
    prisma.source.findMany({
      where: { enabled: true },
      orderBy: { name: "asc" },
    }),
    prisma.blacklistKeyword.findMany({
      orderBy: { keyword: "asc" },
    }),
  ]);

  return {
    rssSources: sources.map(toSourceConfig),
    blacklistKeywords: blacklist.map((entry) => entry.keyword),
    ingestion: {
      itemConcurrency: appConfig.ingestionItemConcurrency,
    },
    modelApi: {
      apiKey: appConfig.modelApiKey,
      baseURL: appConfig.modelApiBaseUrl,
      model: appConfig.modelApiModel,
    },
    prompts: {
      itemAnalysis: appConfig.itemAnalysisPrompt,
      clusterSummary: appConfig.clusterSummaryPrompt,
      clusterMatch: appConfig.clusterMatchPrompt,
    },
  };
}

export async function getAdminSettings(options?: SettingsOptions): Promise<AdminSettingsSnapshot> {
  await ensureRuntimeConfigSeeded(options);

  const [appConfig, blacklist, groups, sources] = await Promise.all([
    ensureAppConfigRecord(),
    prisma.blacklistKeyword.findMany({
      orderBy: { keyword: "asc" },
    }),
    prisma.sourceGroup.findMany({
      orderBy: { name: "asc" },
    }),
    prisma.source.findMany({
      include: { group: true },
      orderBy: [{ name: "asc" }],
    }),
  ]);

  return {
    appConfig: {
      ingestionItemConcurrency: appConfig.ingestionItemConcurrency,
      modelApi: {
        baseURL: appConfig.modelApiBaseUrl,
        model: appConfig.modelApiModel,
        apiKeyMasked: maskApiKey(appConfig.modelApiKey),
        hasApiKey: Boolean(appConfig.modelApiKey),
      },
      prompts: {
        itemAnalysis: appConfig.itemAnalysisPrompt,
        clusterSummary: appConfig.clusterSummaryPrompt,
        clusterMatch: appConfig.clusterMatchPrompt,
      },
    },
    blacklistKeywords: blacklist.map((entry) => entry.keyword),
    groups: groups.map((group) => ({
      id: group.id,
      name: group.name,
    })),
    sources: sources.map((source) => ({
      id: source.id,
      name: source.name,
      rssUrl: source.rssUrl,
      siteUrl: source.siteUrl,
      enabled: source.enabled,
      fetchFullTextWhenMissing: source.fetchFullTextWhenMissing,
      groupId: source.groupId,
      groupName: source.group?.name ?? null,
    })),
  };
}

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

  const siteUrl = normalizeUrl(parsedFeed.link) ?? buildSiteUrlFromRssUrl(normalizedRssUrl);
  const name = normalizeText(parsedFeed.title) || getFallbackSourceName(normalizedRssUrl);

  return {
    name,
    rssUrl: normalizedRssUrl,
    siteUrl,
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
          fetchFullTextWhenMissing: true,
        },
        create: {
          name,
          rssUrl: source.rssUrl,
          siteUrl,
          groupId,
          enabled: true,
          fetchFullTextWhenMissing: true,
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

export async function updateAppConfig(
  input: AppConfigInput & {
    apiKeyMode?: "replace" | "clear" | "keep";
  },
) {
  const current = await ensureAppConfigRecord();
  const nextApiKey =
    input.apiKeyMode === "clear"
      ? ""
      : input.apiKeyMode === "replace"
        ? input.modelApiKey
        : current.modelApiKey;

  return prisma.appConfig.update({
    where: { id: APP_CONFIG_ID },
    data: {
      modelApiKey: nextApiKey,
      modelApiBaseUrl: input.modelApiBaseUrl,
      modelApiModel: input.modelApiModel,
      itemAnalysisPrompt: input.itemAnalysisPrompt,
      clusterSummaryPrompt: input.clusterSummaryPrompt,
      clusterMatchPrompt: input.clusterMatchPrompt,
      ingestionItemConcurrency: input.ingestionItemConcurrency,
    },
  });
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
      fetchFullTextWhenMissing: input.fetchFullTextWhenMissing,
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
      fetchFullTextWhenMissing: input.fetchFullTextWhenMissing,
      groupId: input.groupId ?? null,
    },
  });
}

export async function deleteSource(id: string) {
  await prisma.source.delete({
    where: { id },
  });
}
