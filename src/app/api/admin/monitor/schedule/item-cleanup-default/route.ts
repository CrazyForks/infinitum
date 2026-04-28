import { z } from "zod";

import { adminErrorResponse } from "@/lib/admin/http";
import { requireAdmin } from "@/lib/admin/session";
import {
  MAX_CLEANUP_RETENTION_DAYS,
  MIN_CLEANUP_RETENTION_DAYS,
} from "@/lib/tasks/scheduler";
import { toTaskScheduleSnapshot, updateDefaultItemCleanupSchedule } from "@/lib/tasks/service";

const scheduleUpdateSchema = z.object({
  enabled: z.boolean(),
  cronExpression: z.string().trim().min(1),
  cleanupRetentionDays: z
    .number()
    .int()
    .min(MIN_CLEANUP_RETENTION_DAYS)
    .max(MAX_CLEANUP_RETENTION_DAYS),
});

export async function PATCH(request: Request) {
  try {
    await requireAdmin();
    const body = scheduleUpdateSchema.parse(await request.json());
    const schedule = await updateDefaultItemCleanupSchedule(body);

    return Response.json({
      schedule: toTaskScheduleSnapshot(schedule),
    });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
