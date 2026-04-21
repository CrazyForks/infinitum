import { describe, expect, it } from "vitest";

import {
  computeNextRunAt,
  isSchedulerHeartbeatStale,
  normalizeScheduleInput,
} from "@/lib/tasks/scheduler";

describe("task scheduler", () => {
  it("computes the next run from the latest finished time", () => {
    const nextRunAt = computeNextRunAt({
      cronExpression: "*/30 * * * *",
      now: new Date("2026-04-12T00:00:00.000Z"),
      anchor: new Date("2026-04-12T00:10:00.000Z"),
      timezone: "Asia/Shanghai",
    });

    expect(nextRunAt.toISOString()).toBe("2026-04-12T00:30:00.000Z");
  });

  it("normalizes valid cron updates", () => {
    expect(
      normalizeScheduleInput({
        enabled: true,
        cronExpression: " */15 * * * * ",
        sourceConcurrency: 4,
        fullTextFetchThreshold: 120,
      }),
    ).toEqual({
      enabled: true,
      cronExpression: "*/15 * * * *",
      sourceConcurrency: 4,
      fullTextFetchThreshold: 120,
    });
  });

  it("marks stale heartbeats after the timeout window", () => {
    expect(
      isSchedulerHeartbeatStale({
        lastHeartbeatAt: new Date("2026-04-12T00:00:00.000Z"),
        now: new Date("2026-04-12T00:00:31.000Z"),
        maxAgeMs: 30_000,
      }),
    ).toBe(true);
  });
});
