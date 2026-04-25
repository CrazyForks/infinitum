import { z } from "zod";

import { adminErrorResponse } from "@/lib/admin/http";
import { requireAdmin } from "@/lib/admin/session";
import { assertDailyReportDateIsNotFuture } from "@/lib/daily-report/date";
import { enqueueDailyReportGeneration } from "@/lib/daily-report/service";

const generateSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function POST(request: Request) {
  try {
    await requireAdmin();
    const body = generateSchema.parse(await request.json());
    const date = assertDailyReportDateIsNotFuture(body.date);
    const taskRun = await enqueueDailyReportGeneration(date, "manual");

    return Response.json({ taskRun }, { status: 202 });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
