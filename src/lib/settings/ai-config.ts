import {
  DEFAULT_CLUSTER_MATCH_USER_PROMPT_TEMPLATE,
  DEFAULT_CLUSTER_MERGE_USER_PROMPT_TEMPLATE,
  DEFAULT_CLUSTER_SUMMARY_USER_PROMPT_TEMPLATE,
  DEFAULT_DAILY_REPORT_USER_PROMPT_TEMPLATE,
  DEFAULT_ITEM_ANALYSIS_USER_PROMPT_TEMPLATE,
  DEFAULT_ITEM_SUMMARY_USER_PROMPT_TEMPLATE,
} from "@/config/prompts";
import type { PromptConfigType } from "@/lib/settings/types";

export const PROMPT_TYPE_OPTIONS: Array<{
  value: PromptConfigType;
  label: string;
}> = [
  { value: "item_summary", label: "条目摘要" },
  { value: "item_analysis", label: "内容分析" },
  { value: "cluster_summary", label: "聚合摘要" },
  { value: "cluster_match", label: "归组判定" },
  { value: "cluster_merge", label: "聚合合并" },
  { value: "daily_report", label: "AI 日报" },
];

export function getPromptTypeLabel(type: PromptConfigType): string {
  return PROMPT_TYPE_OPTIONS.find((option) => option.value === type)?.label ?? type;
}

export function getDefaultPromptConfigName(type: PromptConfigType): string {
  switch (type) {
    case "item_summary":
      return "默认条目摘要提示词";
    case "item_analysis":
      return "默认内容分析提示词";
    case "cluster_summary":
      return "默认聚合摘要提示词";
    case "cluster_match":
      return "默认归组判定提示词";
    case "cluster_merge":
      return "默认聚合合并提示词";
    case "daily_report":
      return "默认 AI 日报提示词";
  }
}

export function getDefaultPromptTemplate(type: PromptConfigType): string {
  switch (type) {
    case "item_summary":
      return DEFAULT_ITEM_SUMMARY_USER_PROMPT_TEMPLATE;
    case "item_analysis":
      return DEFAULT_ITEM_ANALYSIS_USER_PROMPT_TEMPLATE;
    case "cluster_summary":
      return DEFAULT_CLUSTER_SUMMARY_USER_PROMPT_TEMPLATE;
    case "cluster_match":
      return DEFAULT_CLUSTER_MATCH_USER_PROMPT_TEMPLATE;
    case "cluster_merge":
      return DEFAULT_CLUSTER_MERGE_USER_PROMPT_TEMPLATE;
    case "daily_report":
      return DEFAULT_DAILY_REPORT_USER_PROMPT_TEMPLATE;
  }
}

export function getDefaultPromptSampling(type: PromptConfigType): {
  temperature: number | null;
  maxTokens: number | null;
  topP: number | null;
} {
  switch (type) {
    case "item_summary":
      return {
        temperature: 0.2,
        maxTokens: 300,
        topP: null,
      };
    case "item_analysis":
      return {
        temperature: 0.2,
        maxTokens: 1000,
        topP: null,
      };
    case "cluster_summary":
      return {
        temperature: 0.2,
        maxTokens: 450,
        topP: null,
      };
    case "cluster_match":
      return {
        temperature: 0,
        maxTokens: 80,
        topP: null,
      };
    case "cluster_merge":
      return {
        temperature: 0,
        maxTokens: 2000,
        topP: null,
      };
    case "daily_report":
      return {
        temperature: 0.2,
        maxTokens: 4096,
        topP: null,
      };
  }
}
