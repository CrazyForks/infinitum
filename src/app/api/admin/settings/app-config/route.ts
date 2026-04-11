import { z } from "zod";

import { getAdminErrorStatus } from "@/lib/admin/http";
import { requireAdmin } from "@/lib/admin/session";
import { updateAppConfig } from "@/lib/settings/service";

const appConfigSchema = z.object({
  ingestionItemConcurrency: z.number().int().min(1).max(10),
  modelApiBaseUrl: z.string(),
  modelApiModel: z.string().min(1),
  modelApiKey: z.string(),
  apiKeyMode: z.enum(["replace", "clear", "keep"]).default("keep"),
  itemAnalysisPrompt: z.string().min(1),
  clusterSummaryPrompt: z.string().min(1),
  clusterMatchPrompt: z.string().min(1),
});

export async function PUT(request: Request) {
  try {
    await requireAdmin();
    const body = appConfigSchema.parse(await request.json());

    await updateAppConfig(body);

    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Invalid request",
      },
      { status: getAdminErrorStatus(error) },
    );
  }
}
