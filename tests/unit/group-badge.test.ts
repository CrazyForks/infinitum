import { afterEach, describe, expect, it, vi } from "vitest";

import { generateUniqueGroupColor, getStableGroupBadgeColor, toGroupBadge } from "@/lib/groups/badge";

const ALL_PALETTE_COLORS = [
  "#3b82f6",
  "#14b8a6",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#06b6d4",
  "#22c55e",
  "#f97316",
];

describe("generateUniqueGroupColor", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns an HSL color string", () => {
    const color = generateUniqueGroupColor(new Set());

    expect(color).toMatch(/^hsl\(\d{1,3},\d{1,3}%,\d{1,3}%\)$/);
  });

  it("returns a color not present in the existing set", () => {
    const existing = new Set(["hsl(0,55%,45%)"]);

    // Force Math.random to always generate hsl(0,55%,45%) — which is excluded
    vi.spyOn(Math, "random").mockReturnValue(0);

    // Should skip all 100 attempted HSL values and fall back to first available palette color
    const color = generateUniqueGroupColor(existing);

    // Should be a palette color (not the excluded HSL one)
    expect(color).not.toBe("hsl(0,55%,45%)");
    expect(ALL_PALETTE_COLORS).toContain(color);
  });

  it("returns unique colors across multiple calls with real randomness", () => {
    // No mock — let real Math.random diversify the results
    const existing = new Set<string>();

    for (let i = 0; i < 50; i++) {
      const color = generateUniqueGroupColor(existing);
      expect(existing.has(color)).toBe(false);
      existing.add(color);
    }

    // All 50 colors should be distinct HSL strings
    expect(existing.size).toBe(50);
  });

  it("falls back to first palette color when everything is exhausted", () => {
    // Force every HSL attempt to hit hsl(0,55%,45%)
    vi.spyOn(Math, "random").mockReturnValue(0);

    // Include the forced HSL color and all 8 palette colors — everything is taken
    const existing = new Set(["hsl(0,55%,45%)", ...ALL_PALETTE_COLORS]);

    const color = generateUniqueGroupColor(existing);

    // Last resort: returns palette[0] even though it's a duplicate
    expect(color).toBe("#3b82f6");
  });

  it("generates colors within the expected HSL ranges", () => {
    // Many calls with real randomness to exercise the ranges
    for (let i = 0; i < 200; i++) {
      const color = generateUniqueGroupColor(new Set());
      const match = color.match(/^hsl\((\d{1,3}),(\d{1,3})%,(\d{1,3})%\)$/);

      expect(match).not.toBeNull();

      const hue = Number(match![1]);
      const saturation = Number(match![2]);
      const lightness = Number(match![3]);

      expect(hue).toBeGreaterThanOrEqual(0);
      expect(hue).toBeLessThan(360);
      expect(saturation).toBeGreaterThanOrEqual(55);
      expect(saturation).toBeLessThanOrEqual(70);
      expect(lightness).toBeGreaterThanOrEqual(45);
      expect(lightness).toBeLessThanOrEqual(55);
    }
  });
});

describe("toGroupBadge", () => {
  it("returns null for null/undefined input", () => {
    expect(toGroupBadge(null)).toBeNull();
    expect(toGroupBadge(undefined)).toBeNull();
  });

  it("uses stored color when available", () => {
    const badge = toGroupBadge({ id: "g1", name: "Test", color: "#ff0000" });

    expect(badge).toEqual({ id: "g1", name: "Test", color: "#ff0000" });
  });

  it("falls back to hash-based color when stored color is empty", () => {
    const badge = toGroupBadge({ id: "g1", name: "AI", color: "" });

    expect(badge?.color).toBe(getStableGroupBadgeColor("AI"));
  });

  it("falls back to hash-based color when color is not provided", () => {
    const badge = toGroupBadge({ id: "g1", name: "AI" });

    expect(badge?.color).toBe(getStableGroupBadgeColor("AI"));
  });
});

describe("getStableGroupBadgeColor", () => {
  it("returns consistent color for same name", () => {
    expect(getStableGroupBadgeColor("AI")).toBe(getStableGroupBadgeColor("AI"));
  });

  it("returns first palette color for empty name", () => {
    expect(getStableGroupBadgeColor("")).toBe("#3b82f6");
  });

  it("is case-insensitive and whitespace-insensitive", () => {
    expect(getStableGroupBadgeColor("  AI  ")).toBe(getStableGroupBadgeColor("ai"));
  });
});
