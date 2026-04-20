import { z } from "zod";

import { getAdminErrorStatus } from "@/lib/admin/http";
import { requireAdmin } from "@/lib/admin/session";
import { testModelApiConfig } from "@/lib/settings/service";

const testPayloadSchema = z.object({
  prompt: z.string().optional(),
  maxTokens: z.number().int().positive().optional(),
});

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    await requireAdmin();
    const { id } = await context.params;
    const body = testPayloadSchema.parse(await request.json().catch(() => ({})));

    return Response.json(await testModelApiConfig(id, body));
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Invalid request",
      },
      { status: getAdminErrorStatus(error) },
    );
  }
}
