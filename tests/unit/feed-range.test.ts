import { describe, expect, it, vi } from "vitest";

import { getRangeStart, isFeedRange, RANGE_OPTIONS } from "@/lib/feed/range";

describe("feed range helpers", () => {
  it("declares the supported feed ranges in UI order", () => {
    expect(RANGE_OPTIONS.map((option) => option.value)).toEqual([
      "today",
      "3d",
      "7d",
      "1m",
      "1y",
      "all",
    ]);
  });

  it("recognises valid feed range values", () => {
    expect(isFeedRange("7d")).toBe(true);
    expect(isFeedRange("all")).toBe(true);
    expect(isFeedRange("unknown")).toBe(false);
  });

  it("returns the start of the current day for today range", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-10T16:45:00.000Z"));

    expect(getRangeStart("today")?.toISOString()).toBe("2026-04-10T00:00:00.000Z");

    vi.useRealTimers();
  });

  it("returns relative timestamps for rolling ranges and null for all", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-10T16:45:00.000Z"));

    expect(getRangeStart("3d")?.toISOString()).toBe("2026-04-07T16:45:00.000Z");
    expect(getRangeStart("7d")?.toISOString()).toBe("2026-04-03T16:45:00.000Z");
    expect(getRangeStart("1m")?.toISOString()).toBe("2026-03-10T16:45:00.000Z");
    expect(getRangeStart("1y")?.toISOString()).toBe("2025-04-10T16:45:00.000Z");
    expect(getRangeStart("all")).toBeNull();

    vi.useRealTimers();
  });
});
