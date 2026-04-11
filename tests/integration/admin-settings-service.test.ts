import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db";
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

    expect(settings.sources).toHaveLength(1);
    expect(settings.blacklistKeywords).toEqual(["crypto", "layoffs"]);
    expect(settings.appConfig.modelApi.baseURL).toBe("https://example.com/v1");
    expect(settings.appConfig.modelApi.apiKeyMasked).toBe("••••••••rted");

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
});
