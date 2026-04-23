import { DEFAULT_BLACKLIST_KEYWORDS } from "@/config/blacklist";
import {
  DEFAULT_CLUSTER_MATCH_PROMPT,
  DEFAULT_CLUSTER_SUMMARY_PROMPT,
  DEFAULT_ITEM_ANALYSIS_PROMPT,
  DEFAULT_ITEM_SUMMARY_PROMPT,
} from "@/config/prompts";
import { DEFAULT_SOURCE_CONFIGS } from "@/config/sources";
import type { SourceConfig } from "@/lib/feed/types";
import {
  DEFAULT_FULL_TEXT_FETCH_THRESHOLD,
  DEFAULT_PER_SOURCE_ITEM_LIMIT,
} from "@/lib/tasks/scheduler";

export type RuntimeConfig = {
  rssSources: SourceConfig[];
  blacklistKeywords: string[];
  ingestion: {
    itemConcurrency: number;
    sourceConcurrency: number;
    fullTextFetchThreshold: number;
    perSourceItemLimit: number;
  };
  modelApi: {
    apiKey: string;
    baseURL: string;
    model: string;
  };
  prompts: {
    itemSummary: string;
    itemAnalysis: string;
    clusterSummary: string;
    clusterMatch: string;
  };
  selectedPromptConfigs?: {
    itemSummary: {
      name: string;
      systemPrompt: string;
      promptTemplate: string;
      temperature?: number | null;
      maxTokens?: number | null;
      topP?: number | null;
      modelApi?: RuntimeConfig["modelApi"] | null;
    };
    itemAnalysis: {
      name: string;
      systemPrompt: string;
      promptTemplate: string;
      temperature?: number | null;
      maxTokens?: number | null;
      topP?: number | null;
      modelApi?: RuntimeConfig["modelApi"] | null;
    };
    clusterSummary: {
      name: string;
      systemPrompt: string;
      promptTemplate: string;
      temperature?: number | null;
      maxTokens?: number | null;
      topP?: number | null;
      modelApi?: RuntimeConfig["modelApi"] | null;
    };
    clusterMatch: {
      name: string;
      systemPrompt: string;
      promptTemplate: string;
      temperature?: number | null;
      maxTokens?: number | null;
      topP?: number | null;
      modelApi?: RuntimeConfig["modelApi"] | null;
    };
  };
};

export function getRuntimeConfig(): RuntimeConfig {
  return {
    rssSources: DEFAULT_SOURCE_CONFIGS.map((source) => ({ ...source })),
    blacklistKeywords: [...DEFAULT_BLACKLIST_KEYWORDS],
    ingestion: {
      itemConcurrency: 3,
      sourceConcurrency: 2,
      fullTextFetchThreshold: DEFAULT_FULL_TEXT_FETCH_THRESHOLD,
      perSourceItemLimit: DEFAULT_PER_SOURCE_ITEM_LIMIT,
    },
    modelApi: {
      apiKey: "",
      baseURL: "",
      model: "gpt-4.1-mini",
    },
    prompts: {
      itemSummary: DEFAULT_ITEM_SUMMARY_PROMPT,
      itemAnalysis: DEFAULT_ITEM_ANALYSIS_PROMPT,
      clusterSummary: DEFAULT_CLUSTER_SUMMARY_PROMPT,
      clusterMatch: DEFAULT_CLUSTER_MATCH_PROMPT,
    },
  };
}
