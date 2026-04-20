import { DEFAULT_BLACKLIST_KEYWORDS } from "@/config/blacklist";
import {
  DEFAULT_CLUSTER_MATCH_PROMPT,
  DEFAULT_CLUSTER_SUMMARY_PROMPT,
  DEFAULT_ITEM_ANALYSIS_PROMPT,
} from "@/config/prompts";
import { DEFAULT_SOURCE_CONFIGS } from "@/config/sources";
import type { SourceConfig } from "@/lib/feed/types";

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
  selectedPromptConfigs?: {
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
    },
    modelApi: {
      apiKey: "",
      baseURL: "",
      model: "gpt-4.1-mini",
    },
    prompts: {
      itemAnalysis: DEFAULT_ITEM_ANALYSIS_PROMPT,
      clusterSummary: DEFAULT_CLUSTER_SUMMARY_PROMPT,
      clusterMatch: DEFAULT_CLUSTER_MATCH_PROMPT,
    },
  };
}
