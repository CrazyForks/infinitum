import { PromptConfigType } from "@prisma/client";

import type { RuntimeConfig } from "@/config/runtime";
import { prisma } from "@/lib/db";
import {
  ensureRuntimeConfigSeeded,
  pickPromptConfigByType,
  serializeAdminModelApiConfig,
  serializeAdminPromptConfig,
  serializeRuntimeModelApi,
  serializeSelectedPromptConfig,
  toSourceConfig,
} from "@/lib/settings/core";
import type { AdminSettingsSnapshot } from "@/lib/settings/types";
import { ensureDefaultDailyReportSchedule, ensureDefaultIngestionSchedule, toTaskScheduleSnapshot } from "@/lib/tasks/service";

export async function getIngestionRuntimeConfig(): Promise<RuntimeConfig> {
  await ensureRuntimeConfigSeeded();

  const [sources, blacklist, defaultModelConfig, promptConfigs, taskSchedule] = await Promise.all([
    prisma.source.findMany({
      where: { enabled: true },
      orderBy: { name: "asc" },
    }),
    prisma.blacklistKeyword.findMany({
      orderBy: { keyword: "asc" },
    }),
    prisma.modelApiConfig.findFirst({
      where: {
        isEnabled: true,
        isDefault: true,
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.promptConfig.findMany({
      where: {
        isEnabled: true,
        isDefault: true,
      },
      include: {
        modelApiConfig: true,
      },
      orderBy: [{ createdAt: "asc" }],
    }),
    ensureDefaultIngestionSchedule(),
  ]);

  if (!defaultModelConfig) {
    throw new Error("缺少启用中的默认模型配置。");
  }

  const itemAnalysisConfig = pickPromptConfigByType(promptConfigs, PromptConfigType.item_analysis);
  const itemSummaryConfig = pickPromptConfigByType(promptConfigs, PromptConfigType.item_summary);
  const clusterSummaryConfig = pickPromptConfigByType(promptConfigs, PromptConfigType.cluster_summary);
  const clusterMatchConfig = pickPromptConfigByType(promptConfigs, PromptConfigType.cluster_match);
  const dailyReportConfig = pickPromptConfigByType(promptConfigs, PromptConfigType.daily_report);

  return {
    rssSources: sources.map((source) => toSourceConfig(source)),
    blacklistKeywords: blacklist.map((entry) => entry.keyword),
    ingestion: {
      itemConcurrency: defaultModelConfig.ingestionItemConcurrency,
      sourceConcurrency: taskSchedule.sourceConcurrency,
      fullTextFetchThreshold: taskSchedule.fullTextFetchThreshold,
      perSourceItemLimit: taskSchedule.perSourceItemLimit,
      processingStartAt: taskSchedule.processingStartAt,
    },
    modelApi: serializeRuntimeModelApi(defaultModelConfig),
    prompts: {
      itemSummary: itemSummaryConfig.systemPrompt || itemSummaryConfig.prompt,
      itemAnalysis: itemAnalysisConfig.systemPrompt || itemAnalysisConfig.prompt,
      clusterSummary: clusterSummaryConfig.systemPrompt || clusterSummaryConfig.prompt,
      clusterMatch: clusterMatchConfig.systemPrompt || clusterMatchConfig.prompt,
      dailyReport: dailyReportConfig.systemPrompt || dailyReportConfig.prompt,
    },
    selectedPromptConfigs: {
      itemSummary: serializeSelectedPromptConfig(itemSummaryConfig),
      itemAnalysis: serializeSelectedPromptConfig(itemAnalysisConfig),
      clusterSummary: serializeSelectedPromptConfig(clusterSummaryConfig),
      clusterMatch: serializeSelectedPromptConfig(clusterMatchConfig),
      dailyReport: serializeSelectedPromptConfig(dailyReportConfig),
    },
  };
}

export async function getAdminSettings(): Promise<AdminSettingsSnapshot> {
  await ensureRuntimeConfigSeeded();

  const [modelApiConfigs, promptConfigs, blacklist, groups, sources, taskSchedule, dailyReportSchedule] = await Promise.all([
    prisma.modelApiConfig.findMany({
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    }),
    prisma.promptConfig.findMany({
      include: {
        modelApiConfig: {
          select: {
            name: true,
          },
        },
      },
      orderBy: [{ type: "asc" }, { isDefault: "desc" }, { createdAt: "desc" }],
    }),
    prisma.blacklistKeyword.findMany({
      orderBy: { keyword: "asc" },
    }),
    prisma.sourceGroup.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    prisma.source.findMany({
      include: { group: true },
      orderBy: [{ name: "asc" }],
    }),
    ensureDefaultIngestionSchedule(),
    ensureDefaultDailyReportSchedule(),
  ]);
  const latestItemsBySource = await prisma.item.groupBy({
    by: ["sourceId"],
    _max: {
      createdAt: true,
    },
  });
  const latestItemCreatedAtBySourceId = new Map(
    latestItemsBySource.map((entry) => [entry.sourceId, entry._max.createdAt]),
  );

  const defaultModelConfig = modelApiConfigs.find((config) => config.isDefault);

  return {
    modelApiConfigs: modelApiConfigs.map(serializeAdminModelApiConfig),
    promptConfigs: promptConfigs.map((config) => serializeAdminPromptConfig(config, defaultModelConfig)),
    blacklistKeywords: blacklist.map((entry) => entry.keyword),
    taskSchedule: toTaskScheduleSnapshot(taskSchedule) as AdminSettingsSnapshot["taskSchedule"],
    dailyReportSchedule: toTaskScheduleSnapshot(dailyReportSchedule) as AdminSettingsSnapshot["dailyReportSchedule"],
    groups: groups.map((group) => ({
      id: group.id,
      name: group.name,
      sortOrder: group.sortOrder,
    })),
    sources: sources.map((source) => ({
      id: source.id,
      name: source.name,
      rssUrl: source.rssUrl,
      siteUrl: source.siteUrl,
      enabled: source.enabled,
      aiParsingEnabled: source.aiParsingEnabled,
      aggregationEnabled: source.aggregationEnabled,
      groupId: source.groupId,
      groupName: source.group?.name ?? null,
      lastItemCreatedAt: latestItemCreatedAtBySourceId.get(source.id)?.toISOString() ?? null,
    })),
  };
}
