import { z } from "zod";

import { adminErrorResponse } from "@/lib/admin/http";
import { requireAdmin } from "@/lib/admin/session";
import { toTaskScheduleSnapshot, updateDefaultDailyReportSchedule } from "@/lib/tasks/service";

const scheduleUpdateSchema = z.object({
  enabled: z.boolean(),
  cronExpression: z.string().trim().min(1),
  dailyReportCandidateLimit: z.number().int().min(2).max(500),
  dailyReportOffsetDays: z.number().int().min(0).max(365),
  dailyReportAutoPublish: z.boolean(),
});

export async function PATCH(request: Request) {
  try {
    await requireAdmin();
    const body = scheduleUpdateSchema.parse(await request.json());
    const schedule = await updateDefaultDailyReportSchedule(body);

    return Response.json({
      schedule: toTaskScheduleSnapshot(schedule),
    });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
