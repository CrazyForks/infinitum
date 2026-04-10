import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { DEFAULT_BLACKLIST_KEYWORDS } from "@/config/blacklist";
import {
  loadRuntimeConfig,
  parseRuntimeConfig,
  resolveRuntimeConfigPath,
} from "@/config/runtime";
import { DEFAULT_SOURCE_CONFIGS } from "@/config/sources";

describe("runtime config parsing", () => {
  it("parses runtime config from JSON content", () => {
    const parsed = parseRuntimeConfig(
      JSON.stringify({
        rssSources: [
          {
            name: "Test Feed",
            rssUrl: "https://example.com/feed.xml",
            siteUrl: "https://example.com",
            enabled: true,
            fetchFullTextWhenMissing: false,
          },
        ],
        blacklistKeywords: ["layoffs", "funding"],
        ingestion: {
          itemConcurrency: 4,
        },
        modelApi: {
          apiKey: "sk-test",
          baseURL: "https://example.com/v1",
          model: "gpt-test",
        },
      }),
    );

    expect(parsed.rssSources).toEqual([
      {
        name: "Test Feed",
        rssUrl: "https://example.com/feed.xml",
        siteUrl: "https://example.com",
        enabled: true,
        fetchFullTextWhenMissing: false,
      },
    ]);
    expect(parsed.blacklistKeywords).toEqual(["layoffs", "funding"]);
    expect(parsed.ingestion.itemConcurrency).toBe(4);
    expect(parsed.modelApi.apiKey).toBe("sk-test");
    expect(parsed.modelApi.baseURL).toBe("https://example.com/v1");
    expect(parsed.modelApi.model).toBe("gpt-test");
  });

  it("falls back to defaults when config content is empty", () => {
    expect(parseRuntimeConfig(undefined).rssSources).toEqual(DEFAULT_SOURCE_CONFIGS);
    expect(parseRuntimeConfig("").rssSources).toEqual(DEFAULT_SOURCE_CONFIGS);
    expect(parseRuntimeConfig(undefined).blacklistKeywords).toEqual(DEFAULT_BLACKLIST_KEYWORDS);
    expect(parseRuntimeConfig(undefined).ingestion.itemConcurrency).toBe(3);
    expect(parseRuntimeConfig(undefined).modelApi.model).toBe("gpt-4.1-mini");
  });

  it("loads runtime config from a concrete file path", () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "infinitum-config-"));
    const configPath = path.join(tempDir, "infinitum.config.json");
    writeFileSync(
      configPath,
      JSON.stringify({
        rssSources: [
          {
            name: "Loaded Feed",
            rssUrl: "https://loaded.example.com/feed.xml",
            siteUrl: "https://loaded.example.com",
            enabled: true,
            fetchFullTextWhenMissing: true,
          },
        ],
        blacklistKeywords: ["crypto"],
        ingestion: {
          itemConcurrency: 2,
        },
        modelApi: {
          apiKey: "sk-loaded",
          baseURL: "",
          model: "gpt-loaded",
        },
      }),
      "utf8",
    );

    const loaded = loadRuntimeConfig({ configPath });

    expect(loaded.rssSources[0]?.name).toBe("Loaded Feed");
    expect(loaded.blacklistKeywords).toEqual(["crypto"]);
    expect(loaded.ingestion.itemConcurrency).toBe(2);
    expect(loaded.modelApi.apiKey).toBe("sk-loaded");

    rmSync(tempDir, { recursive: true, force: true });
  });

  it("resolves the default runtime config path under the config directory", () => {
    expect(resolveRuntimeConfigPath("/tmp/infinitum-app")).toBe(
      path.join("/tmp/infinitum-app", "config", "infinitum.config.json"),
    );
  });

  it("keeps ingestion concurrency in the example config file", () => {
    const exampleConfigPath = path.join(process.cwd(), "config", "infinitum.config.example.json");
    const parsed = JSON.parse(readFileSync(exampleConfigPath, "utf8")) as {
      ingestion?: { itemConcurrency?: number };
    };

    expect(parsed.ingestion?.itemConcurrency).toBe(3);
  });
});
