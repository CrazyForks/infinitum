import { z } from "zod";

import { adminErrorResponse } from "@/lib/admin/http";
import { requireAdmin } from "@/lib/admin/session";
import { enqueueItemRegenerationTask } from "@/lib/items/service";

const regenerateSchema = z.object({
  target: z.enum(["translation", "summary"]),
});

export async function POST(request: Request, context: RouteContext<"/api/admin/items/[id]/regenerate">) {
  try {
    await requireAdmin();
    const body = regenerateSchema.parse(await request.json());
    const { id } = await context.params;
    const taskRun = await enqueueItemRegenerationTask(id, body.target);

    return Response.json({
      taskRun,
    }, { status: 202 });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
