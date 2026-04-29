import { z } from "zod";

import { adminErrorResponse } from "@/lib/admin/http";
import { requireAdmin } from "@/lib/admin/session";
import { normalizeDailyReportDate } from "@/lib/daily-report/date";
import { searchDailyReportRefinementSources } from "@/lib/daily-report/service";

const searchSchema = z.object({
  sessionId: z.string().trim().min(1).optional(),
  query: z.string().trim().min(1).max(120),
  limit: z.number().int().min(1).max(20).optional(),
});

type RouteContext = {
  params: Promise<{ date: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    await requireAdmin();
    const { date: rawDate } = await context.params;
    const date = normalizeDailyReportDate(rawDate);
    const body = searchSchema.parse(await request.json());
    const result = await searchDailyReportRefinementSources({
      date,
      sessionId: body.sessionId,
      query: body.query,
      limit: body.limit,
    });

    return Response.json(result);
  } catch (error) {
    return adminErrorResponse(error);
  }
}
