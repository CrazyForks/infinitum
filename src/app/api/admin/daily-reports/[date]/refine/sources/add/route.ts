import { z } from "zod";

import { adminErrorResponse } from "@/lib/admin/http";
import { requireAdmin } from "@/lib/admin/session";
import { normalizeDailyReportDate } from "@/lib/daily-report/date";
import { addDailyReportRefinementSources } from "@/lib/daily-report/service";

const addSchema = z.object({
  sessionId: z.string().trim().min(1),
  sourceKeys: z.array(z.string().trim().min(1)).min(1).max(20),
});

type RouteContext = {
  params: Promise<{ date: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    await requireAdmin();
    const { date: rawDate } = await context.params;
    const date = normalizeDailyReportDate(rawDate);
    const body = addSchema.parse(await request.json());
    const result = await addDailyReportRefinementSources({
      date,
      sessionId: body.sessionId,
      sourceKeys: body.sourceKeys,
    });

    return Response.json(result);
  } catch (error) {
    return adminErrorResponse(error);
  }
}
