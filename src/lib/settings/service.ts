import { prisma } from "@/lib/db";
import { loadRuntimeConfig } from "@/config/runtime";
import type { RuntimeConfig } from "@/config/runtime";
import type { SourceConfig } from "@/lib/feed/types";
import type { AdminSettingsSnapshot } from "@/lib/settings/types";

const APP_CONFIG_ID = "default";

type SettingsOptions = {
  configPath?: string;
};

type AppConfigInput = {
  modelApiKey: string;
  modelApiBaseUrl: string;
  modelApiModel: string;
  ingestionItemConcurrency: number;
};

type SourceInput = SourceConfig & {
  groupId?: string | null;
};

function normalizeKeyword(keyword: string) {
  return keyword.trim();
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
