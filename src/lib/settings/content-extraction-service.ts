import type { ContentExtractionConfig } from "@prisma/client";

import { getRuntimeConfig } from "@/config/runtime";
import type { RuntimeConfig } from "@/config/runtime";
import { prisma } from "@/lib/db";
import { maskApiKey, toIsoString } from "@/lib/settings/core";
import type { AdminSettingsSnapshot } from "@/lib/settings/types";

export type SaveContentExtractionConfigInput = {
  jinaEnabled: boolean;
  jinaBaseUrl: string;
  jinaApiKey?: string;
  jinaApiKeyMode?: "replace" | "clear" | "keep";
  timeoutMs: number;
  concurrency: number;
  rpmLimit: number;
  maxPerRun: number;
  minChars: number;
  maxChars: number;
};

const CONTENT_EXTRACTION_DEFAULTS = getRuntimeConfig().contentExtraction;

function normalizeBaseUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("请填写 Jina Reader API 地址。");
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error("Jina Reader API 地址格式无效。");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Jina Reader API 地址必须使用 HTTP 或 HTTPS。");
  }

  return parsed.toString();
}

function validateInteger(value: number, min: number, max: number, label: string) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${label}需为 ${min}-${max} 的整数。`);
  }
}

export function validateContentExtractionConfigInput(input: SaveContentExtractionConfigInput) {
  normalizeBaseUrl(input.jinaBaseUrl);

  validateInteger(input.timeoutMs, 3_000, 60_000, "请求超时");
  validateInteger(input.concurrency, 1, 5, "Jina 并发");
  validateInteger(input.rpmLimit, 1, 500, "每分钟调用上限");
  validateInteger(input.maxPerRun, 0, 200, "单次任务调用上限");
  validateInteger(input.minChars, 0, 10_000, "最小有效字符数");
  validateInteger(input.maxChars, 1_000, 100_000, "最大保留字符数");

  if (input.maxChars <= input.minChars) {
    throw new Error("最大保留字符数必须大于最小有效字符数。");
  }

  if (input.jinaApiKeyMode === "replace" && !input.jinaApiKey?.trim()) {
    throw new Error("替换 Jina API Key 时不能为空。");
  }
}

export async function ensureContentExtractionConfig(): Promise<ContentExtractionConfig> {
  const existing = await prisma.contentExtractionConfig.findFirst({
    orderBy: { createdAt: "asc" },
  });

  if (existing) {
    return existing;
  }

  return prisma.contentExtractionConfig.create({
    data: {
      jinaEnabled: CONTENT_EXTRACTION_DEFAULTS.jinaEnabled,
      jinaBaseUrl: CONTENT_EXTRACTION_DEFAULTS.jinaBaseUrl,
      jinaApiKey: CONTENT_EXTRACTION_DEFAULTS.jinaApiKey,
      timeoutMs: CONTENT_EXTRACTION_DEFAULTS.timeoutMs,
      concurrency: CONTENT_EXTRACTION_DEFAULTS.concurrency,
      rpmLimit: CONTENT_EXTRACTION_DEFAULTS.rpmLimit,
      maxPerRun: CONTENT_EXTRACTION_DEFAULTS.maxPerRun,
      minChars: CONTENT_EXTRACTION_DEFAULTS.minChars,
      maxChars: CONTENT_EXTRACTION_DEFAULTS.maxChars,
    },
  });
}

export function serializeAdminContentExtractionConfig(
  config: ContentExtractionConfig,
): AdminSettingsSnapshot["contentExtraction"] {
  return {
    id: config.id,
    jinaEnabled: config.jinaEnabled,
    jinaBaseUrl: config.jinaBaseUrl,
    jinaApiKeyMasked: maskApiKey(config.jinaApiKey ?? ""),
    hasJinaApiKey: Boolean(config.jinaApiKey),
    timeoutMs: config.timeoutMs,
    concurrency: config.concurrency,
    rpmLimit: config.rpmLimit,
    maxPerRun: config.maxPerRun,
    minChars: config.minChars,
    maxChars: config.maxChars,
    createdAt: toIsoString(config.createdAt),
    updatedAt: toIsoString(config.updatedAt),
  };
}

export function serializeRuntimeContentExtractionConfig(
  config: ContentExtractionConfig,
): RuntimeConfig["contentExtraction"] {
  return {
    jinaEnabled: config.jinaEnabled,
    jinaBaseUrl: config.jinaBaseUrl,
    jinaApiKey: config.jinaApiKey,
    timeoutMs: config.timeoutMs,
    concurrency: config.concurrency,
    rpmLimit: config.rpmLimit,
    maxPerRun: config.maxPerRun,
    minChars: config.minChars,
    maxChars: config.maxChars,
  };
}

export async function updateContentExtractionConfig(input: SaveContentExtractionConfigInput) {
  validateContentExtractionConfigInput(input);

  const current = await ensureContentExtractionConfig();
  const apiKey =
    input.jinaApiKeyMode === "clear"
      ? null
      : input.jinaApiKeyMode === "replace"
        ? input.jinaApiKey?.trim() || null
        : current.jinaApiKey;

  const config = await prisma.contentExtractionConfig.update({
    where: { id: current.id },
    data: {
      jinaEnabled: input.jinaEnabled,
      jinaBaseUrl: normalizeBaseUrl(input.jinaBaseUrl),
      jinaApiKey: apiKey,
      timeoutMs: input.timeoutMs,
      concurrency: input.concurrency,
      rpmLimit: input.rpmLimit,
      maxPerRun: input.maxPerRun,
      minChars: input.minChars,
      maxChars: input.maxChars,
    },
  });

  return serializeAdminContentExtractionConfig(config);
}
