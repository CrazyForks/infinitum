import { z } from "zod";

import { adminErrorResponse } from "@/lib/admin/http";
import { requireAdmin } from "@/lib/admin/session";
import { deleteSourceGroup, renameSourceGroup } from "@/lib/settings/service";

const updateGroupSchema = z.object({
  name: z.string().min(1),
});

export async function PATCH(request: Request, context: RouteContext<"/api/admin/settings/groups/[id]">) {
  try {
    await requireAdmin();
    const body = updateGroupSchema.parse(await request.json());
    const { id } = await context.params;
    const group = await renameSourceGroup(id, body.name);

    return Response.json({ group });
  } catch (error) {
    return adminErrorResponse(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext<"/api/admin/settings/groups/[id]">) {
  try {
    await requireAdmin();
    const { id } = await context.params;
    await deleteSourceGroup(id);

    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message.includes("move sources")) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    return adminErrorResponse(error);
  }
}
