import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const deletedStyleModulePaths = [
  "src/components/feed/feed-panel.module.css",
  "src/components/admin/admin.module.css",
] as const;

const legacyStyleModules = ["feed-panel.module.css", "admin.module.css"] as const;
const sourceRoot = path.join(process.cwd(), "src");

function listSourceFiles(directoryPath: string): string[] {
  const entries = readdirSync(directoryPath, { withFileTypes: true });

  return entries.flatMap((entry) => {
    const entryPath = path.join(directoryPath, entry.name);

    if (entry.isDirectory()) {
      return listSourceFiles(entryPath);
    }

    return entry.name.endsWith(".ts") || entry.name.endsWith(".tsx") ? [entryPath] : [];
  });
}

describe("legacy UI style module imports", () => {
  it.each(deletedStyleModulePaths)("keeps deleted style module absent: %s", (filePath) => {
    expect(existsSync(path.join(process.cwd(), filePath))).toBe(false);
  });

  it("does not reference removed CSS modules anywhere in src TypeScript sources", () => {
    const sourceFiles = listSourceFiles(sourceRoot);

    for (const filePath of sourceFiles) {
      const source = readFileSync(filePath, "utf8");

      for (const moduleName of legacyStyleModules) {
        expect(source).not.toContain(moduleName);
      }
    }
  });
});
