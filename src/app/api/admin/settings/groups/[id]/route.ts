import { z } from "zod";

import { adminErrorResponse, getAdminErrorStatus, getErrorMessage } from "@/lib/admin/http";
import { AdminAuthError, requireAdmin } from "@/lib/admin/session";
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
    const message = getErrorMessage(error);
    const status =
      error instanceof AdminAuthError
        ? error.status
        : message.includes("move sources")
          ? 409
          : getAdminErrorStatus(error);

    return Response.json({ error: message }, { status });
  }
}
