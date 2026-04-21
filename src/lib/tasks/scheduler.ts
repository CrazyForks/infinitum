import { CronExpressionParser } from "cron-parser";

import type { ScheduleUpdateInput } from "@/lib/tasks/types";

export const DEFAULT_SCHEDULE_TIMEZONE = "Asia/Shanghai";
export const DEFAULT_SCHEDULE_CRON_EXPRESSION = "0 * * * *";
export const DEFAULT_SOURCE_CONCURRENCY = 2;
export const MIN_SOURCE_CONCURRENCY = 1;
export const MAX_SOURCE_CONCURRENCY = 10;

export function normalizeScheduleInput(input: ScheduleUpdateInput): ScheduleUpdateInput {
  const cronExpression = input.cronExpression.trim();

  if (!cronExpression) {
    throw new Error("Cron expression is required.");
  }

  CronExpressionParser.parse(cronExpression, {
    currentDate: new Date(),
    tz: DEFAULT_SCHEDULE_TIMEZONE,
  });

  if (
    !Number.isInteger(input.sourceConcurrency) ||
    input.sourceConcurrency < MIN_SOURCE_CONCURRENCY ||
    input.sourceConcurrency > MAX_SOURCE_CONCURRENCY
  ) {
    throw new Error(
      `Source concurrency must be an integer between ${MIN_SOURCE_CONCURRENCY} and ${MAX_SOURCE_CONCURRENCY}.`,
    );
  }

  return {
    enabled: input.enabled,
    cronExpression,
    sourceConcurrency: input.sourceConcurrency,
  };
}

export function computeNextRunAt(input: {
  cronExpression: string;
  now: Date;
  anchor?: Date | null;
  timezone?: string;
}) {
  const interval = CronExpressionParser.parse(input.cronExpression, {
    currentDate: input.anchor ?? input.now,
    tz: input.timezone ?? DEFAULT_SCHEDULE_TIMEZONE,
  });

  return interval.next().toDate();
}

export function isSchedulerHeartbeatStale(input: { lastHeartbeatAt: Date | null; now: Date; maxAgeMs: number }) {
  if (!input.lastHeartbeatAt) {
    return true;
  }

  return input.now.getTime() - input.lastHeartbeatAt.getTime() > input.maxAgeMs;
}
