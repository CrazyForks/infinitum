import { z } from "zod";

import { adminErrorResponse } from "@/lib/admin/http";
import { requireAdmin } from "@/lib/admin/session";
import { normalizeDailyReportDate } from "@/lib/daily-report/date";
import { saveDailyReportRefinementCandidate } from "@/lib/daily-report/service";

const saveSchema = z.object({
  sessionId: z.string().trim().min(1),
  messageId: z.string().trim().min(1).optional(),
});

type RouteContext = {
  params: Promise<{ date: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    await requireAdmin();
    const { date: rawDate } = await context.params;
    const date = normalizeDailyReportDate(rawDate);
    const body = saveSchema.parse(await request.json());
    const report = await saveDailyReportRefinementCandidate({
      date,
      sessionId: body.sessionId,
      messageId: body.messageId,
    });

    return Response.json({ saved: true, report });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
