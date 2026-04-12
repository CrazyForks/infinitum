import type { ScheduleUpdateInput } from "@/lib/tasks/types";

const MIN_INTERVAL_MINUTES = 5;
const MAX_INTERVAL_MINUTES = 24 * 60;

export function normalizeScheduleInput(input: ScheduleUpdateInput): ScheduleUpdateInput {
  return {
    enabled: input.enabled,
    intervalMinutes: Math.max(MIN_INTERVAL_MINUTES, Math.min(MAX_INTERVAL_MINUTES, Math.floor(input.intervalMinutes))),
  };
}

export function computeNextRunAt(input: { intervalMinutes: number; now: Date; anchor?: Date | null }) {
  const base = input.anchor ?? input.now;
  return new Date(base.getTime() + input.intervalMinutes * 60_000);
}

export function isSchedulerHeartbeatStale(input: { lastHeartbeatAt: Date | null; now: Date; maxAgeMs: number }) {
  if (!input.lastHeartbeatAt) {
    return true;
  }

  return input.now.getTime() - input.lastHeartbeatAt.getTime() > input.maxAgeMs;
}
