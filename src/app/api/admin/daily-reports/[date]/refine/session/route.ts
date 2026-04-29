import { z } from "zod";

import { adminErrorResponse } from "@/lib/admin/http";
import { requireAdmin } from "@/lib/admin/session";
import { normalizeDailyReportDate } from "@/lib/daily-report/date";
import { discardDailyReportRefinementSession, getLatestDailyReportRefinementSession } from "@/lib/daily-report/service";

const discardSchema = z.object({
  sessionId: z.string().trim().min(1),
});

type RouteContext = {
  params: Promise<{ date: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    await requireAdmin();
    const { date: rawDate } = await context.params;
    const date = normalizeDailyReportDate(rawDate);
    const result = await getLatestDailyReportRefinementSession({ date });

    return Response.json(result);
  } catch (error) {
    return adminErrorResponse(error);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    await requireAdmin();
    const { date: rawDate } = await context.params;
    const date = normalizeDailyReportDate(rawDate);
    const body = discardSchema.parse(await request.json());
    const result = await discardDailyReportRefinementSession({
      date,
      sessionId: body.sessionId,
    });

    return Response.json(result);
  } catch (error) {
    return adminErrorResponse(error);
  }
}
