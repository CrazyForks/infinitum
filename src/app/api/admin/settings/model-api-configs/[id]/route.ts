import { z } from "zod";

import { getAdminErrorStatus } from "@/lib/admin/http";
import { requireAdmin } from "@/lib/admin/session";
import {
  deleteModelApiConfig,
  getModelApiConfig,
  updateModelApiConfig,
} from "@/lib/settings/service";

const modelApiConfigSchema = z.object({
  name: z.string().min(1),
  baseUrl: z.string().min(1),
  apiKey: z.string(),
  apiKeyMode: z.enum(["replace", "clear", "keep"]).default("keep"),
  modelName: z.string().min(1),
  ingestionItemConcurrency: z.number().int().min(1).max(10),
  isEnabled: z.boolean(),
  isDefault: z.boolean(),
});

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    await requireAdmin();
    const { id } = await context.params;

    return Response.json(await getModelApiConfig(id));
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Invalid request",
      },
      { status: getAdminErrorStatus(error) },
    );
  }
}

export async function PUT(request: Request, context: RouteContext) {
  try {
    await requireAdmin();
    const { id } = await context.params;
    const body = modelApiConfigSchema.parse(await request.json());
    const config = await updateModelApiConfig(id, body);

    return Response.json({ config });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Invalid request",
      },
      { status: getAdminErrorStatus(error) },
    );
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    await requireAdmin();
    const { id } = await context.params;

    await deleteModelApiConfig(id);

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
