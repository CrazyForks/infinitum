import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { z } from "zod";

import { DEFAULT_BLACKLIST_KEYWORDS } from "@/config/blacklist";
import {
  DEFAULT_CLUSTER_MATCH_PROMPT,
  DEFAULT_CLUSTER_SUMMARY_PROMPT,
  DEFAULT_ITEM_ANALYSIS_PROMPT,
} from "@/config/prompts";
import { DEFAULT_SOURCE_CONFIGS } from "@/config/sources";
import type { SourceConfig } from "@/lib/feed/types";

export const DEFAULT_RUNTIME_CONFIG_RELATIVE_PATH = path.join("config", "infinitum.config.json");

export function resolveRuntimeConfigPath(baseDir = process.cwd()): string {
  return path.join(baseDir, DEFAULT_RUNTIME_CONFIG_RELATIVE_PATH);
}

const sourceConfigSchema = z.object({
  name: z.string().min(1),
  rssUrl: z.url(),
  siteUrl: z.url(),
  enabled: z.boolean(),
  fetchFullTextWhenMissing: z.boolean(),
});

const runtimeConfigSchema = z.object({
  rssSources: z.array(sourceConfigSchema).default(DEFAULT_SOURCE_CONFIGS),
  blacklistKeywords: z.array(z.string().min(1)).default(DEFAULT_BLACKLIST_KEYWORDS),
  ingestion: z
    .object({
      itemConcurrency: z.number().int().min(1).max(10).default(3),
    })
    .default({
      itemConcurrency: 3,
    }),
  modelApi: z
    .object({
      apiKey: z.string().default(""),
      baseURL: z.string().default(""),
      model: z.string().default("gpt-4.1-mini"),
    })
    .default({
      apiKey: "",
      baseURL: "",
      model: "gpt-4.1-mini",
    }),
  prompts: z
    .object({
      itemAnalysis: z
        .string()
        .default(DEFAULT_ITEM_ANALYSIS_PROMPT),
      clusterSummary: z.string().default(DEFAULT_CLUSTER_SUMMARY_PROMPT),
      clusterMatch: z.string().default(DEFAULT_CLUSTER_MATCH_PROMPT),
    })
    .default({
      itemAnalysis: DEFAULT_ITEM_ANALYSIS_PROMPT,
      clusterSummary: DEFAULT_CLUSTER_SUMMARY_PROMPT,
      clusterMatch: DEFAULT_CLUSTER_MATCH_PROMPT,
    }),
});

export type RuntimeConfig = {
  rssSources: SourceConfig[];
  blacklistKeywords: string[];
  ingestion: {
    itemConcurrency: number;
  };
  modelApi: {
    apiKey: string;
    baseURL: string;
    model: string;
  };
  prompts: {
    itemAnalysis: string;
    clusterSummary: string;
    clusterMatch: string;
  };
};

export function parseRuntimeConfig(rawValue?: string): RuntimeConfig {
  if (!rawValue?.trim()) {
    return runtimeConfigSchema.parse({});
  }

  return runtimeConfigSchema.parse(JSON.parse(rawValue));
}

export function loadRuntimeConfig(options?: { configPath?: string }): RuntimeConfig {
  const configPath = options?.configPath ?? resolveRuntimeConfigPath();

  if (!existsSync(configPath)) {
    return runtimeConfigSchema.parse({});
  }

  const fileContent = readFileSync(configPath, "utf8");
  return parseRuntimeConfig(fileContent);
}

export function getRuntimeConfig(): RuntimeConfig {
  return loadRuntimeConfig();
}
