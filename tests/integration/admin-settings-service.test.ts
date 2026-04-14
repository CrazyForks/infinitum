import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";
import * as settingsService from "@/lib/settings/service";
import {
  deleteSourceGroup,
  getAdminSettings,
  getIngestionRuntimeConfig,
} from "@/lib/settings/service";

describe("admin settings service", () => {
  beforeEach(async () => {
    await prisma.item.deleteMany();
    await prisma.fetchRun.deleteMany();
    await prisma.source.deleteMany();
    await prisma.sourceGroup.deleteMany();
    await prisma.blacklistKeyword.deleteMany();
    await prisma.appConfig.deleteMany();
  });

  it("imports runtime configuration from the JSON file when the database is empty", async () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "infinitum-admin-config-"));
    const configPath = path.join(tempDir, "infinitum.config.json");

    writeFileSync(
      configPath,
      JSON.stringify({
        rssSources: [
          {
            name: "Imported Feed",
            rssUrl: "https://imported.example.com/feed.xml",
            siteUrl: "https://imported.example.com",
            enabled: true,
            fetchFullTextWhenMissing: false,
          },
        ],
        blacklistKeywords: ["crypto", "layoffs"],
        ingestion: {
          itemConcurrency: 4,
        },
        modelApi: {
          apiKey: "sk-imported",
          baseURL: "https://example.com/v1",
          model: "gpt-imported",
        },
        prompts: {
          itemAnalysis: "导入的单条分析提示词",
          clusterSummary: "导入的聚合摘要提示词",
          clusterMatch: "导入的归组判定提示词",
        },
      }),
      "utf8",
    );

    const runtimeConfig = await getIngestionRuntimeConfig({ configPath });
    const settings = await getAdminSettings({ configPath });

    expect(runtimeConfig.rssSources).toHaveLength(1);
    expect(runtimeConfig.rssSources[0]?.name).toBe("Imported Feed");
    expect(runtimeConfig.blacklistKeywords).toEqual(["crypto", "layoffs"]);
    expect(runtimeConfig.ingestion.itemConcurrency).toBe(4);
    expect(runtimeConfig.modelApi.apiKey).toBe("sk-imported");
    expect(runtimeConfig.prompts.itemAnalysis).toBe("导入的单条分析提示词");
    expect(runtimeConfig.prompts.clusterSummary).toBe("导入的聚合摘要提示词");
    expect(runtimeConfig.prompts.clusterMatch).toBe("导入的归组判定提示词");

    expect(settings.sources).toHaveLength(1);
    expect(settings.blacklistKeywords).toEqual(["crypto", "layoffs"]);
    expect(settings.appConfig.modelApi.baseURL).toBe("https://example.com/v1");
    expect(settings.appConfig.modelApi.apiKeyMasked).toBe("••••••••rted");
    expect(settings.appConfig.prompts.itemAnalysis).toBe("导入的单条分析提示词");
    expect(settings.appConfig.prompts.clusterSummary).toBe("导入的聚合摘要提示词");
    expect(settings.appConfig.prompts.clusterMatch).toBe("导入的归组判定提示词");

    rmSync(tempDir, { recursive: true, force: true });
  });

  it("blocks deleting a group that still owns sources", async () => {
    const group = await prisma.sourceGroup.create({
      data: {
        name: "Core Sources",
      },
    });

    await prisma.source.create({
      data: {
        name: "Grouped Feed",
        rssUrl: "https://grouped.example.com/feed.xml",
        siteUrl: "https://grouped.example.com",
        enabled: true,
        fetchFullTextWhenMissing: true,
        groupId: group.id,
      },
    });

    await expect(deleteSourceGroup(group.id)).rejects.toThrow("Please move sources out of this group before deleting it.");
  });

  it("imports OPML sources into matching groups", async () => {
    const importSourcesFromOpml = (
      settingsService as typeof settingsService & {
        importSourcesFromOpml?: (opmlText: string, options?: unknown) => Promise<unknown>;
      }
    ).importSourcesFromOpml;

    expect(importSourcesFromOpml).toBeTypeOf("function");

    await importSourcesFromOpml!(
      `<?xml version="1.0" encoding="UTF-8"?>
      <opml version="2.0">
        <body>
          <outline text="AI">
            <outline
              text="Import Feed One"
              title="Import Feed One"
              type="rss"
              xmlUrl="https://feeds.example.com/one.xml"
              htmlUrl="https://feeds.example.com/one"
            />
          </outline>
          <outline text="Infra">
            <outline
              text="Import Feed Two"
              title="Import Feed Two"
              type="rss"
              xmlUrl="https://feeds.example.com/two.xml"
              htmlUrl="https://feeds.example.com/two"
            />
          </outline>
        </body>
      </opml>`,
      {
        resolveMetadata: async () => ({
          name: "Resolved Feed",
          rssUrl: "https://feeds.example.com/fallback.xml",
          siteUrl: "https://feeds.example.com",
        }),
      },
    );

    const groups = await prisma.sourceGroup.findMany({
      orderBy: { name: "asc" },
    });
    const sources = await prisma.source.findMany({
      include: { group: true },
      orderBy: { rssUrl: "asc" },
    });

    expect(groups.map((group) => group.name)).toEqual(["AI", "Infra"]);
    expect(sources).toHaveLength(2);
    expect(sources[0]).toMatchObject({
      rssUrl: "https://feeds.example.com/one.xml",
      name: "Import Feed One",
      siteUrl: "https://feeds.example.com/one",
      group: {
        name: "AI",
      },
    });
    expect(sources[1]).toMatchObject({
      rssUrl: "https://feeds.example.com/two.xml",
      name: "Import Feed Two",
      siteUrl: "https://feeds.example.com/two",
      group: {
        name: "Infra",
      },
    });
  });

  it("updates an existing source instead of duplicating it during OPML import", async () => {
    const importSourcesFromOpml = (
      settingsService as typeof settingsService & {
        importSourcesFromOpml?: (opmlText: string, options?: unknown) => Promise<unknown>;
      }
    ).importSourcesFromOpml;

    expect(importSourcesFromOpml).toBeTypeOf("function");

    await prisma.source.create({
      data: {
        name: "Old Feed Name",
        rssUrl: "https://feeds.example.com/existing.xml",
        siteUrl: "https://old.example.com",
        enabled: false,
        fetchFullTextWhenMissing: false,
      },
    });

    await importSourcesFromOpml!(
      `<?xml version="1.0" encoding="UTF-8"?>
      <opml version="2.0">
        <body>
          <outline text="Research">
            <outline
              text="Updated Feed Name"
              title="Updated Feed Name"
              type="rss"
              xmlUrl="https://feeds.example.com/existing.xml"
              htmlUrl="https://new.example.com"
            />
          </outline>
        </body>
      </opml>`,
      {
        resolveMetadata: async () => ({
          name: "Updated Feed Name",
          rssUrl: "https://feeds.example.com/existing.xml",
          siteUrl: "https://new.example.com",
        }),
      },
    );

    const sources = await prisma.source.findMany({
      include: { group: true },
    });

    expect(sources).toHaveLength(1);
    expect(sources[0]).toMatchObject({
      name: "Updated Feed Name",
      rssUrl: "https://feeds.example.com/existing.xml",
      siteUrl: "https://new.example.com/",
      enabled: true,
      fetchFullTextWhenMissing: true,
      group: {
        name: "Research",
      },
    });
  });

  it("resolves RSS metadata and falls back when feed metadata is incomplete", async () => {
    const resolveSourceMetadata = (
      settingsService as typeof settingsService & {
        resolveSourceMetadata?: (rssUrl: string, options?: unknown) => Promise<unknown>;
      }
    ).resolveSourceMetadata;

    expect(resolveSourceMetadata).toBeTypeOf("function");

    await expect(
      resolveSourceMetadata!("https://feeds.example.com/feed.xml", {
        parser: {
          parseURL: async () => ({
            title: "Metadata Feed",
            link: "https://site.example.com",
            items: [],
          }),
        },
      }),
    ).resolves.toMatchObject({
      name: "Metadata Feed",
      rssUrl: "https://feeds.example.com/feed.xml",
      siteUrl: "https://site.example.com/",
    });

    await expect(
      resolveSourceMetadata!("https://blog.example.com/rss.xml", {
        parser: {
          parseURL: async () => ({
            title: "",
            link: "",
            items: [],
          }),
        },
      }),
    ).resolves.toMatchObject({
      name: "blog.example.com",
      rssUrl: "https://blog.example.com/rss.xml",
      siteUrl: "https://blog.example.com/",
    });
  });
});
