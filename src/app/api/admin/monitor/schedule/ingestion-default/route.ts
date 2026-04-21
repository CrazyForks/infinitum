import { z } from "zod";

import { getAdminErrorStatus } from "@/lib/admin/http";
import { requireAdmin } from "@/lib/admin/session";
import {
  MAX_FULL_TEXT_FETCH_THRESHOLD,
  MAX_SOURCE_CONCURRENCY,
  MIN_FULL_TEXT_FETCH_THRESHOLD,
  MIN_SOURCE_CONCURRENCY,
} from "@/lib/tasks/scheduler";
import { toTaskScheduleSnapshot, updateDefaultIngestionSchedule } from "@/lib/tasks/service";

const scheduleUpdateSchema = z.object({
  enabled: z.boolean(),
  cronExpression: z.string().trim().min(1),
  sourceConcurrency: z.number().int().min(MIN_SOURCE_CONCURRENCY).max(MAX_SOURCE_CONCURRENCY),
  fullTextFetchThreshold: z
    .number()
    .int()
    .min(MIN_FULL_TEXT_FETCH_THRESHOLD)
    .max(MAX_FULL_TEXT_FETCH_THRESHOLD),
});

export async function PATCH(request: Request) {
  try {
    await requireAdmin();
    const body = scheduleUpdateSchema.parse(await request.json());
    const schedule = await updateDefaultIngestionSchedule(body);

    return Response.json({
      schedule: toTaskScheduleSnapshot(schedule),
    });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Invalid request",
      },
      { status: getAdminErrorStatus(error) },
    );
  }
}
