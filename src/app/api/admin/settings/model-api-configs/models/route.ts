import { z } from "zod";

import { getAdminErrorStatus } from "@/lib/admin/http";
import { requireAdmin } from "@/lib/admin/session";
import { fetchModelApiModels } from "@/lib/settings/service";

const fetchModelsSchema = z.object({
  baseUrl: z.string().min(1),
  apiKey: z.string().optional(),
  configId: z.string().optional(),
  apiKeyMode: z.enum(["replace", "clear", "keep"]).optional(),
});

export async function POST(request: Request) {
  try {
    await requireAdmin();
    const body = fetchModelsSchema.parse(await request.json());

    return Response.json(await fetchModelApiModels(body));
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Invalid request",
      },
      { status: getAdminErrorStatus(error) },
    );
  }
}
